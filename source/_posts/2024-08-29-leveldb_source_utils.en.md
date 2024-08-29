---
title: LevelDB Explained - Arena, Random, CRC32, and More.
tags:
  - C++
  - LevelDB
category: Source Code Analysis
toc: true
mathjax: true
description: This article explores the implementation of core utility components in LevelDB, including the Arena memory allocator, Random number generator, CRC32 cyclic redundancy check, and integer encoding/decoding tools. It analyzes the design considerations, implementation details, and optimization strategies of these components, demonstrating how they efficiently support various operations in LevelDB.
date: 2024-08-29 20:36:37
---

LevelDB implements several utility tools, such as the custom memory allocator Arena and the random number generation class Random. These implementations consider specific use cases, making optimizations and trade-offs that are worth studying. This article will mainly discuss the implementation of the following parts:

- Memory management Arena, a simple and efficient memory allocation manager suitable for LevelDB;
- Random number generator Random, a good **linear congruential pseudorandom generation** algorithm that uses bitwise operations instead of modulo to optimize execution efficiency.
- CRC32 cyclic redundancy check, used to detect errors during data transmission or storage;
- Integer encoding and decoding, used to store numbers in byte streams or parse numbers from byte streams.

In addition, there are some more complex utils components that will be discussed in separate articles, such as:

- [LevelDB Source Code Reading: Preventing Object Destruction](https://selfboot.cn/en/2024/07/22/leveldb_source_nodestructor/) discusses how to prevent an object from being destructed in C++ and the reasons for doing so.

<!-- more -->

## Memory Management Arena

LevelDB **does not directly use** the system's default malloc to allocate memory, nor does it use third-party libraries like tcmalloc to manage memory allocation and deallocation. Instead, it implements a simple memory allocator of its own. This memory allocator can be said to be **tailor-made**, mainly based on the following considerations:

1. Primarily used in memtable, there will be a large number of allocations, possibly many small memory allocations;
2. Unified recovery timing, all memory will be reclaimed together after the memtable data is written to disk;

The data in the memory memtable is actually stored in a skiplist. Each time a key is inserted, a node needs to be inserted into the skiplist, and the memory used by these nodes is allocated by arena. For small keys, it will prioritize taking from the remaining memory of the current block, and only go to the allocation logic if there's not enough. The code for [Allocate](https://github.com/google/leveldb/blob/main/util/arena.h#L55) is as follows:

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

The logic for allocating memory through system calls is in AllocateFallback. If the required memory is greater than kBlockSize / 4, it allocates according to the actual need. Otherwise, it directly allocates memory for one block and then updates the usage. The unused memory remaining here can be used the next time memory is allocated. If it's not enough for the next required amount, it will again go through system calls to allocate.

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

This method may lead to some **memory waste**. For example, if 496 bytes are used the first time, it will actually allocate 4096 bytes, leaving 3600 bytes. Then if more than 3600 bytes are used the next time, it will allocate new memory, wasting the remaining 3600 bytes from the last allocation. Although this wastes some memory usage, the overall code is relatively simple, and the allocation efficiency is quite high. This wasted memory will also be reclaimed when the memtable is written to disk.

By the way, let's mention the final memory reclamation here. Each time `new []` is called to allocate memory, the starting address is placed in a vector, and then when the Arena class is destructed, all memory blocks are retrieved by traversing and uniformly released.

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

In addition, this class also provides an atomic counter `memory_usage_`, which keeps track of the amount of memory currently occupied by this class.

## Random Number Generator

LevelDB's [util/random.h](https://github.com/google/leveldb/blob/main/util/random.h) implements a [Pseudorandom Number Generator (PRNG)](https://en.wikipedia.org/wiki/Pseudorandom_number_generator) class Random, used in scenarios such as **generating skip list height**. This random number generator is implemented based on a linear congruential generator (LCG), with the following formula for generating random numbers:

```shell
seed_ = (seed_ * A) % M
```

According to congruence theory, as long as A and M are appropriately chosen, the above recursive formula will be able to generate a pseudorandom number sequence with a period of M, and there will be no repeated numbers in this sequence (except for the initial value). The modulus M value of $ 2^{31}-1 $ here is a common choice because it is a **Mersenne prime**, which is conducive to generating random sequences with good periodicity.

The constructor takes a 32-bit unsigned integer as a seed (seed_) and ensures that the seed falls within a valid range (non-zero and not equal to 2147483647L, i.e., $ 2^{31}-1 $). This is because the value of the seed directly affects the random number generation process, and these two specific values (0 and $ 2^{31}-1 $) would cause the generated sequence to lose randomness in the calculation process.

```cpp
  explicit Random(uint32_t s) : seed_(s & 0x7fffffffu) {
    // Avoid bad seeds.
    if (seed_ == 0 || seed_ == 2147483647L) {
      seed_ = 1;
    }
  }
```

The code for generating random numbers is very concise, as follows (ignoring the original comments):

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

First, `product = seed_ * A`, where the product might exceed the range of 32 bits. To **prevent overflow**, uint64_t is used to hold this intermediate result. As a reminder of a painful lesson, **integer addition, subtraction, multiplication, and division must always consider overflow scenarios; many software vulnerabilities are caused by overflow**. Then, the modulo operation product%M here **uses bitwise operations and addition to replace** it, to improve computational efficiency.

This is mainly based on the **distributive property of modulo operations**: $ (a + b) \mod m = ((a \mod m) + (b \mod m)) \mod m $, dividing product into `product >> 31 + product & M`, because M = $ 2^{31}-1 $, the AND operation here takes the lower 31 bits of product.

In addition to basic random number generation, the Random class also provides methods like `Uniform()` for generating random numbers within a specific range, `OneIn()` for probabilistically returning true or false, and `Skewed()` for generating numbers biased towards smaller values. These are all very useful utility functions in specific scenarios.

The implementation of Skewed is quite interesting. It first uniformly selects a base from the range [0, max_log], then uses `Uniform(1 << base)` to return a random number in the range $ [0, 2^{base} - 1]$. The probability of selecting the base here is uniform, which means that choosing a smaller base (thus generating smaller random numbers) has the same probability as choosing a larger base (thus generating larger random numbers). However, since the smaller the value of base, the smaller the range of random numbers that can be generated, this naturally leads to the **function tending to generate smaller values**.

```cpp
  // Skewed: pick "base" uniformly from range [0,max_log] and then
  // return "base" random bits.  The effect is to pick a number in the
  // range [0,2^max_log-1] with exponential bias towards smaller numbers.
  uint32_t Skewed(int max_log) { return Uniform(1 << Uniform(max_log + 1)); }
```

## CRC32 

CRC (**Cyclic Redundancy Check**) is a method of calculating a check code for data through a specific algorithm, widely used in **network communication and data storage systems** to detect whether errors occurred during data transmission or storage. CRC32 is a common CRC algorithm that uses a 32-bit checksum.

The calculation of CRC is based on **polynomial division**, where the processed data is viewed as a huge polynomial, **divided by another predefined "generator polynomial"**, and then the remainder is taken as the output CRC value. The CRC algorithm has a natural **streaming calculation characteristic**, allowing for the CRC of part of a message to be calculated first, and then using this result as the initial value (init_crc) for the calculation of the next part. The following `Extend` function accepts an initial CRC value (which could be the CRC result of a previous data block) and then calculates the CRC value after adding the new data block. This allows LevelDB to continuously calculate CRC as data is appended, without needing to start from the beginning each time.

```cpp
// Return the crc32c of concat(A, data[0,n-1]) where init_crc is the
// crc32c of some string A.  Extend() is often used to maintain the
// crc32c of a stream of data.
uint32_t Extend(uint32_t init_crc, const char* data, size_t n);

// Return the crc32c of data[0,n-1]
inline uint32_t Value(const char* data, size_t n) { return Extend(0, data, n); }
```

The implementation in [crc32c.cc](https://github.com/google/leveldb/blob/main/util/crc32c.cc) is quite complex, involving lookup tables (table-driven approach), data alignment, and possible hardware acceleration. The specific principles can be referred to in [A PAINLESS GUIDE TO CRC ERROR DETECTION ALGORITHMS](http://www.ross.net/crc/download/crc_v3.txt). The choice of **generator polynomial** is crucial to the effectiveness and error detection capability of the CRC algorithm. Generator polynomials are not arbitrarily chosen; they are typically designed through mathematical and computer simulation experiments to ensure maximum error detection capability for specific data lengths and application scenarios. The common generator polynomial `0x04C11DB7` was selected for the CRC-32 algorithm in the IEEE 802.3 standard.

It's worth adding that CRC is only used to **detect random errors**, such as bit flips in network transmission or disk storage. It is not an error-correcting code; it can only detect errors and **cannot correct errors**. We can deliberately tamper with the content and ensure the same CRC result. If protection against tampering is needed, more complex cryptographic hash functions or digital signature techniques must be used.

Additionally, in [crc32c.h](https://github.com/google/leveldb/blob/main/util/crc32c.h), we see a Mask. The code comments explain this clearly: if the data itself contains CRC values, then directly calculating CRC on data that includes CRC might reduce the error detection capability of CRC. Therefore, LevelDB "masks" the original CRC value by swapping the high and low bits and adding a constant (kMaskDelta). This transformed CRC value can be stored in files. When verifying data integrity, the Unmask function is used to convert the masked CRC value back to the original CRC value, which is then compared with the CRC calculation result of the current data.

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

There's an interesting point here: after swapping the high 15 bits of the original CRC32 value and adding a constant, it might exceed the maximum value of uint32_t, **causing overflow**. **In C++, the overflow behavior of unsigned integers is well-defined and handled as modulo operation**. For example, if the current crc is 32767, after shifting and adding the constant, the result is 7021325016, which becomes 2726357720 after taking modulo $ 2^{32} $. The subtraction operation in Unmask will also overflow, which is handled as a modulo operation in C++ as well. Here, $ 2726357720-kMaskDelta = -131072 $ becomes 4294836224 after taking modulo $ 2^{32} $, and after swapping the high and low bits, we get back the original CRC 32767. So **the overflow here won't cause any bugs**.

## Integer Encoding and Decoding

LevelDB often needs to store numbers in byte streams or parse numbers from byte streams, such as storing length information in keys or sequence numbers in batch write tasks. In [util/coding.h](https://github.com/google/leveldb/blob/main/util/coding.h), a series of encoding and decoding utility functions are defined to facilitate storing and parsing numbers in byte streams. First, let's look at fixed-length encoding and decoding, which mainly includes the following functions:

```cpp
void PutFixed32(std::string* dst, uint32_t value);
void PutFixed64(std::string* dst, uint64_t value);
void EncodeFixed32(char* dst, uint32_t value);
void EncodeFixed64(char* dst, uint64_t value);
```

Taking 32-bit encoding as an example, the `PutFixed32` function encodes a 32-bit unsigned integer value into 4 bytes and then appends it to the end of the dst string. The `EncodeFixed32` function encodes value into 4 bytes and stores them in the memory pointed to by dst. PutFixed32 is based on EncodeFixed32 at the bottom layer, but it appends the result to the dst string.

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

First, `reinterpret_cast<uint8_t*>(dst)` converts the `char*` type pointer to a `uint8_t*` type, allowing direct manipulation of individual bytes. Then, using shift and mask operations, each byte of value is written into the buffer array separately, with **value's low-order bytes stored at low addresses (little-endian)**. Suppose we have a uint32_t value 0x12345678 (in hexadecimal), and we want to encode this value into a character array and then decode it back from the array.

- buffer[0] stores the lowest 8 bits of value, i.e., 0x78.
- buffer[1] stores the second lowest 8 bits of value, i.e., 0x56.
- buffer[2] stores the second highest 8 bits of value, i.e., 0x34.
- buffer[3] stores the highest 8 bits of value, i.e., 0x12.

After encoding, the content in dst will be: `78 56 34 12`. The decoding process is to combine these 4 bytes in the reverse order to obtain the original value.

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

In addition to encoding integers as fixed-length bytes, LevelDB also supports using variable-length integer (Varint) encoding to store numbers. This is because often, the values that need to be stored have a wide range but are frequently small, and using 4 bytes to store all integers would be wasteful. Varint is an efficient data compression method where smaller values occupy fewer bytes, saving space.

The principle of Varint is simple: it uses one or more bytes to store integers, where **the highest bit (8th bit) of each byte is used to indicate whether there are more bytes**. If this bit is 1, it means there are more bytes; if it's 0, it means this is the last byte. The remaining 7 bits are used to store the actual numeric value. The following table shows the Varint encoding from one to three bytes (more bytes follow a similar pattern, not listed here):

Value Range    | Varint Byte Expression
---------------|--------------------------------
1-127          | 0xxxxxxx
128-16383      | 1xxxxxxx 0xxxxxxx
16384-2097151  | 1xxxxxxx 1xxxxxxx 0xxxxxxx

In the specific implementation, EncodeVarint32 and EncodeVarint64 differ slightly. The 32-bit version first determines the number of bytes needed and then hard-codes the writing. The 64-bit version uses a loop to write, processing 7 bits each time until the value is less than 128.

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

Of course, this is encoding, and there's a corresponding implementation for decoding Varint from byte streams. The main implementation is as follows:

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

This is the reverse process of encoding. After successfully decoding an integer, it returns a new pointer pointing to the position in the byte stream immediately following the decoded integer. The GetVarint64 function uses this implementation. After parsing a 64-bit integer from input, it also updates the state of input, **making it point to the remaining unprocessed data**. Updating the byte stream here is very useful for continuously processing multiple data items in a data stream, for example, when parsing a data stream composed of multiple Varint-encoded integers, input is updated after each call to GetVarint64, ready to parse the next integer.

There's also a class of helper functions, such as PutLengthPrefixedSlice for encoding a string as a combination of a length prefix and string content, and GetLengthPrefixedSlice as the corresponding decoding function. These encoding and decoding functions are widely used in LevelDB for storing and parsing various data structures, such as keys and values in memtable, block data in SSTable files, etc.

The integer encoding and decoding here are accompanied by a large number of test cases, placed in [util/coding_test.cc](https://github.com/google/leveldb/blob/main/util/coding_test.cc). There are normal encoding and verification tests, such as Fixed32 encoding and decoding verification for 0 to 100000. In addition, there are some **abnormal tests**, such as the Varint32Overflow decoding case for incorrect Varint32, using GetVarint32Ptr to decode "\x81\x82\x83\x84\x85\x11".

## Conclusion

The utils components in LevelDB are all designed to better adapt to LevelDB's usage scenarios. For example, the Arena memory allocator is suitable for a large number of small memory allocations in memtable, the Random number generator is used for generating skip list heights, CRC32 is used for error detection during data transmission or storage, and encoding/decoding utility functions are used for storing and parsing numbers.

This article only briefly introduces the implementation of these components and doesn't delve too much into the mathematical knowledge behind these components, such as the linear congruential algorithm of the random number generator and the polynomial division of CRC32. If you're interested, you can continue to explore these topics in depth.