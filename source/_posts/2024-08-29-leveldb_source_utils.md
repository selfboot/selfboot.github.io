---
title: LevelDB 源码阅读：内存分配器、随机数生成、CRC32、整数编解码
tags:
  - C++
  - LevelDB
category: 源码剖析
toc: true
mathjax: true
description: 本文探讨了 LevelDB 中的核心工具组件实现，包括Arena内存分配器、Random随机数生成器、CRC32循环冗余校验和整数编解码工具。分析了这些组件的设计考量、实现细节和优化策略，展示了它们如何高效地支持LevelDB的各种操作。
date: 2024-08-29 20:36:37
---

LevelDB 中实现了不少 utils 工具，比如定制的内存分配器 Arena，随机数生成类 Random，实现中都会考虑到具体的使用场景，做了优化以及取舍，值得好好学习。本篇文章主要聊聊下面部分的实现：

- 内存管理 Arena，一个简单高效，适合 LevelDB 的内存分配管理器；
- 随机数 Random，一个不错的**线性同余伪随机生成**算法，用位运算替代取模优化了执行效率。
- CRC32 循环冗余校验，用于检测数据传输或存储过程中是否发生错误；
- 整数编、解码，用于将数字存储在字节流或者从字节流中解析数字。

此外，还有些 utils 组件比较复杂些，会放在单独的文章里聊，比如：

