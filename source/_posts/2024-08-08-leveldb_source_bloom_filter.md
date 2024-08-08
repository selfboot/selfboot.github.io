---
title: LevelDB 源码阅读：布隆过滤器原理、实现、测试与可视化
tags:
  - C++
  - LevelDB
category: 源码剖析
toc: true
mathjax: true
date: 2024-08-08 11:38:52
description: 文章详细介绍了布隆过滤器的基本概念、数学原理和参数选择，并分析了LevelDB源码中的具体实现，包括哈希函数选择、过滤器创建和查询过程。同时展示了LevelDB的布隆过滤器测试用例，验证其正确性和性能。文章还提供了布隆过滤器的可视化演示，帮助读者直观理解其工作原理。
---

LevelDB 中数据存储在 SSTable 文件中，当用 Get() 来查询 key 的时候，可能需要从 SST 文件中读取多个块。为了减少磁盘读取，LevelDB 提供了 FilterPolicy 过滤策略，如果判断出来一个 Key 不在当前 SSTable 文件中，那么就可以跳过读取该文件，从而提高查询效率。

LevelDB 支持用户自定义过滤策略，不过提供了一个默认的布隆过滤器实现。布隆过滤器是一种空间效率极高的数据结构，用于判断一个元素是否存在于一个集合中，有一定的误判率但没有漏判。简单说就是如果**布隆过滤器判断一个元素不存在，那么这个元素一定不存在；如果布隆过滤器判断一个元素存在，那么这个元素可能不存在**。

<!-- more -->

在 LevelDB 中使用布隆过滤器也比较简单，如下代码：

```cpp
leveldb::Options options;
options.filter_policy = NewBloomFilterPolicy(10);
leveldb::DB* db;
leveldb::DB::Open(options, "/tmp/testdb", &db);
// ... use the database ...
delete db;
delete options.filter_policy;
```

那么布隆过滤器的原理是什么？LevelDB 中又是怎么实现的呢？本文一起来看看。

## LevelDB 接口定义

在开始布隆过滤器的实现细节之前，先来看看 LevelDB 中对过滤器接口的定义。

