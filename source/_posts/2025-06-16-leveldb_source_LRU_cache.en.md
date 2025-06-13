-----
title: LevelDB Explained - The Implementation Details of a High-Performance LRU Cache
tags:
  - C++
  - LevelDB
category: Source Code Analysis
toc: true
description: This article delves into the implementation details of the high-performance LRU cache in LevelDB, covering its cache interface design, the LRUHandle data structure, doubly linked list optimizations, and sharding mechanism. By analyzing core designs like clever reference counting management, the dummy node technique, and lock sharding to reduce contention, it showcases the optimization strategies for an industrial-grade cache system. Combining code and diagrams, the article helps readers understand how LevelDB achieves a high-concurrency, high-performance cache and how these design techniques can be applied in their own projects.
mathjax: true
date: 2025-06-13 21:00:00
-----

In computer systems, caches are ubiquitous. From CPU caches to memory caches, from disk caches to network caches, they are everywhere. The core idea of a cache is to trade space for time by storing frequently accessed "hot" data in high-performance storage to improve performance. Since caching devices are expensive, their storage size is limited, which means some cached data must be evicted. The eviction policy is crucial here; an unreasonable policy might evict data that is about to be accessed, leading to a very low cache hit rate.

There are many cache eviction policies, such as LRU, LFU, and FIFO. Among them, LRU (Least Recently Used) is a classic strategy. Its core idea is: **when the cache is full, evict the least recently used data**. This is based on the empirical assumption that "**if data has been accessed recently, it is more likely to be accessed again in the future**." As long as this assumption holds, LRU can significantly improve the cache hit rate.

LevelDB implements an in-memory LRU Cache to store hot data, enhancing read and write performance. By default, LevelDB caches sstable indexes and data blocks. The sstable cache is configured to hold 990 (1000-10) entries, while the data block cache is allocated 8MB by default.

The LRU cache implemented in LevelDB is a sharded LRU with many detailed optimizations, making it an excellent case study. This article will start with the classic LRU implementation and then progressively analyze the implementation details of LevelDB's [LRU Cache](https://github.com/google/leveldb/blob/main/util/cache.cc).

## Classic LRU Implementation

A well-implemented LRU needs to support insertion, lookup, and deletion operations in $O(1)$ time complexity. The classic approach uses **a doubly linked list and a hash table**:

  - **The doubly linked list** stores the cache entries and maintains their usage order. Recently accessed items are moved to the head of the list, while the least recently used items gradually move towards the tail. When the cache reaches its capacity and needs to evict data, the item at the tail of the list (the least recently used item) is removed.
  - **The hash table** stores the mapping from keys to their corresponding nodes in the doubly linked list, allowing any data item to be accessed and located in constant time. The hash table's keys are the data item keys, and the values are pointers to the corresponding nodes in the doubly linked list.

**The doubly linked list ensures constant-time node addition and removal, while the hash table provides constant-time data access**. For a get operation, the hash table quickly locates the node in the list. If it exists, it's moved to the head of the list, marking it as recently used. For an insert operation, if the data already exists, its value is updated, and the node is moved to the head. If it doesn't exist, a new node is inserted at the head, a mapping is added to the hash table, and if the capacity is exceeded, the tail node is removed from the list and its mapping is deleted from the hash table.