- [LevelDB 源码阅读：禁止对象被析构](https://selfboot.cn/2024/07/22/leveldb_source_nodestructor/) 讲在 C++中如何禁止某个对象被析构，以为这样做的原因。

<!-- more -->

## 内存管理 Arena 类

LevelDB **没有直接使用**系统默认的 malloc 来分配内存，也没有使用 tcmalloc 等第三方库来管理内存的分配和释放，而是自己实现了一个简单的内存分配器。这里的内存分配器可以说是**量身订制**，主要基于下面考虑：

1. 主要在 memtable 中使用，会有大量的分配，可能有很多小内存分配；
2. 统一回收时机，在 memtable 数据落磁盘后，会一并回收；

内存 memtable 的数据其实存储在 skiplist 中的。每次插入 key，就需要往 skiplist 中插入节点，这里节点使用的内存就是用 arena 来分配的。如果是小 key，这里会优先从当前 block 剩余内存中拿，不够的话才会走到分配逻辑。[Allocate](https://github.com/google/leveldb/blob/main/util/arena.h#L55) 的代码如下：

```cpp
inline char* Arena::Allocate(size_t bytes) {
  assert(bytes > 0);
  if (bytes <= alloc_bytes_remaining_) {
    char* result = alloc_ptr_;
    alloc_ptr_ += bytes;
    alloc_bytes_remaining_ -= bytes;
    return result;
  }
  return AllocateFallback(bytes);
}
```

通过系统调用分配内存的逻辑在 AllocateFallback 中，如果需要的内存大于 kBlockSize / 4，则按照实际需要分配。否则的话，就直接分配一个 block 的内存，然后更新使用情况。这里没有用完的内存余量，可以在下次分配内存的时候使用。如果不够下次需要的量，则重新走系统调用来分配。

```cpp
char* Arena::AllocateFallback(size_t bytes) {
  if (bytes > kBlockSize / 4) {
    // Object is more than a quarter of our block size.  Allocate it separately
    // to avoid wasting too much space in leftover bytes.
    char* result = AllocateNewBlock(bytes);
    return result;
  }

  // We waste the remaining space in the current block.
  alloc_ptr_ = AllocateNewBlock(kBlockSize);
  alloc_bytes_remaining_ = kBlockSize;

  char* result = alloc_ptr_;
  alloc_ptr_ += bytes;
  alloc_bytes_remaining_ -= bytes;
  return result;
}
```

这种方法可能会导致一些**内存浪费**，比如第一次使用 496 byte，实际会分配 4096 byte，剩余 3600 byte。然后下一次使用超过 3600 byte 的话，就会重新申请新的内存，上次分配剩余的 3600 byte 就会被浪费掉。虽然浪费了一定的内存使用率，不过整体代码比较简单，分配效率也比较高。这部分被浪费掉的内存，在 memtable 落磁盘后也会被重新回收掉。

顺便再提一下这里最后的内存回收，每次调用 `new []` 分配内存后，会把首地址放到 vector 中，然后在 Arena 类析构的时候，遍历拿出所有的内存块，统一进行释放。

```cpp
char* Arena::AllocateNewBlock(size_t block_bytes) {
  char* result = new char[block_bytes];
  blocks_.push_back(result);
  memory_usage_.fetch_add(block_bytes + sizeof(char*),
                          std::memory_order_relaxed);
  return result;
}
Arena::~Arena() {
  for (size_t i = 0; i < blocks_.size(); i++) {
    delete[] blocks_[i];
  }
}
```

此外这个类还提供了一个原子计数器 `memory_usage_`，统计这个类目前占用的内存大小。

## 随机数 Random 类

LevelDB 的 [util/random.h](https://github.com/google/leveldb/blob/main/util/random.h) 中实现了一个[伪随机数生成器(PRNG)](https://en.wikipedia.org/wiki/Pseudorandom_number_generator)类 Random，用在**跳表生成层高**等场景。这个随机数生成器是基于线性同余生成器（LCG）实现，随机数的生成公式如下：

```shell
seed_ = (seed_ * A) % M
```

根据同余理论，只要 A 和 M 被适当选取，那么上述递推公式将能生成一个周期为 M 的伪随机数序列，且这个序列中不会有重复的数(除了最初的值)。这里模数 M 的值 $ 2^{31}-1 $ 是一个常见的选择，因为它是一个**梅森素数（Mersenne prime）**，有利于生成具有良好周期性的随机序列。

构造函数接收一个 32 位无符号整数作为种子（seed_），并确保种子落在有效范围内（非 0 且不等于 2147483647L，即 $ 2^{31}-1 $）。这是因为种子的值直接影响随机数生成过程，而这两个特定的值（0 和 $ 2^{31}-1 $）在计算过程中会导致生成的序列失去随机性。

```cpp
  explicit Random(uint32_t s) : seed_(s & 0x7fffffffu) {
    // Avoid bad seeds.
    if (seed_ == 0 || seed_ == 2147483647L) {
      seed_ = 1;
    }
  }
```

生成随机数的代码很精简，如下（忽略原有注释）：

```cpp
  uint32_t Next() {
    static const uint32_t M = 2147483647L;  // 2^31-1
    static const uint64_t A = 16807;        // bits 14, 8, 7, 5, 2, 1, 0
    uint64_t product = seed_ * A;
    seed_ = static_cast<uint32_t>((product >> 31) + (product & M));
    if (seed_ > M) {
      seed_ -= M;
    }
    return seed_;
  }
```

首先是 `product = seed_ * A`，这里乘积 product 可能会超出 32 位的范围，为了**防止溢出**使用 uint64_t 来保持这个中间结果。顺便提醒下血泪的教训，**整数的加减乘除一定要考虑溢出场景，很多软件都有因为溢出导致的漏洞**。然后这里 product%M 模运算**用了位操作和加法来代替**，以提高计算效率。

这里主要是基于**模运算的分配律**：$ (a + b) \mod m = ((a \mod m) + (b \mod m)) \mod m $，将 product 分为 `product >> 31 + product & M`，因为 M = $ 2^{31}-1 $，这里的与运算取 product 的低31位。

除了基本的随机数生成，Random 类还提供了生成特定范围内随机数的 `Uniform()` 方法，以及概率性返回真或假的 `OneIn()` 方法和生成偏向小数的 `Skewed()` 方法，这些都是在特定场景下非常有用的工具函数。

Skewed 的实现比较有意思，首先从 [0, max_log] 范围内均匀选择一个基数 base，接着用 `Uniform(1 << base)` 返回 $ [0, 2^{base} - 1]$ 范围内的一个随机数。这里基数 base 的选择概率是均匀的，这意味着选择一个较小的 base（从而生成较小的随机数）与选择一个较大的 base（从而生成较大的随机数）的概率是相同的。然而，由于 base 的值越小，能生成的随机数的范围就越小，这自然导致了**函数倾向于生成较小的数值**。

```cpp
  // Skewed: pick "base" uniformly from range [0,max_log] and then
  // return "base" random bits.  The effect is to pick a number in the
  // range [0,2^max_log-1] with exponential bias towards smaller numbers.
  uint32_t Skewed(int max_log) { return Uniform(1 << Uniform(max_log + 1)); }
```

## CRC32 循环冗余校验

CRC（**Cyclic Redundancy Check，循环冗余检查**）是一种通过特定算法来计算数据的校验码的方法，广泛用于**网络通讯和数据存储系统**中以检测数据在传输或存储过程中是否发生错误。CRC32是一种常见的CRC算法，使用了一个32位的校验和。

CRC 的计算基于**多项式除法**，处理的数据被视为一个巨大的多项式，通过**这个多项式除以另一个预定义的“生成多项式”**，然后取余数作为输出的CRC值。CRC算法具有天然的**流式计算特性**，可以先计算消息的一部分的CRC，然后将这个结果作为下一部分计算的初始值（init_crc）。下面的 `Extend` 函数接受一个初始的 CRC 值（可能是之前数据块的CRC结果），然后计算加上新的数据块后的CRC值。这使得 LevelDB 能够在不断追加数据时连续计算CRC，而不需要每次都从头开始。

```cpp
// Return the crc32c of concat(A, data[0,n-1]) where init_crc is the
// crc32c of some string A.  Extend() is often used to maintain the
// crc32c of a stream of data.
uint32_t Extend(uint32_t init_crc, const char* data, size_t n);

// Return the crc32c of data[0,n-1]
inline uint32_t Value(const char* data, size_t n) { return Extend(0, data, n); }
```

[crc32c.cc](https://github.com/google/leveldb/blob/main/util/crc32c.cc) 中的实现比较比较复杂，涉及到查找表（table-driven approach）、数据对齐、和可能的硬件加速，具体的原理可以参考 [A PAINLESS GUIDE TO CRC ERROR DETECTION ALGORITHMS](http://www.ross.net/crc/download/crc_v3.txt)。其中**生成多项式**的选择对CRC算法的有效性和错误检测能力至关重要。生成多项式并不是随意选取的，它们通常通过数学和计算机模拟实验被设计出来，以确保最大化特定数据长度和特定应用场景下的错误检测能力，常见的生成多项式`0x04C11DB7` 就是在IEEE 802.3标准中为 CRC-32 算法选定的。

这里补充说下，CRC 只是用来**检测随机错误**，比如网络传输或者磁盘存储中某些比特位发生了翻转。它不是纠错校验码，只能检测到错误，并**不能纠正错误**。我们可以故意对内容进行篡改然后保证 CRC 结果一样，如果要防篡改，要用到更为复杂的加密哈希函数或者数字签名技术。

另外在 [crc32c.h](https://github.com/google/leveldb/blob/main/util/crc32c.h) 中还看到有一个 Mask，这里代码注释也写的很清楚了，如果数据本身包含CRC值，然后直接在包含CRC的数据上再次计算CRC，可能会降低CRC的错误检测能力。因此，LevelDB 对CRC值进行高低位交换后加上一个常数（kMaskDelta），来“掩码”原始的CRC值。这种变换后的CRC值可以存储在文件中，当要验证数据完整性时，使用 Unmask 函数将掩码后的CRC值转换回原始的CRC值，再与当前数据的CRC计算结果进行比较。

```cpp
// Return a masked representation of crc.
//
// Motivation: it is problematic to compute the CRC of a string that
// contains embedded CRCs.  Therefore we recommend that CRCs stored
// somewhere (e.g., in files) should be masked before being stored.
inline uint32_t Mask(uint32_t crc) {
  // Rotate right by 15 bits and add a constant.
  return ((crc >> 15) | (crc << 17)) + kMaskDelta;
}

// Return the crc whose masked representation is masked_crc.
inline uint32_t Unmask(uint32_t masked_crc) {
  uint32_t rot = masked_crc - kMaskDelta;
  return ((rot >> 17) | (rot << 15));
}
```

这里其实有个有意思的地方，原始 CRC32 值交换高 15 位后，加上常量后可能会大于 uint32_t 的最大值，**导致溢出**。**在 C++ 中，无符号整型的溢出行为是定义良好的，按照取模运算处理**。比如当前 crc 是 32767，这里移动后加上常量，结果是7021325016，按照 $ 2^{32} $ 取模后结果是 2726357720。而在 Unmask 中的减法操作，同样会溢出，C++中这里也是按照取模运算处理的。这里 $ 2726357720-kMaskDelta = -131072 $ 按照 $ 2^{32} $ 后结果是 4294836224，再交换高低位就拿到了原始 CRC 32767 了，所以**这里的溢出不会导致 bug 的哦**。

## 整数编、解码

LevelDB 中经常需要将数字存储在字节流或者从字节流中解析数字，比如 key 中存储长度信息，在批量写的任务中存储序列号等。在 [util/coding.h](https://github.com/google/leveldb/blob/main/util/coding.h) 中定义了一系列编码和解码的工具函数，方便在字节流中存储和解析数字。首先来看固定长度的编、解码，主要有下面几个函数：

```cpp
void PutFixed32(std::string* dst, uint32_t value);
void PutFixed64(std::string* dst, uint64_t value);
void EncodeFixed32(char* dst, uint32_t value);
void EncodeFixed64(char* dst, uint64_t value);
```

以 32 位的编码为例，`PutFixed32` 函数将一个 32 位的无符号整数 value 编码为 4 个字节，然后追加到 dst 字符串的末尾。`EncodeFixed32` 函数则将 value 编码为 4 个字节，存储到 dst 指向的内存中。PutFixed32 底层以 EncodeFixed32 为基础，只是将结果追加到了 dst 字符串中。

```cpp
inline void EncodeFixed32(char* dst, uint32_t value) {
  uint8_t* const buffer = reinterpret_cast<uint8_t*>(dst);

  // Recent clang and gcc optimize this to a single mov / str instruction.
  buffer[0] = static_cast<uint8_t>(value);
  buffer[1] = static_cast<uint8_t>(value >> 8);
  buffer[2] = static_cast<uint8_t>(value >> 16);
  buffer[3] = static_cast<uint8_t>(value >> 24);
}
```

首先通过 `reinterpret_cast<uint8_t*>(dst)` 将 `char*` 类型的指针转换为 `uint8_t*` 类型，使得后续可以直接操作单个字节。然后使用位移和掩码操作将 value 的每一个字节分别写入到 buffer 数组中，**value 的低位字节存储在低地址中（小端序）**。假设我们有一个 uint32_t 的数值 0x12345678（十六进制表示），我们想将这个值编码到一个字符数组中，然后再从数组中解码出来。

- buffer[0] 存储 value 的最低8位，即 0x78。
- buffer[1] 存储 value 的次低8位，即 0x56。
- buffer[2] 存储 value 的次高8位，即 0x34。
- buffer[3] 存储 value 的最高8位，即 0x12。

编码完之后，dst 中的内容将是：`78 56 34 12`。解码的过程就是将这 4 个字节按照相反的顺序组合起来，得到原始的 value 值。

```cpp
inline uint32_t DecodeFixed32(const char* ptr) {
  const uint8_t* const buffer = reinterpret_cast<const uint8_t*>(ptr);

  // Recent clang and gcc optimize this to a single mov / ldr instruction.
  return (static_cast<uint32_t>(buffer[0])) |
         (static_cast<uint32_t>(buffer[1]) << 8) |
         (static_cast<uint32_t>(buffer[2]) << 16) |
         (static_cast<uint32_t>(buffer[3]) << 24);
}
```

除了将整数编码为固定长度的字节，LevelDB 还支持使用变长整数（Varint）编码来存储数字。因为很多时候，需要存的是范围很广但常常偏小的值，这时候都用 4 个字节来存储整数有点浪费。Varint 是一种高效的数据压缩方法，小的数值占用的字节少，可以节省空间。

Varint 原理很简单，使用一个或多个字节来存储整数的方法，其中**每个字节的最高位（第8位）用来表示是否还有更多的字节**。如果这一位是1，表示后面还有字节；如果是0，表示这是最后一个字节。剩下的7位用来存储实际的数字值。下图展示了从一个到三个字节的 varint 编码（更多字节类似，这里不列出）：

数值范围      | Varint 字节表达式
--------------|---------------------------------
1-127         | 0xxxxxxx
128-16383     | 1xxxxxxx 0xxxxxxx
16384-2097151 | 1xxxxxxx 1xxxxxxx 0xxxxxxx

具体实现中，EncodeVarint32 和 EncodeVarint64 略有不同，32 位的直接先判断需要的字节数，然后硬编码写入。64 位的则是循环写入，每次处理 7 位，直到数值小于 128。

```cpp
char* EncodeVarint64(char* dst, uint64_t v) {
  static const int B = 128;
  uint8_t* ptr = reinterpret_cast<uint8_t*>(dst);
  while (v >= B) {
    *(ptr++) = v | B;
    v >>= 7;
  }
  *(ptr++) = static_cast<uint8_t>(v);
  return reinterpret_cast<char*>(ptr);
}
```

当然，这里是编码，对应有从字节流中解码出 Varint 的实现。主要实现如下：

```cpp
const char* GetVarint64Ptr(const char* p, const char* limit, uint64_t* value) {
  uint64_t result = 0;
  for (uint32_t shift = 0; shift <= 63 && p < limit; shift += 7) {
    uint64_t byte = *(reinterpret_cast<const uint8_t*>(p));
    p++;
    if (byte & 128) {
      // More bytes are present
      result |= ((byte & 127) << shift);
    } else {
      result |= (byte << shift);
      *value = result;
      return reinterpret_cast<const char*>(p);
    }
  }
  return nullptr;
}
```

这里是编码的逆过程，成功解码一个整数后，它会返回一个新的指针，指向字节流中紧跟着解码整数之后的位置。GetVarint64 函数用这个实现，从 input 中解析出一个 64 位整数后，还更新了 input 的状态，**使其指向剩余未处理的数据**。这里更新字节流，对于连续处理数据流中的多个数据项非常有用，例如在解析由多个 varint 编码的整数组成的数据流时，每次调用 GetVarint64 后，input 都会更新，准备好解析下一个整数。

这里还一类辅助函数，比如 PutLengthPrefixedSlice 用于将一个字符串编码为一个长度前缀和字符串内容的组合，而 GetLengthPrefixedSlice 则是对应的解码函数。这些编码和解码函数在 LevelDB 中被广泛应用，用于存储和解析各种数据结构，比如 memtable 中的 key 和 value，SSTable 文件的 block 数据等。

这里整数的编、解码配有大量的测试用例，放在 [util/coding_test.cc](https://github.com/google/leveldb/blob/main/util/coding_test.cc) 中。里面有正常的编码和校对测试，比如 0 到 100000 的 Fixed32 的编、解码校验。此外还有一些**异常测试**，比如错误的 Varint32 的解码用例 Varint32Overflow，用 GetVarint32Ptr 来解码 "\x81\x82\x83\x84\x85\x11"。

## 总结

LevelDB 中的 utils 组件都是为了更好的适应 LevelDB 的使用场景，比如 Arena 内存分配器适合 memtable 的大量小内存分配，Random 随机数生成器用于跳表的层高生成，CRC32 用于数据传输或存储过程中的错误检测，编解码工具函数用于存储和解析数字。

本文只是简单介绍这些组件的实现，并没有过多涉及这些组件背后的数学知识，比如随机数生成器的线性同余算法、CRC32 的多项式除法等。有兴趣的话，大家可以继续深入研究。