title: LevelDB 源码阅读：布隆过滤器的原理与实现
tags: [C++, LevelDB]
category: 源码剖析
toc: true
date: 
mathjax: true
description:
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

那么布隆过滤器的原理是什么？LevelDB 中又是怎么实现的呢？

## 接口定义

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
- CreateFilter(): 用于创建一个过滤器，即将 keys 中的所有 key 添加到过滤器中，过滤器内容存放在 dst 中。
- KeyMayMatch(): 用于判断 key 是否存在于过滤器中，这里的 filter 是 CreateFilter() 生成的 dst。如果 key 存在于过滤器中，那么一定要返回 true。**如果不存在，那么可以返回 true，也可以返回 false，但是要保证返回 false 的概率要尽可能高**。

此外还提供了一个工厂函数，用于创建一个布隆过滤器实例。不过有个缺点就是使用完返回的过滤策略实例后，需要记得手动释放资源。这里使用工厂函数，**允许库的维护者在不影响现有客户端代码的情况下更改对象的构建过程**。例如，如果未来开发了一个更高效的布隆过滤器实现，**可以简单地修改工厂函数以返回新的实现，而无需修改调用它的代码。这为将来的扩展和维护提供了便利**。

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

通过上面的描述，可以发现添加或检查元素是否在集合中所需的时间是固定常数$ O( k )$，完全独立于集合中已有的项目数量。和其他表示集合的数据结构，比如 hash 表、平衡二叉树、跳表等相比，除了查找速度快，布隆过滤器的空间效率非常高，它不需要存储元素本身，可以节省不少空间。

不过也是有缺点的，仔细思考上面过程可以发现，**布隆过滤器的查询结果有可能是误判的**。布隆过滤器使用多个哈希函数对每个元素进行处理，将多个结果位置的位设置为 1，**这些位置可能与其他元素的哈希结果重叠**。假设有个 key 并不存在于集合中，但是它的哈希结果与其他元素的哈希结果重叠，那么布隆过滤器就会判断这个 key 存在于集合中，这就是所谓的假阳性（False Positive）。

当一个元素并不在集合中时，布隆过滤器错误地判定其存在的概率，就是假阳性率（false positive rate）。直观感觉上的话，**对于固定的 k 个哈希函数，数组位数 m 越大，那么哈希碰撞越少，假阳性率就越低**。为了设计一个良好的布隆过滤器，保证很低的假阳性率，上面的定性分析并不够，需要进行数学推导来定量分析。

### 数学推导

这里简单推导一下布隆过滤器误差率计算，可以跳过直接阅读[LevelDB 实现](#LevelDB-实现)部分。假设布隆过滤器使用的位数组大小为 $\( m \)$，哈希函数的数量为 $\( k \)$，并且已经向过滤器中添加了 $\( n \)$ 个元素。好的 hash 函数都很随机，因此**可以假设哈希函数以相等的概率选择数组中的位置**。插入元素过程中，某个位被某个哈希函数设置为 1 的概率是 $\( \frac{1}{m} \)$，未被设置为 1 的概率是 $\( 1 - \frac{1}{m} \)$。

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



通常，给定 \( n \) 和希望达到的误差率 \( p \)，可以使用以下公式来估算最优的 \( k \)：
\[ k = \frac{m}{n} \ln 2 \]
这是因为 \( \ln 2 \) 约等于 0.693，正好是布隆过滤器中使误差最小化时的 \( k/m \) 值。

为了达到最佳效果，哈希函数应该均匀分布且独立。通常，k是一个小常数，取决于所需的错误率ε ，而m与k和要添加的元素数量成正比。

## LevelDB 实现

上面介绍了布隆过滤器的原理，接下来看看 LevelDB 中具体是如何实现的。LevelDB 中布隆过滤器的实现在 [bloom.cc](https://github.com/google/leveldb/blob/main/util/bloom.cc)，BloomFilterPolicy 继承了 FilterPolicy，实现了前面的接口。

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




