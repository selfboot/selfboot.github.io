---
title: LevelDB 源码阅读：跳表的原理、实现、测试以及可视化
tags: [C++]
category: 源码剖析
toc: true
date: 2024-08-17 21:00:00
mathjax: true
description: 
---

在 LevelDB 中，内存 MemTable 中的数据存储在 SkipList(跳表) 中，用来支持快速插入。跳表是 William Pugh 在论文 [Skip Lists: A Probabilistic Alternative to Balanced Trees](https://15721.courses.cs.cmu.edu/spring2018/papers/08-oltpindexes1/pugh-skiplists-cacm1990.pdf) 中提出的一种概率性数据结构。有点类似**有序链表**，但是可以有多层，通过空间换时间，允许快速的查询、插入和删除操作，平均时间复杂度为 $ O(\log n) $。和一些平衡树比起来，**代码实现也比较简单，性能稳定**，因此应用比较广泛。

![跳表实现的启发思路](https://slefboot-1251736664.file.myqcloud.com/20240321_leveldb_source_skiplist.png)

那么跳表的原理是什么？ LevelDB 中跳表又是怎么实现的呢？本文将从跳表的原理、实现、测试等方面来深入探讨。最后还提供了**一个可视化页面，可以直观看到跳表的构建以及整体结构**。

<!-- more -->

## 跳表的原理

跳表主要用来存储有序的数据结构，在展开跳表的原理之前，先来看看在跳表之前，人们是怎么存储有序数据的。

### 存储有序数据

为了存储有序的抽象数据类型，最简单的方法是用有序二叉树，比如二叉搜索树（Binary Search Tree, BST）。在二叉搜索树中，每个节点包含一个键值，这个键值具有可比较性，允许执行有序操作。**任何一个节点的左子树只包含键值小于该节点的键值的节点，而其右子树只包含键值大于该节点的键值的节点**。

基于二叉搜索树的结构定义，我们很容易想到插入，查找操作的方法。比如查找的话，从树的根节点开始，逐级向下，如果目标键值小于当前节点的键值，则搜索左子树；如果目标键值大于当前节点的键值，则搜索右子树；如果相等，则找到了目标节点。插入也类似，找到目标后，在相应位置插入。删除操作稍微复杂，在找到目标节点后，需要根据当前节点的子树情况，来调整树的结构。这里不展开讲，感兴趣的话，可以去二叉搜索树可视化博客里面了解更多细节。

二叉搜索树的平均时间复杂度是 $ O(\log n) $，但如果二叉搜索树中的元素是**按照顺序插入的**，那么这棵树可能会退化成一个链表，使得操作的时间复杂度从 $ O(\log n) $ 退化为 $ O(n) $。比如下图就是按照顺序插入 10 个元素后，二叉搜索树的结构：

![二叉搜索树退化为链表](https://slefboot-1251736664.file.myqcloud.com/20240828_leveldb_source_skiplist_sequential.png)

为了解决性能退化的问题，人们提出了很多平衡树，比如 AVL 树、红黑树等。这些平衡树的**实现比较复杂，为了维护树的平衡性，增加了一些复杂的操作。**

### 跳表的思想

上面的平衡树，都是**强制树结构满足某个平衡条件**，因此需要引入复杂的结构调整。跳表的作者，则另辟蹊径，引入了**概率平衡**而不是强制性的结构平衡。通过**简单的随机化过程**，跳表以较低的复杂性实现了与平衡树类似的平均搜索时间、插入时间和删除时间。

William Pugh 在论文中没有提到自己是怎么想到跳表思路的，只在 Related Work 中提到 Sprugnoli 在 1981 年提出了一种**随机平衡搜索树**。或许正是这里的**随机思想**启发了 Pugh，让他最终提出了跳表。其实随机思想还是挺重要的，比如 Google 提出的 [Jumphash 一致性哈希算法](https://gallery.selfboot.cn/zh/algorithms/jumphash)，也是通过概率来计算应该在哪个 hash 桶，相比 [hashring](https://gallery.selfboot.cn/zh/algorithms/hashring) 方法有不少优点。

在开始跳表的原理之前，我们先回顾下**有序链表的搜索**。如果我们要查找一个有序链表，那么只能从头扫描，这样复杂度是 $ O(n) $。但这样就没有利用到**有序**的特性，如果**是有序数组，通过二分查找**，可以将复杂度降低到 $ O(\log n) $。有序链表和有序数组的差别就在于无法通过下标快速访问中间元素，只能通过**指针遍历**。

那么有什么办法可以让搜索的时候**跳过一些节点**，进而减少查找时间呢？一个比较直观的方法就是，**创建多一点指针，用空间换时间**。回到文章开始的图，$ a $是原始的有序链表，$ b $ 增加了些指针索引，可以 1 次跳 2 个，$ c $ 则进一步又增加了指针索引，可以1 次跳 4 个节点。

![空间换时间，增加节点指针，加快查找速度](https://slefboot-1251736664.file.myqcloud.com/20240828_leveldb_source_skiplist_multilevel.png)

如果构建的链表中，**每一层指针的节点数是下一层的 1/2**，那么在最高层，只需要 1 次就能跳过一半的节点。在这种结构里查找的话，类似有序数组，可以通过**二分查找**的方式，快速定位到目标节点。因为整个链表索引高度是 $ O(\log n) $，查找的时间复杂度也是 $ O(\log n) $。

**看起来很完美，只要我们不考虑插入和删除操作**。如果要插入或者删除一个新节点，需要**打乱并重构整个索引层**，这是灾难性的。

跳表的作者 Pugh 为了解决这个问题，引入了**随机化**的思想，通过**随机决定节点的层高**，来避免插入和删除操作带来的复杂索引层重构。同时也用数学证明了，跳表的实现会保证平均时间复杂度是 $ O(\log n) $。

跳表的核心思想其实和上面的多层索引类似，**通过多层索引来加速查找**，每一层都是一个有序链表，最底层包含所有元素。每一层的节点都是前一层节点的子集，越往上层节点越稀疏。只是跳表的层高是**随机决定的**，不用像上面那样，每一层都是下一层的 1/2。因此插入和删除操作的代价是**可控的**，不会像多层索引那样，需要重构整个索引层。

当然跳表的实现还是有不少细节地方，下面通过 LevelDB 中的跳表实现来深入探讨。

## LevelDB 中实现

LevelDB 中的跳表实现在 [db/skiplist.h](https://github.com/google/leveldb/blob/main/db/skiplist.h) 中，主要是 SkipList 类，我们先来看看这个类的设计。

### SkipList 类设计

SkipList 类定义了一个**模板类**，通过使用模板 `template <typename Key, class Comparator>`，SkipList 类可以用于任意数据类型的键（Key），并可以通过外部比较器（Comparator）自定义键的比较逻辑。所以这个 SkipList 只有 `.h` 文件，没有 `.cc` 文件，因为模板类的实现通常都在头文件中。 

```cpp
template <typename Key, class Comparator>
class SkipList {
 private:
  struct Node;

 public:
  // Create a new SkipList object that will use "cmp" for comparing keys,
  // and will allocate memory using "*arena".  Objects allocated in the arena
  // must remain allocated for the lifetime of the skiplist object.
  explicit SkipList(Comparator cmp, Arena* arena);

  SkipList(const SkipList&) = delete;
  SkipList& operator=(const SkipList&) = delete;
```

SkipList 类的构造函数用于创建一个新的跳表对象，其中 cmp 是用于比较键的比较器，arena 是用于分配内存的 Arena 对象。SkipList 类通过 delete 禁用了拷贝构造函数和赋值运算符，避免了不小心复制整个跳表(**没有必要，成本也很高**)。

SkipList 类公开的核心操作接口只有两个，分别是 Insert 和 Contains。Insert 用于插入新节点，Contains 用于查找节点是否存在。这里并没有提供删除节点的操作，因为 LevelDB 中 MemTable 的数据是**只会追加**的，不会去删除跳表中的数据。DB 中删除 key，在 MemTable 中只是增加一条删除类型的记录。

```cpp
  // Insert key into the list.
  // REQUIRES: nothing that compares equal to key is currently in the list.
  void Insert(const Key& key);

  // Returns true iff an entry that compares equal to key is in the list.
  bool Contains(const Key& key) const;
```

然后为了更好地支持节点的遍历操作，SkipList 类内部定义了 Node 类和迭代器 Iterator 类。Node 类定义了跳表中的节点结构，Iterator 类定义了一个迭代器对象，用于遍历跳表中的节点。这两个类都是 SkipList 的内部类，这样可以**提高跳表的封装性和可维护性**。

- 封装性：Node 类是 SkipList 的实现的核心部分，但对于使用 SkipList 的用户来说，通常不需要直接与节点对象交互。将 Node 类定义为私有内部类可以隐藏实现细节；
- 可维护性：如果跳表的实现需要修改或扩展，相关改动将局限于 SkipList 类的内部，而不会影响到外部使用这些结构的代码，有助于代码的维护和调试。

最后，SkipList 类还有一些私有的成员和方法，用来辅助实现跳表的 Insert 和 Contains 操作。比如：

```cpp
  bool KeyIsAfterNode(const Key& key, Node* n) const;
  Node* FindGreaterOrEqual(const Key& key, Node** prev) const;
  Node* FindLessThan(const Key& key) const;
  Node* FindLast() const;
```

在看跳表的插入和查找以及私有方法前，我们先来看看 Node 和 Iterator 类的设计。

### Node 节点类设计

Node 类的设计里面有不少细节值得学习，先给出完整的代码和注释，大家可以先品一品。

```cpp
template <typename Key, class Comparator>
struct SkipList<Key, Comparator>::Node {
  explicit Node(const Key& k) : key(k) {}

  Key const key;

  // Accessors/mutators for links.  Wrapped in methods so we can
  // add the appropriate barriers as necessary.
  Node* Next(int n) {
    assert(n >= 0);
    // Use an 'acquire load' so that we observe a fully initialized
    // version of the returned Node.
    return next_[n].load(std::memory_order_acquire);
  }
  void SetNext(int n, Node* x) {
    assert(n >= 0);
    // Use a 'release store' so that anybody who reads through this
    // pointer observes a fully initialized version of the inserted node.
    next_[n].store(x, std::memory_order_release);
  }

  // No-barrier variants that can be safely used in a few locations.
  Node* NoBarrier_Next(int n) {
    assert(n >= 0);
    return next_[n].load(std::memory_order_relaxed);
  }
  void NoBarrier_SetNext(int n, Node* x) {
    assert(n >= 0);
    next_[n].store(x, std::memory_order_relaxed);
  }

 private:
 // Array of length equal to the node height.  next_[0] is lowest level link.
  std::atomic<Node*> next_[1];
};
```

先来看成员变量 key，其类型为模板 Key，同时键是不可变的（const）。另外一个成员变量 next_ 在最后面，这里使用 `std::atomic<Node*> next_[1]`，来支持**动态地扩展数组**的大小。这就是[C++ 中的柔性数组](https://selfboot.cn/2024/08/13/leveldb_source_unstand_c++/#%E6%9F%94%E6%80%A7%E6%95%B0%E7%BB%84)，在分配 Node 对象时，会**根据节点的高度动态分配额外的内存来存储更多的 next 指针**。这个数组主要用来存储当前节点的后继节点，`next_[0]` 存储最底层的下一个节点指针，`next_[1]` 存储往上一层的，以此类推。同时这里的 next_ 数组使用了 std::atomic 类型，这是 C++11 中引入的**原子操作类型**，用来保证多线程并发访问时的**内存一致性**。

Node 类还提供了 2 组方法来访问和更新 next_ 数组中的指针。Next 和 SetNext 方法是**带内存屏障的**，用于保证多线程并发访问时的**内存可见性**。

- acquire 语义：Next 方法中 load 使用 std::memory_order_acquire，确保在**加载操作之后发生的读或写操作不会被重排序到加载操作之前**。
- release 语义：SetNext 方法中 store 使用 std::memory_order_release，确保对这个节点的任何后续读取都将看到这个写操作状态。

NoBarrier_Next 和 NoBarrier_SetNext 方法则是**不带内存屏障的**，这两个方法使用 std::memory_order_relaxed，编译器不会在这个操作和其他内存操作之间插入任何同步或屏障，因此不提供任何内存顺序保证，这样性能会更好些。在某些情况下，如果代码逻辑能确保访问顺序和数据一致性（例如，通过其他方式已经同步了线程），那么使用 memory_order_relaxed 内存顺序可以减少开销，从而提高程序的运行效率。在 SkipList 的实现中，只有 Insert 中会用到这里的 NoBarrier 版本，这里后面展开插入操作时再分析。

### Iterator 迭代器类设计
  

### Insert 插入节点

LevelDB 中 skiplist 的实现代码很简练，这里以 Inert 插入函数为例，来分析其中的代码。插入节点的核心逻辑如下：

1. 首先定义一个类型为 `Node*`的数组 prev，长度为跳表最大层高 `kMaxHeight=12`。这个数组**存储要插入的新节点每一层的前驱节点**，在跳表中插入新节点时，可以通过这个 pre 数组找到新节点在每一层插入的位置。这里是通过 `FindGreaterOrEqual` 来填充 prev 数组，这个函数会从高到低层地遍历，找到大于等于当前插入 key 的位置。
2. 通过随机算法，来**决定新节点的层高**。这里 LevelDB 初始层高为 1，然后每层以 **1/4** 的概率决定增加层高。如果新节点的高度超过了当前跳表的最大高度，需要更新最大高度，并将超出的部分的 prev 设置为头节点，因为新的层级是从头节点开始的。
3. 创建一个新的节点，并插入在链表中。具体做法也很简单，遍历新节点的每一层，**使用 NoBarrier_SetNext 方法来设置新节点的下一节点，接着更新 prev 节点的下一节点为新节点，实现了新节点的插入**。NoBarrier_SetNext 说明在这个上下文中，不需要额外的**内存屏障来保证内存操作的可见性**。

完整代码很简练如下，省掉了部份注释。

```cpp
template <typename Key, class Comparator>
void SkipList<Key, Comparator>::Insert(const Key& key) {
  Node* prev[kMaxHeight];           // 1
  Node* x = FindGreaterOrEqual(key, prev);

  // Our data structure does not allow duplicate insertion
  assert(x == nullptr || !Equal(key, x->key));

  int height = RandomHeight();      // 2
  if (height > GetMaxHeight()) {
    for (int i = GetMaxHeight(); i < height; i++) {
      prev[i] = head_;
    }
    max_height_.store(height, std::memory_order_relaxed);
  }

  x = NewNode(key, height);         // 3
  for (int i = 0; i < height; i++) {
    x->NoBarrier_SetNext(i, prev[i]->NoBarrier_Next(i));
    prev[i]->SetNext(i, x);
  }
}
```

### 查找插入位置

这个函数可以查找并返回大于等于 key 的节点 n，查找过程中会填充 prev 数组，保留节点 n 每一层的**前驱节点**。

首先初始化当前节点 x 为头节点 head_。在跳表中，头节点通常是一个哑元节点，其值小于跳表中所有其他节点的值。然后从**最高层开始往右、往下进行搜索**，跳表的层级从 0 开始，所以最高层是 `GetMaxHeight() - 1`。接下来是一个循环搜索过程，直到最下一层才结束。每一轮都是在当前层级 level 上，首先获取节点 x 的下一个节点 next，然后进行比较。

1. 如果 key 位于 next 之后，则继续在当前层级上向右搜索。
2. 如果 key 比 next 节点的值小（或者 next 节点是尽头 nullptr），则 x 就是当前层的前驱节点。如果 prev 非空（即调用者需要记录搜索路径），则在 prev 数组的 level 记录当前节点 x。
   - 如果当前 level 是最底层，则返回 next 节点即可；
   - level 是中间层，还要继续向下找(level--)；

完整的代码如下：

```cpp
template <typename Key, class Comparator>
typename SkipList<Key, Comparator>::Node*
SkipList<Key, Comparator>::FindGreaterOrEqual(const Key& key,
                                              Node** prev) const {
  Node* x = head_;
  int level = GetMaxHeight() - 1;
  while (true) {
    Node* next = x->Next(level);
    if (KeyIsAfterNode(key, next)) {
      // Keep searching in this list
      x = next;
    } else {
      if (prev != nullptr) prev[level] = x;
      if (level == 0) {
        return next;
      } else {
        // Switch to next list
        level--;
      }
    }
  }
}
```

## 跳表在线可视化

为了直观看看跳表构建的过程，我用 Claude3.5 做了一个[跳表可视化页面](https://gallery.selfboot.cn/en/algorithms/skiplist)。可以指定跳表的最大层高，以及调整递增层高的概率，然后可以随机初始化跳表，或者插入、删除、查找节点，观察跳表结构的变化。 

![跳表在线可视化](https://slefboot-1251736664.file.myqcloud.com/20240815_leveldb_source_skiplist_visualization.png)

在最高 12 层，递增概率为 1/4 的情况下，可以看到跳表平均层高还是挺低的。这里也可以调整概率为 1/2，看看跳表的变化。


## 跳表性能分析


跳表在极端情况下，性能会比平衡树要差。但是因为有随机性在里面，所以没有输入序列能始终导致性能最差。


## 总结

跳表是一种概率性数据结构，可以用来替代平衡树，实现了快速的插入、删除和查找操作。LevelDB 中的跳表实现代码简洁，性能稳定，适合用来存储内存 MemTable 中的数据。本文从跳表的原理、实现、测试等方面来深入探讨，最后还提供了一个可视化页面，可以直观看到跳表的构建过程。