LevelDB 在 [filter_policy.h](https://github.com/google/leveldb/blob/main/include/leveldb/filter_policy.h) 中**定义了过滤策略的接口**。FilterPolicy 本身是一个抽象类，定义了 3 个纯虚函数作为接口，它不能直接实例化，而是必须由子类实现。

```cpp
class LEVELDB_EXPORT FilterPolicy {
 public:
  virtual ~FilterPolicy();

  virtual const char* Name() const = 0;

  virtual void CreateFilter(const Slice* keys, int n,
                            std::string* dst) const = 0;

  virtual bool KeyMayMatch(const Slice& key, const Slice& filter) const = 0;
};
```

这 3 个接口都比较重要，代码里注释也写的非常详细，其中：

- Name(): 返回过滤策略的名称，**对于版本兼容性非常重要**。如果过滤策略的实现（即数据结构或算法）改变了，可能导致与旧版本不兼容，那么返回的名称应该反映这种改变，以防止旧的过滤策略被错误地使用。
- CreateFilter(): 用于创建一个过滤器，即将 keys 中的所有 key 添加到过滤器中，然后将内容保存在 dst 中。
- KeyMayMatch(): 用于判断 key 是否存在于过滤器中，这里的 filter 是 CreateFilter() 生成的 dst。如果 key 存在于过滤器中，那么一定要返回 true。**如果不存在，那么可以返回 true，也可以返回 false，但是要保证返回 false 的概率要尽可能高**。

此外还提供了一个工厂函数，用于创建一个布隆过滤器实例。不过有个缺点就是使用完返回的过滤策略实例后，需要记得手动释放资源。这里使用工厂函数，**允许库的维护者在不影响现有客户端代码的情况下更改对象的创建过程**。例如，如果未来开发了一个更高效的布隆过滤器实现，**可以简单地修改工厂函数以返回新的实现，而无需修改调用它的代码。这为将来的扩展和维护提供了便利**。

```cpp
LEVELDB_EXPORT const FilterPolicy* NewBloomFilterPolicy(int bits_per_key);
```

这里通过定义过滤策略接口和使用工厂函数，可以方便开发者实现不同的过滤策略。要实现一个新的过滤策略，只用继承 `FilterPolicy` 类，并实现相应的方法即可。对于调用方来说，只需要将新的过滤策略传递给 `Options` 对象即可，整体改动会比较简单。

## 布隆过滤器原理

LevelDB 自己实现了一个布隆过滤器，作为默认的过滤策略。在开始看实现代码之前，先大致了解下布隆过滤器的原理。

1970 年布顿·霍华德·布隆（Burton Howard Bloom）为了在拼写检查器中检查一个英语单词是否在字典里，创建了[布隆过滤器](https://en.wikipedia.org/wiki/Bloom_filter)这个高效的数据结构。它的核心是一个 m 位的位数组和 k 个哈希函数，核心操作如下：

1. 初始化：开始时，布隆过滤器是一个包含 m 位的数组，每一位都设置为 0。
2. 添加元素：将某个元素添加到布隆过滤器中时，首先使用 k 个哈希函数对元素进行哈希处理，产生 k 个数组位置索引，然后将这些位置的位都设置为 1。
3. 查询元素：要检查一个元素是否在布隆过滤器中，也用相同的 k 个哈希函数对该元素进行哈希，得到 k 个索引。如果所有这些索引对应的位都是 1，那么**元素可能存在于集合中**；如果任何一个位是 0，则**元素绝对不在集合中**。

通过上面的描述，可以发现添加或检查元素是否在集合中所需的时间是固定常数$ O( k )$，完全独立于集合中已有的元素数量。和其他表示集合的数据结构，比如 hash 表、平衡二叉树、跳表等相比，除了查找速度快，布隆过滤器的空间效率也非常高，它不需要存储元素本身，可以节省不少空间。

不过布隆过滤器也是有缺点的，仔细思考上面过程可以发现，**布隆过滤器的查询结果有可能是误判的**。布隆过滤器使用多个哈希函数对每个元素进行处理，将多个结果位置的位设置为 1，**这些位置可能与其他元素的哈希结果重叠**。假设有个 key 并不存在于集合中，但是它的哈希结果与其他元素的哈希结果重叠，那么布隆过滤器就会判断这个 key 存在于集合中，这就是所谓的假阳性（False Positive）。

当一个元素并不在集合中时，布隆过滤器错误地判定其存在的概率，就是假阳性率（false positive rate）。直观感觉上的话，**对于固定的 k 个哈希函数，数组位数 m 越大，那么哈希碰撞越少，假阳性率就越低**。为了设计一个良好的布隆过滤器，保证很低的假阳性率，上面的定性分析并不够，需要进行数学推导来定量分析。

### 数学推导

这里先简单推导一下布隆过滤器误差率计算，可以跳过这部分直接阅读[LevelDB 实现](#LevelDB-实现)部分。假设布隆过滤器使用的位数组大小为 $\( m \)$，哈希函数的数量为 $\( k \)$，并且已经向过滤器中添加了 $\( n \)$ 个元素。我们用的 hash 函数都很随机，因此**可以假设哈希函数以相等的概率选择数组中的位置**。插入元素过程中，某个位被某个哈希函数设置为 1 的概率是 $\( \frac{1}{m} \)$，未被设置为 1 的概率是 $\( 1 - \frac{1}{m} \)$。

$ k $ 是哈希函数的数量，我们选择的每个哈希函数之间没有相关性，互相独立。所以该位**未被任何哈希函数设置为 1 的概率**为：

$$ {\displaystyle \left(1-{\frac {1}{m}}\right)^{k}} $$

接下来是一个数学技巧，自然对数 $ e $ 有个恒等式：

$$ {\displaystyle \lim _{m\to \infty }\left(1-{\frac {1}{m}}\right)^{m}={\frac {1}{e}}} $$

对于比较大的 m，我们可以得出：

$$ {\displaystyle \left(1-{\frac {1}{m}}\right)^{k}=\left(\left(1-{\frac {1}{m}}\right)^{m}\right)^{k/m}\approx e^{-k/m}} $$

我们插入了 n 个元素，所以某个位没有被设置为 1 的概率是：

$$ {\displaystyle \left(1-{\frac {1}{m}}\right)^{kn}\approx e^{-kn/m}} $$

所以某个位被设置为 1 的概率是：

$$ {\displaystyle 1-\left(1-{\frac {1}{m}}\right)^{kn}\approx 1-e^{-kn/m}} $$

假设某个元素不在集合中，但是 k 个位都被设置为 1 的概率是：

$$ {\displaystyle \left(1-e^{-kn/m}\right)^{k}} $$

### 参数选择

通过上面的推导可以看出，假阳率与哈希函数的数量 $ k $、位数组的大小 $ m $ 以及添加的元素数量 $ n $ 有关。

- $ n $ 通常由应用场景确定，表示**预期插入布隆过滤器的元素总数**。可以预测，由外部因素决定，不易调整。
- 增加 $ m $ 可以直接减少误判率，但这会**增加布隆过滤器的存储空间需求**。在存储资源受限的环境中，可能不希望无限制地增加。另外扩大 $ m $ 的效果是**线性的**，需要平衡性能提升和额外的存储成本。
- 改变 $ k $ 对于**误判率的影响非常显著**，因为它直接影响到位数组中的位被设置为 1 的概率。

综合考虑下来，在实际应用中，$ n $ 由使用场景决定，而 $ m $ 受到存储成本的限制，调整 $ k $ 成为了一个实际且直接的优化手段。在已知预期元素数量 $n$ 和位数组大小 $m$ 的情况下，**需要找到一个合适的 k，使得误判率最小**。

这里找到合适的 k 是一个优化问题，可以通过数学方法求解。比较复杂，这里直接说结论，最优的 $(k)$ 如下：

$$ k = \frac{m}{n} \ln 2 $$

## LevelDB 实现

上面介绍了布隆过滤器的原理，接下来看看 LevelDB 中具体是如何实现的。LevelDB 中布隆过滤器的实现在 [bloom.cc](https://github.com/google/leveldb/blob/main/util/bloom.cc)，BloomFilterPolicy 继承了 FilterPolicy，实现了前面的接口。

### hash 个数选择

首先看这里 hash 函数个数 k 的选择，代码如下：

```cpp
  explicit BloomFilterPolicy(int bits_per_key) : bits_per_key_(bits_per_key) {
    // We intentionally round down to reduce probing cost a little bit
    k_ = static_cast<size_t>(bits_per_key * 0.69);  // 0.69 =~ ln(2)
    if (k_ < 1) k_ = 1;
    if (k_ > 30) k_ = 30;
  }
```

bits_per_key 这个参数在构造布隆过滤器的时候传入，LevelDB 中传的都是 10。这个值代表**平均每个 key 占用的 bit 位数**，即 $ \frac{m}{n} $。这里的 0.69 是 $ \ln (2) $ 的近似值，这个系数来源于上面讨论的最优哈希函数数量公式 $ k = \frac{m}{n} \ln 2 $。最后这里进行了一些边界保护，保证 k 的取值范围在 1 到 30 之间，避免 k 过大 hash 计算太耗时。

### 创建过滤器

接下来看看这里过滤器是怎么创建的，[完整代码](https://github.com/google/leveldb/blob/main/util/bloom.cc#L28)如下：

```cpp
void CreateFilter(const Slice* keys, int n, std::string* dst) const override {
  // Compute bloom filter size (in both bits and bytes)
  size_t bits = n * bits_per_key_;

  // For small n, we can see a very high false positive rate.  Fix it
  // by enforcing a minimum bloom filter length.
  if (bits < 64) bits = 64;

  size_t bytes = (bits + 7) / 8;
  bits = bytes * 8;

  const size_t init_size = dst->size();
  dst->resize(init_size + bytes, 0);
  dst->push_back(static_cast<char>(k_));  // Remember # of probes in filter
  char* array = &(*dst)[init_size];
  for (int i = 0; i < n; i++) {
    // Use double-hashing to generate a sequence of hash values.
    // See analysis in [Kirsch,Mitzenmacher 2006].
    uint32_t h = BloomHash(keys[i]);
    const uint32_t delta = (h >> 17) | (h << 15);  // Rotate right 17 bits
    for (size_t j = 0; j < k_; j++) {
      const uint32_t bitpos = h % bits;
      array[bitpos / 8] |= (1 << (bitpos % 8));
      h += delta;
    }
  }
}
```

首先是计算位数组需要的空间，根据键的数量 $ n $ 和每个键的平均位数计算需要的总位数。这里还考虑了些边界条件，如果得到的位数太少（少于 64 位），则设为 64 位以避免过高的误判率。另外，也考虑了字节对齐，将位数转换为字节，同时确保总位数是 8 的倍数。

接着用 resize 增加 dst 的大小，在**目标字符串后面分配位数组的空间**，这里布隆过滤器**被设计为可以附加到现有的数据后面，而不会覆盖或删除已有数据**。新增的空间会被初始化为 0，因为布隆过滤器的位数组需要从一个全零的状态开始。然后在目标字符串 dst 尾部添加 k_，即哈希函数的数量。这个值是布隆过滤器元数据的一部分，在查询键是否存在的时候用来确定需要进行多少次哈希计算。

最后是布隆过滤器的核心部分，计算哪些位数组位置需要设置为 1。正常来说需要设置 **k 个 hash 函数，计算 k 次然后来设置对应位置**。但是 LevelDB 的实现似乎不是这样的，对于每个键，使用 BloomHash 函数计算该键的初始哈希值 h，然后设置相应位置。之后的计算中，每次将上次的哈希值右移 17 位，左移 15 位然后进行或操作来计算 delta，然后用上次 hash 值加上 delta 来计算下一个 hash 值。这样就可以得到 k 个 hash 值，然后设置对应位置。

在前面的[数学推导](#数学推导)中提到过，这里 **k 个 hash 函数要保证随机并且互相独立**，上面的方法能满足这个要求吗？代码注释里提示有提到，这里是采用 **double-hashing（双重哈希）** 的方法，参考了 [[Kirsch,Mitzenmacher 2006]](https://www.eecs.harvard.edu/~michaelm/postscripts/tr-02-05.pdf) 的分析，虽然双重哈希生成的哈希值不如完全独立的哈希函数那样完全无关，但在实际应用中，它们提供了足够的随机性和独立性，可以满足布隆过滤器的要求。

这里的好处也是显而易见的，双重哈希可以从一个基础哈希函数生成多个伪独立的哈希值，不用实现 k 个 hash，实现上很简单。此外，与多个独立的哈希函数相比，**双重哈希方法减少了计算开销，因为它只需计算一次真正的哈希值，其余的哈希值通过简单的算术和位操作得到**。

### 查询键存在

最后是查询键是否存在，如果看懂了前面的创建过滤器部分，这里就很容易理解了。[完整代码](https://github.com/google/leveldb/blob/main/util/bloom.cc#L56) 如下：

```cpp
bool KeyMayMatch(const Slice& key, const Slice& bloom_filter) const override {
  const size_t len = bloom_filter.size();
  if (len < 2) return false;

  const char* array = bloom_filter.data();
  const size_t bits = (len - 1) * 8;

  // Use the encoded k so that we can read filters generated by
  // bloom filters created using different parameters.
  const size_t k = array[len - 1];
  if (k > 30) {
    // Reserved for potentially new encodings for short bloom filters.
    // Consider it a match.
    return true;
  }

  uint32_t h = BloomHash(key);
  const uint32_t delta = (h >> 17) | (h << 15);  // Rotate right 17 bits
  for (size_t j = 0; j < k; j++) {
    const uint32_t bitpos = h % bits;
    if ((array[bitpos / 8] & (1 << (bitpos % 8))) == 0) return false;
    h += delta;
  }
  return true;
}
```

开始部分就是一些边界条件判断，如果过滤器长度小于 2 返回 false。从过滤器数据的最后一个字节读取 k 的值，k 是在创建过滤器时存储的，用来确定需要进行多少次哈希计算。如果 k 大于 30，这种情况被视为可能用于未来新的编码方案，因此函数直接返回 true，假设键可能存在于集合中（直到 2024 年，这里也没扩展新的编码方案了）。

接下来的部分和创建过滤器的时候类似，使用 BloomHash 函数计算键的哈希值，然后进行位旋转以生成 delta，用于在循环中修改哈希值以模拟多个哈希函数的效果。在这个过程中，如果任何一个位为 0，则表明**键绝对不在集合中**，函数返回 false。如果所有相关位都是 1，则返回 true，表示**键可能在集合中**。

## 布隆过滤器测试

LevelDB 中布隆过滤器的实现还提供了完整的测试代码，可以在 [bloom_test.cc](https://github.com/google/leveldb/blob/main/util/bloom_test.cc) 中找到。

首先从 testing::Test 类派生 BloomTest 类，用于组织和执行与布隆过滤器相关的测试用例。其构造函数和析构函数用于创建和释放 NewBloomFilterPolicy 的实例，确保每个测试用例都能在一个干净的环境中运行。Add 方法用于向布隆过滤器添加键，Build 将收集的键转换成过滤器。Matches 方法用于检查特定键是否与过滤器匹配，而 FalsePositiveRate 方法用于**评估过滤器的误判率**。

接着就是一系列 TEST_F 宏定义的具体测试用例，允许每个测试用例自动拥有 BloomTest 类中定义的方法和属性。前面两个测试用例比较简单：

- EmptyFilter: 测试空过滤器，即没有添加任何键的情况下，过滤器是否能正确判断键不存在。
- Small: 测试添加少量键的情况，检查过滤器是否能正确判断键是否存在。

这里值得注意的是 VaryingLengths 测试用例，它是一个比较复杂的测试用例，来评估和验证**布隆过滤器在不同数据规模（即不同数量的键）下的性能和效率**。通过定义的 NextLength 函数来递增键的数量，测试在不同的键集大小下布隆过滤器的表现。主要测试下面三个方面：

1. 确保构建的布隆过滤器的大小在预期范围内;
2. 确保所有添加到过滤器的键都能被正确地识别为存在;
3. 评估布隆过滤器在不同长度下的误判率（假阳性率），确保误判率不超过2%。同时，根据误判率的大小分类过滤器为“好”（good）或“一般”（mediocre），并对它们的数量进行统计和比较，确保“一般”过滤器的数量不会太多。

完整的测试代码如下：

```cpp
  TEST_F(BloomTest, VaryingLengths) {
  char buffer[sizeof(int)];

  // Count number of filters that significantly exceed the false positive rate
  int mediocre_filters = 0;
  int good_filters = 0;

  for (int length = 1; length <= 10000; length = NextLength(length)) {
    Reset();
    for (int i = 0; i < length; i++) {
      Add(Key(i, buffer));
    }
    Build();

    ASSERT_LE(FilterSize(), static_cast<size_t>((length * 10 / 8) + 40))
        << length;

    // All added keys must match
    for (int i = 0; i < length; i++) {
      ASSERT_TRUE(Matches(Key(i, buffer)))
          << "Length " << length << "; key " << i;
    }

    // Check false positive rate
    double rate = FalsePositiveRate();
    if (kVerbose >= 1) {
      std::fprintf(stderr,
                   "False positives: %5.2f%% @ length = %6d ; bytes = %6d\n",
                   rate * 100.0, length, static_cast<int>(FilterSize()));
    }
    ASSERT_LE(rate, 0.02);  // Must not be over 2%
    if (rate > 0.0125)
      mediocre_filters++;  // Allowed, but not too often
    else
      good_filters++;
  }
  if (kVerbose >= 1) {
    std::fprintf(stderr, "Filters: %d good, %d mediocre\n", good_filters,
                 mediocre_filters);
  }
  ASSERT_LE(mediocre_filters, good_filters / 5);
}
```

这里是执行测试的结果：

![布隆过滤器测试结果](https://slefboot-1251736664.file.myqcloud.com/20240808_leveldb_source_bloom_filter_testcase.png)

## 布隆过滤器可视化

在结束文章之前，我们再来看下[布隆过滤器的一个可视化演示](https://gallery.selfboot.cn/zh/algorithms/bloomfilter)，把上面的原理和实现用图表展示出来，加深理解。

![布隆过滤器可视化演示](https://slefboot-1251736664.file.myqcloud.com/20240808_leveldb_source_bloom_filter_visualization.png)

这个演示站点中，可以选择不同的哈希函数数量、预测 key 的数量。然后会自动调整位数组，之后可以添加元素，并检查元素是否在布隆过滤器中。如果在的话，会用黑色方框显示相应数组位。如果不在的话，会用红色方框显示相应数组位。这样可以直观理解布隆过滤器的工作原理。

同时为了方便演示，点击位组的时候会显示有哪些 key 经过 hash 后会落在这里。实际上布隆过滤器是不会存储这些信息的，这里是额外存储的，只是为了方便演示。

## 总结

布隆过滤器是一种高效的数据结构，用于判断一个元素是否存在于一个集合中。它的核心是一个位数组和多个哈希函数，通过多次哈希计算来设置位数组中的位。通过严谨的数学推导，可以得出布隆过滤器的误判率与哈希函数的数量、位数组的大小和添加的元素数量有关。在实际应用中，可以通过调整哈希函数的数量来优化误判率。

LevelDB 中实现了一个布隆过滤器，作为默认的过滤策略，可以通过工厂函数创建，保留了扩展性。为了节省 hash 资源消耗，LevelDB 通过双重哈希方法生成多个伪独立的哈希值，然后设置对应的位。在查询时，也是通过多次哈希计算来判断键是否存在于集合中。LevelDB 提供了完整的测试用例，用于验证布隆过滤器的正确性和误判率。

另外，为了直观理解布隆过滤器的工作原理，我这里还做了一个布隆过滤器的可视化演示，通过图表展示了布隆过滤器的原理。