This implementation approach is familiar to anyone who has studied algorithms. There are LRU implementation problems on LeetCode, such as [146. LRU Cache](https://leetcode.com/problems/lru-cache/), which requires implementing the following interface:

```c++
class LRUCache {
public:
    LRUCache(int capacity) {
    }
    int get(int key) {
    }
    void put(int key, int value) {
    }
};
```

However, implementing an industrial-grade, high-performance LRU cache is still quite challenging. Next, let's see how LevelDB does it.

## Cache Design: Dependency Inversion

Before diving into LevelDB's LRU Cache implementation, let's look at how the cache is used. For example, in [db/table\_cache.cc](https://github.com/google/leveldb/blob/main/db/table_cache.cc), to cache SSTable metadata, the TableCache class defines a member variable of type Cache and uses it to perform various cache operations.

```cpp
Cache* cache_(NewLRUCache(entries));

*handle = cache_->Lookup(key);
*handle = cache_->Insert(key, tf, 1, &DeleteEntry);
cache_->Release(handle);
cache_->Erase(Slice(buf, sizeof(buf)));
// ...
```

Here, Cache is an abstract class that defines the various interfaces for cache operations, as defined in [include/leveldb/cache.h](https://github.com/google/leveldb/blob/main/include/leveldb/cache.h). It specifies basic operations like Insert, Lookup, Release, and Erase. It also defines the Cache::Handle type to represent a cache entry. User code interacts only with this abstract interface, without needing to know the concrete implementation.

Then there is the LRUCache class, which is the concrete implementation of a complete LRU cache. This class is not directly exposed to the outside world, nor does it directly inherit from Cache. There is also a ShardedLRUCache class that inherits from Cache and implements the cache interfaces. It contains 16 LRUCache "shards," each responsible for caching a portion of the data.

This design allows callers to **easily swap out different cache implementations without modifying the code that uses the cache**. Ha, isn't this the classic **Dependency Inversion Principle from SOLID object-oriented programming**? The application layer depends on an abstract interface (Cache) rather than a concrete implementation (LRUCache). This reduces code coupling and improves the system's extensibility and maintainability.

When using the cache, a factory function is used to create the concrete cache implementation, [ShardedLRUCache](https://github.com/google/leveldb/blob/main/util/cache.cc#L339):

```cpp
Cache* NewLRUCache(size_t capacity) { return new ShardedLRUCache(capacity); }

// New cache implementations can be added at any time.
// Cache* NewClockCache(size_t capacity);
```

LRUCache is the core part of the cache, but for now, let's put aside its implementation and first look at the **design of the cache entry, Handle**.

## LRUHandle Class Implementation

In LevelDB, a cached data item is an LRUHandle class, defined in [util/cache.cc](https://github.com/google/leveldb/blob/main/util/cache.cc#L43). The comments here explain that LRUHandle is a heap-allocated, variable-length structure that is stored in a doubly-linked list, ordered by access time. Let's look at the members of this struct:

```cpp
struct LRUHandle {
  void* value;
  void (*deleter)(const Slice&, void* value);
  LRUHandle* next_hash;
  LRUHandle* next;
  LRUHandle* prev;
  size_t charge;  // TODO(opt): Only allow uint32_t?
  size_t key_length;
  bool in_cache;      // Whether entry is in the cache.
  uint32_t refs;      // References, including cache reference, if present.
  uint32_t hash;      // Hash of key(); used for fast sharding and comparisons
  char key_data[1];   // Beginning of key
}
```

This is a bit complex, and each field is quite important. Let's go through them one by one.

  - **value**: Stores the actual value of the cache entry. It's a `void*` pointer, meaning the cache layer is agnostic to the value's structure; it only needs the object's address.
  - **deleter**: A function pointer to a callback used to delete the cached value. When a cache entry is removed, this is used to free the memory of the cached value.
  - **next\_hash**: The LRU cache implementation requires a hash table. LevelDB implements its own high-performance hash table. As we discussed in [LevelDB Explained - How to Design a High-Performance HashTable](/en/2024/12/25/leveldb_source_hashtable/), the next_hash field of LRUHandle is used to resolve hash collisions.
  - **prev/next**: Pointers to the previous/next node in the doubly linked list, used to maintain the list for fast insertion and deletion of nodes.
  - **charge**: Represents the cost of this cache entry (usually its memory size), used to calculate the total cache usage and determine if eviction is necessary.
  - **key\_length**: The length of the key, used to construct a Slice object representing the key.
  - **in\_cache**: A flag indicating whether the entry is in the cache. If true, it means the cache holds a reference to this entry.
  - **refs**: A reference count, including the cache's own reference (if in the cache) and references from users. When the count drops to 0, the entry can be deallocated.
  - **hash**: The hash value of the key, used for fast lookups and sharding. Storing the hash value here avoids re-computation for the same key.
  - **key\_data**: A flexible array member that stores the actual key data. malloc is used to allocate enough space to store the entire key. We also discussed flexible array members in [LevelDB Explained - Understanding Advanced C++ Techniques](/en/2024/08/13/leveldb_source_unstand_c%2B%2B/).

The design of LRUHandle allows the cache to efficiently manage data items, track their references, and implement the LRU eviction policy. In particular, the combination of the in_cache and refs fields allows us to distinguish between items that are "**cached but not referenced by clients**" and those that are "**referenced by clients**," enabling an efficient eviction strategy using two linked lists.

Next, we'll examine the implementation details of the LRUCache class to better understand the purpose of these fields.

## LRUCache Class Implementation Details

Having looked at the design of the cache entry, we can now examine the concrete implementation details of LevelDB's LRUCache. The core caching logic is implemented in the LRUCache class in [util/cache.cc](https://github.com/google/leveldb/blob/main/util/cache.cc#L151). This class contains the core logic for operations like insertion, lookup, deletion, and eviction.

The comments here (LevelDB's comments are always worth reading carefully) mention that it uses two doubly linked lists to maintain cache items. Why is that?

```cpp
// The cache keeps two linked lists of items in the cache.  All items in the
// cache are in one list or the other, and never both.  Items still referenced
// by clients but erased from the cache are in neither list.  The lists are:
// - in-use:  contains the items currently referenced by clients, in no
//   particular order.  (This list is used for invariant checking.  If we
//   removed the check, elements that would otherwise be on this list could be
//   left as disconnected singleton lists.)
// - LRU:  contains the items not currently referenced by clients, in LRU order
// Elements are moved between these lists by the Ref() and Unref() methods,
// when they detect an element in the cache acquiring or losing its only
// external reference.
```

### Why Use Two Doubly Linked Lists?

As mentioned earlier, a typical LRU Cache implementation uses a single doubly linked list. Each time a cache item is used, it's moved to the head of the list, making the tail the least recently used item. For eviction, the node at the tail is simply removed. The LeetCode problem mentioned earlier can be solved this way, where each cache item is just an int, and its value is copied on access. **If the cached items are simple value types that can be copied directly on read without needing references, a single linked list is sufficient**.

However, in LevelDB, the cached data items are LRUHandle objects, which are dynamically allocated, variable-length structures. For high concurrency and performance, they cannot be managed by simple value copying but must be managed through reference counting. If we were to use a single linked list, consider this scenario.

We access items A, C, and D in order, and finally access B. Item B is referenced by a client (refs > 1) and is at the head of the list, as shown in the initial state in the diagram below. Over time, A, C, and D are accessed, but B is not. According to the LRU rule, A, C, and D are moved to the head. **Although B is still referenced, its relative position moves towards the tail because it hasn't been accessed for a long time**. After A and D are accessed and quickly released, they have no external references. When eviction is needed, we start from the tail and find that item B (refs > 1) cannot be evicted. We would have to skip it and continue traversing the list to find an evictable item.

![LRUCache Doubly Linked List State](https://slefboot-1251736664.file.myqcloud.com/20250612_leveldb_source_lru_cache_en.webp)

In other words, in this reference-based scenario, when evicting a node, if the node at the tail of the list is currently referenced externally (refs > 1), it cannot be evicted. This requires **traversing the list to find an evictable node, which is inefficient**. In the worst case, if all nodes are referenced, the entire list might be traversed without being able to evict anything.

To solve this problem, the LRUCache implementation uses two doubly linked lists. One is **in_use_**, which stores referenced cache items. The other is **lru_**, which stores unreferenced cache items. Each cache item can only be in one of these lists at a time, never both. However, an item can move between the two lists depending on whether it's currently referenced. This way, when a node needs to be evicted, it can be taken directly from the lru_ list without traversing the in_use_ list.

That's the introduction to the dual linked list design. We'll understand it better by looking at the core implementation of LRUCache.

### Cache Insertion, Deletion, and Lookup

Let's first look at node insertion, implemented in [util/cache.cc](https://github.com/google/leveldb/blob/main/util/cache.cc#L267). In short, an LRUHandle object is created, placed in the in_use_ doubly linked list, and the hash table is updated. If the cache capacity is reached after insertion, a node needs to be evicted. However, the implementation has many subtle details, and LevelDB's code is indeed concise.

Let's look at the parameters: key and value are passed by the client, hash is the hash of the key, charge is the cost of the cache item, and deleter is the callback function for deleting the item. Since LRUHandle has a flexible array member at the end, we first manually calculate the size of the LRUHandle object, allocate memory, and then initialize its members. Here, refs is initialized to 1 because a Handle pointer is returned.

```cpp
Cache::Handle* LRUCache::Insert(const Slice& key, uint32_t hash, void* value,
                                size_t charge,
                                void (*deleter)(const Slice& key,
                                                void* value)) {
  MutexLock l(&mutex_);

  LRUHandle* e =
      reinterpret_cast<LRUHandle*>(malloc(sizeof(LRUHandle) - 1 + key.size()));
  e->value = value;
  e->deleter = deleter;
  e->charge = charge;
  e->key_length = key.size();
  e->hash = hash;
  e->in_cache = false;
  e->refs = 1;  // for the returned handle.
  std::memcpy(e->key_data, key.data(), key.size());
```

The next part is also interesting. LevelDB's LRUCache implementation supports a cache capacity of 0, which means no data is cached. To cache an item, in_cache is set to true, and the refs count is incremented because the Handle object is placed in the in_use_ list. The handle is also inserted into the hash table. Note the FinishErase call here, which is worth discussing.

```cpp
  if (capacity_ > 0) {
    e->refs++;  // for the cache's reference.
    e->in_cache = true;
    LRU_Append(&in_use_, e);
    usage_ += charge;
    FinishErase(table_.Insert(e));
  } else {  // don't cache. (capacity_==0 is supported and turns off caching.)
    // next is read by key() in an assert, so it must be initialized
    e->next = nullptr;
  }
```

As we discussed in the hash table implementation, if a key already exists when inserting into the hash table, the old Handle object is returned. The FinishErase function is used to clean up this old Handle object.

```cpp
// If e != nullptr, finish removing *e from the cache; it has already been
// removed from the hash table.  Return whether e != nullptr.
bool LRUCache::FinishErase(LRUHandle* e) {
  if (e != nullptr) {
    assert(e->in_cache);
    LRU_Remove(e);
    e->in_cache = false;
    usage_ -= e->charge;
    Unref(e);
  }
  return e != nullptr;
}
```

The cleanup involves several steps. First, the old handle is removed from either the in_use_ or lru_ list. It's not certain which list the old Handle object is in, but that's okay—**LRU_Remove can handle it without knowing which list it's in**. The LRU_Remove function is very simple, just two lines of code. If you're unsure, try drawing a diagram:

```cpp
void LRUCache::LRU_Remove(LRUHandle* e) {
  e->next->prev = e->prev;
  e->prev->next = e->next;
}
```

Next, in_cache is set to false, indicating it's no longer in the cache. Then, the cache capacity is updated by decrementing usage_. Finally, Unref is called to decrement the reference count of this Handle object, which might still be referenced elsewhere. Only when all references are released will the Handle object be truly deallocated. The [Unref function](https://github.com/google/leveldb/blob/main/util/cache.cc#L226) is also quite interesting; I'll post the code here:

```cpp
void LRUCache::Unref(LRUHandle* e) {
  assert(e->refs > 0);
  e->refs--;
  if (e->refs == 0) {  // Deallocate.
    assert(!e->in_cache);
    (*e->deleter)(e->key(), e->value);
    free(e);
  } else if (e->in_cache && e->refs == 1) {
    // No longer in use; move to lru_ list.
    LRU_Remove(e);
    LRU_Append(&lru_, e);
  }
}
```

First, the count is decremented. If it becomes 0, it means there are **no external references, and the memory can be safely deallocated**. Deallocation has two parts: first, the deleter callback is used to clean up the memory for the value, and then free is used to release the memory for the LRUHandle pointer. If the count becomes 1 and the handle is still in the cache, it means only the cache itself holds a reference. In this case, **the Handle object needs to be removed from the in_use_ list and moved to the lru_ list**. If a node needs to be evicted later, this node in the lru_ list can be evicted directly.

Now for the final step of the insertion operation: checking if the cache has remaining capacity. If not, eviction begins. As long as the capacity is insufficient, the node at the head of the lru_ list is taken, **removed from the hash table, and then cleaned up using FinishErase**. Checking if the doubly linked list is empty is also interesting; it uses a dummy node, which we'll discuss later.

```cpp
  while (usage_ > capacity_ && lru_.next != &lru_) {
    LRUHandle* old = lru_.next;
    assert(old->refs == 1);
    bool erased = FinishErase(table_.Remove(old->key(), old->hash));
    if (!erased) {  // to avoid unused variable when compiled NDEBUG
      assert(erased);
    }
  }
```

The entire insertion function, including the eviction logic, and indeed the entire LevelDB codebase, is filled with assert statements for various checks, ensuring that the process terminates immediately if something goes wrong, preventing error propagation.

After seeing insertion, deletion is straightforward. The implementation is simple: remove the node from the hash table and then call FinishErase to clean it up.

```cpp
void LRUCache::Erase(const Slice& key, uint32_t hash) {
  MutexLock l(&mutex_);
  FinishErase(table_.Remove(key, hash));
}
```

Node lookup is also relatively simple. It looks up directly from the hash table. If found, the reference count is incremented, and the Handle object is returned. Just like insertion, returning a Handle object increments its reference count. So, if it's not used externally, you must remember to call the Release method to manually release the reference, otherwise, you could have a memory leak.

```cpp
Cache::Handle* LRUCache::Lookup(const Slice& key, uint32_t hash) {
  MutexLock l(&mutex_);
  LRUHandle* e = table_.Lookup(key, hash);
  if (e != nullptr) {
    Ref(e);
  }
  return reinterpret_cast<Cache::Handle*>(e);
}
void LRUCache::Release(Cache::Handle* handle) {
  MutexLock l(&mutex_);
  Unref(reinterpret_cast<LRUHandle*>(handle));
}
```

Additionally, the Cache interface also implements a Prune method for proactively cleaning the cache. The method is similar to the cleanup logic in insertion, but it clears out all nodes in the lru_ list. This function is not used anywhere in LevelDB.

### Doubly Linked List Operations

Let's discuss the doubly linked list operations in more detail. We already know there are two lists: lru_ and in_use_. The comments make it clearer:

```cpp
  // Dummy head of LRU list.
  // lru.prev is newest entry, lru.next is oldest entry.
  // Entries have refs==1 and in_cache==true.
  LRUHandle lru_ GUARDED_BY(mutex_);

  // Dummy head of in-use list.
  // Entries are in use by clients, and have refs >= 2 and in_cache==true.
  LRUHandle in_use_ GUARDED_BY(mutex_);
```

The lru_ member is the list's dummy node. Its next member points to the oldest cache item in the lru_ list, and its prev member points to the newest. In the LRUCache constructor, the next and prev of lru_ both point to itself, indicating an empty list. Remember how we checked for evictable nodes during insertion? It was with lru_.next != &lru_.

```cpp
LRUCache::LRUCache() : capacity_(0), usage_(0) {
  // Make empty circular linked lists.
  lru_.next = &lru_;
  lru_.prev = &lru_;
  in_use_.next = &in_use_;
  in_use_.prev = &in_use_;
}
```

A **dummy node** is a technique used in many data structure implementations to simplify boundary condition handling. In the context of an LRU cache, a dummy node is mainly used as the head of the list, so the head always exists, even when the list is empty. This approach simplifies insertion and deletion operations because **you don't need special handling for an empty list**.

For example, when adding a new element to the list, you can insert it directly between the dummy node and the current first element without checking if the list is empty. Similarly, when deleting an element, you don't have to worry about updating the list head after deleting the last element, because the dummy node is always there.

We've already seen LRU_Remove, which is just two lines of code. For adding a node to the list, I've created a diagram that, combined with the code, should make it easy to understand:

![LRUCache Doubly Linked List Operations](https://slefboot-1251736664.file.myqcloud.com/20250613_leveldb_source_lru_cache_linkedlist.webp)

Here, e is the new node being inserted, and list is the dummy node of the list. I've used circles for list's prev and next to indicate they can point to list itself, as in an initial empty list. The insertion happens before the dummy node, so list->prev is always the newest node in the list, and list->next is always the oldest. For this kind of list manipulation, drawing a diagram makes everything clear.

### reinterpret_cast Conversion

Finally, let's briefly touch on the use of reinterpret_cast in the code to convert between LRUHandle* and Cache::Handle*. **reinterpret_cast forcibly converts a pointer of one type to a pointer of another type without any type checking**. It doesn't adjust the underlying data; it just tells the compiler: "Treat this memory address as if it were of this other type." This operation is generally dangerous and not recommended.

However, LevelDB does this to separate the interface from the implementation. It exposes the concrete internal data structure LRUHandle* to external users as an abstract, opaque handle Cache::Handle*, while internally converting this opaque handle back to the concrete data structure for operations.

**In this specific, controlled design pattern, it is completely safe**. This is because only the LRUCache internal code can create an LRUHandle. Any Cache::Handle* returned to an external user always points to a valid LRUHandle object. Any Cache::Handle* passed to LRUCache must have been previously returned by the same LRUCache instance.

As long as these conventions are followed, reinterpret_cast is just switching between "views" of the pointer; the pointer itself always points to a valid, correctly typed object. If a user tries to forge a Cache::Handle* or pass in an unrelated pointer, the program will have undefined behavior, but that's a misuse of the API.

## ShardedLRUCache Implementation

In the LRUCache implementation, insertion, lookup, and deletion operations must be protected by a single mutex. In a multi-threaded environment, if there's only one large cache, **this lock becomes a global bottleneck**. When multiple threads access the cache simultaneously, only one thread can acquire the lock, and all others must wait, which severely impacts concurrency performance.

To improve performance, ShardedLRUCache divides the cache into multiple shards (the shard_ array), each with its own independent lock. When a request arrives, it is routed to a specific shard based on the key's hash value. This way, different threads accessing different shards can proceed in parallel because they acquire different locks, thereby reducing lock contention and increasing overall throughput. A diagram might make this clearer (Mermaid code is [here](/downloads/mermaid_leveldb_lru_cache_shard.txt)).

![ShardedLRUCache Implementation](https://slefboot-1251736664.file.myqcloud.com/20250613_leveldb_source_lru_cache_shard_en.webp)

So how many shards are needed? LevelDB hardcodes $kNumShards = 1 \\ll kNumShardBits$, which evaluates to 16. This is an empirical choice. If the number of shards is too small, say 2 or 4, lock contention can still be severe on servers with many cores. If there are too many shards, the capacity of each shard becomes very small. This could lead to a "hot" shard frequently evicting data while a "cold" shard has plenty of free space, thus lowering the overall cache hit rate.

Choosing 16 provides sufficient concurrency for typical 8-core or 16-core servers without introducing excessive overhead. Also, choosing a power of two allows for fast shard index calculation using the bitwise operation $hash \\gg (32 - kNumShardBits)$.

With sharding, the original LRUCache class is wrapped. The constructor needs to specify the number of shards, the capacity per shard, etc. The [implementation](https://github.com/google/leveldb/blob/main/util/cache.cc#L352) is as follows:

```cpp
 public:
  explicit ShardedLRUCache(size_t capacity) : last_id_(0) {
    const size_t per_shard = (capacity + (kNumShards - 1)) / kNumShards;
    for (int s = 0; s < kNumShards; s++) {
      shard_[s].SetCapacity(per_shard);
    }
  }
```

Other related cache operations, like insertion, lookup, and deletion, use the Shard function to determine which shard to operate on. Here is insertion as an example, [implemented here](https://github.com/google/leveldb/blob/main/util/cache.cc%23L359):

```cpp
  Handle* Insert(const Slice& key, void* value, size_t charge,
                 void (*deleter)(const Slice& key, void* value)) override {
    const uint32_t hash = HashSlice(key);
    return shard_[Shard(hash)].Insert(key, hash, value, charge, deleter);
  }
```

The HashSlice and Shard functions are straightforward, so we'll skip them. It's also worth noting that ShardedLRUCache inherits from the Cache abstract class and implements its various interfaces. This allows it to be used wherever a Cache interface is expected.

Finally, there's one more small detail worth mentioning: the Cache interface has a NewId function. I haven't seen other LRU cache implementations that support generating an ID from the cache. **Why does LevelDB do this?**

### Cache ID Generation

LevelDB provides comments, but they might not be clear without context. Let's analyze this with a use case.

```cpp
  // Return a new numeric id.  May be used by multiple clients who are
  // sharing the same cache to partition the key space.  Typically the
  // client will allocate a new id at startup and prepend the id to
  // its cache keys.
  virtual uint64_t NewId() = 0;
```

For some background, when we open a LevelDB database, we can create a Cache object and pass it in options.block_cache to cache data blocks and filter blocks from SSTable files. If we don't pass one, LevelDB creates an 8 MB ShardedLRUCache object by default. This **Cache object is globally shared; all Table objects in the database use this same BlockCache instance to cache their data blocks**.

In Table::Open in [table/table.cc](https://github.com/google/leveldb/blob/main/table/table.cc#L72), we see that every time an SSTable file is opened, NewId is called to generate a cache_id. Under the hood, a mutex ensures that the generated ID is globally increasing. Later, when we need to read a data block at offset from an SSTable file, we use <cache_id, offset> as the cache key. This way, different SSTable files have different cache_ids, so even if their offsets are the same, the cache keys will be different, preventing collisions.

Simply put, ShardedLRUCache provides globally increasing IDs mainly to distinguish between different SSTable files, saving each file from having to maintain its own unique ID for cache keys.

## Summary

Alright, that's our analysis of LevelDB's LRU Cache. We've seen the design philosophy and implementation details of an industrial-grade, high-performance cache. Let's summarize the key points:

1.  **Interface and Implementation Separation**: By using an abstract Cache interface, the cache's users are decoupled from its concrete implementation, reflecting the Dependency Inversion Principle of object-oriented design. User code only needs to interact with the Cache interface.
2.  **Carefully Designed Cache Entries**: The LRUHandle struct includes metadata like reference counts and cache flags. It uses a flexible array member to store variable-length keys, reducing memory allocation overhead and improving performance.
3.  **Dual Linked List Optimization**: Using two doubly linked lists (in_use_ and lru_) to manage "in-use" and "evictable" cache items avoids traversing the entire list during eviction, thus improving eviction efficiency.
4.  **Dummy Node Technique**: Using dummy nodes simplifies linked list operations by eliminating the need to handle special cases for empty lists, making the code more concise.
5.  **Sharding to Reduce Lock Contention**: ShardedLRUCache divides the cache into multiple shards, each with its own lock, significantly improving concurrency performance in multi-threaded environments.
6.  **Reference Counting for Memory Management**: Precise reference counting ensures that cache entries are not deallocated while still referenced externally, and that memory is reclaimed promptly when they are no longer needed.
7.  **Assertions for Correctness**: Extensive use of assertions checks preconditions and invariants, ensuring that errors are detected early.

These design ideas and implementation techniques are well worth learning from for our own projects. Especially in high-concurrency, high-performance scenarios, the optimization methods used in LevelDB can help us design more efficient cache systems.