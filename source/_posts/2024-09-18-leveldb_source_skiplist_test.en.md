---
title: LevelDB Explained - How to Test Parallel Read and Write of SkipLists?
tags:
  - C++
  - LevelDB
category: Source Code Analysis
toc: true
date: 2024-09-18 21:00:00
mathjax: true
description: This article delves into the testing methods of LevelDB's skip list implementation, focusing on verifying correctness in parallel read and write scenarios. It details the clever design of test Keys, the implementation of write and read thread operations, and specific methods for single-threaded and multi-threaded testing. The article also discusses the limitations of parallel testing and introduces the ThreadSanitizer tool for deeper data race detection.
---

In the previous article [LevelDB Source Code Reading: Principles, Implementation, and Visualization of Skip Lists](https://selfboot.cn/en/2024/09/09/leveldb_source_skiplist/), we started by discussing the drawbacks of current binary search trees and balanced trees, which led to the introduction of skip lists as a data structure. Then, combining with the original paper, we explained the implementation principles of skip lists. Next, we analyzed in detail the code implementation in LevelDB, including the iterator implementation and **extreme performance optimization for parallel reading**. Finally, we provided a visualization page that intuitively shows the skip list construction process.

However, two questions remain:

1. How to test the LevelDB skip list code to ensure functional correctness? Especially, **how to ensure the correctness of skip list implementation in parallel read and write scenarios**.
2. How to **quantitatively analyze** the time complexity of skip lists?

Next, by analyzing LevelDB's test code, we'll first answer the first question. The quantitative analysis of skip list performance will be covered in a separate article.
<!-- more -->

## Skip List Test Analysis

In [the previous article](https://selfboot.cn/en/2024/09/09/leveldb_source_skiplist/), we analyzed the implementation of LevelDB's skip list. So, is this implementation correct? If we were to write test cases, how should we write them? From which aspects should we test the correctness of the skip list? Let's look at LevelDB's test code [skiplist_test.cc](https://github.com/google/leveldb/blob/main/db/skiplist_test.cc).

First is the **empty skip list test**, which verifies that an empty skip list contains no elements and checks the iterator operations of an empty skip list such as SeekToFirst, Seek, SeekToLast, etc. Then there are test cases for insertion, lookup, and iterator, which verify whether the skip list correctly contains these keys and test the forward and backward traversal of the iterator by continuously inserting a large number of randomly generated key-value pairs.

```cpp
TEST(SkipTest, InsertAndLookup) {
  // Test insertion and lookup functionality
  // Insert randomly generated key-value pairs
  // Verify that the skip list correctly contains these keys
  // Test forward and backward traversal of the iterator
}  
```

These are fairly standard test cases, so we won't expand on them here. Let's focus on LevelDB's **parallel testing**.

### Test Key Design

LevelDB's skip list supports single-threaded write and multi-threaded parallel read. We analyzed the details of parallel read implementation in the previous article, so how should we test it? Let's first define the test objective: when multiple threads are reading in parallel, **after each read thread initializes its iterator, it should be able to read all the elements currently in the skip list**. Since there's a write thread running simultaneously, read threads **may also read newly inserted elements**. At any time, **the elements read by read threads should satisfy the properties of a skip list**, i.e., each element should be less than or equal to the next element.

LevelDB's test method is designed quite cleverly. First is a **carefully designed element value Key** (capitalized here to distinguish from key), with clear comments:

```cpp
// We generate multi-part keys:
//     <key,gen,hash>
// where:
//     key is in range [0..K-1]
//     gen is a generation number for key
//     hash is hash(key,gen)
//
// The insertion code picks a random key, sets gen to be 1 + the last
// generation number inserted for that key, and sets hash to Hash(key,gen).
//
``` 

The skip list element value consists of three parts: key is randomly generated, gen is the incremental insertion sequence number, and hash is the hash value of key and gen. All three parts are placed in a uint64_t integer, with the high 24 bits being key, the middle 32 bits being gen, and the low 8 bits being hash. Below is the code for extracting the three parts from Key and generating Key from key and gen:

```cpp
typedef uint64_t Key;

class ConcurrentTest {
 private:
  static constexpr uint32_t K = 4;

  static uint64_t key(Key key) { return (key >> 40); }
  static uint64_t gen(Key key) { return (key >> 8) & 0xffffffffu; }
  static uint64_t hash(Key key) { return key & 0xff; }
  // ...
  static Key MakeKey(uint64_t k, uint64_t g) {
    static_assert(sizeof(Key) == sizeof(uint64_t), "");
    assert(k <= K);  // We sometimes pass K to seek to the end of the skiplist
    assert(g <= 0xffffffffu);
    return ((k << 40) | (g << 8) | (HashNumbers(k, g) & 0xff));
  }
```

**Why design key this way**? The value of key ranges from 0 to K-1, where K is 4 here. Although key occupies the high 24 bits, its value range is 0-3. In fact, the key value design could work perfectly fine without using the high 24 bits, and it wouldn't significantly affect the subsequent test logic. I asked gpto1 and claude3.5 about this, but their explanations weren't convincing. Considering the subsequent parallel read and write test code, my personal understanding is that it might be intended to **simulate seek operations with large spans in the linked list**. Feel free to correct me in the comments section if you have a more plausible explanation!

The benefits of gen and hash are more obvious. By ensuring gen increments during insertion, read threads can use gen to **verify the order of elements inserted into the skip list**. The low 8 bits of each key is a hash, which can be used to verify **whether the elements read from the skip list are consistent with the inserted elements**, as shown in the IsValidKey method:

```cpp
  static uint64_t HashNumbers(uint64_t k, uint64_t g) {
    uint64_t data[2] = {k, g};
    return Hash(reinterpret_cast<char*>(data), sizeof(data), 0);
  }
  static bool IsValidKey(Key k) {
    return hash(k) == (HashNumbers(key(k), gen(k)) & 0xff);
  }
```

Here, the low 8 bits of the key value are extracted and compared with the hash value generated from key and gen. If they are equal, it indicates that the element is valid. All the above implementations are placed in the [ConcurrentTest class](https://github.com/google/leveldb/blob/main/db/skiplist_test.cc#L152), which serves as an auxiliary class, defining a series of Key-related methods and read/write skip list parts.

### Write Thread Operation

Next, let's look at the write thread operation method WriteStep. It's a public member method of the ConcurrentTest class, with the core code as follows:

```cpp
  // REQUIRES: External synchronization
  void WriteStep(Random* rnd) {
    const uint32_t k = rnd->Next() % K;
    const intptr_t g = current_.Get(k) + 1;
    const Key key = MakeKey(k, g);
    list_.Insert(key);
    current_.Set(k, g);
  }
```

Here, a key is randomly generated, then the previous gen value corresponding to that key is obtained, incremented to generate a new gen value, and the Insert method is called to insert a new key into the skip list. The new key is generated using the previously mentioned MakeKey method, **based on key and gen**. After inserting into the skip list, the gen value corresponding to the key is updated, ensuring that the elements inserted under each key have incremental gen values. The value of key here ranges from 0 to K-1, where K is 4.

The current_ here is a State structure that **stores the gen value corresponding to each key**, with the code as follows:

```cpp
  struct State {
    std::atomic<int> generation[K];
    void Set(int k, int v) {
      generation[k].store(v, std::memory_order_release);
    }
    int Get(int k) { return generation[k].load(std::memory_order_acquire); }

    State() {
      for (int k = 0; k < K; k++) {
        Set(k, 0);
      }
    }
  };
```

The State structure has an atomic array generation that stores the gen value corresponding to each key. The use of atomic types and memory_order_release, memory_order_acquire semantics here ensures that **once the write thread updates the gen value of a key, the read thread can immediately read the new value**. For understanding the memory barrier semantics of atomic, you can refer to the Node class design in the skip list implementation from the previous article.

### Read Thread Operation

The write thread above is relatively simple, with one thread continuously inserting new elements into the skip list. The read thread is more complex, **not only reading elements from the skip list but also verifying that the data conforms to expectations**. Here's the overall approach for testing read threads as given in the comments:

```cpp
// At the beginning of a read, we snapshot the last inserted
// generation number for each key.  We then iterate, including random
// calls to Next() and Seek().  For every key we encounter, we
// check that it is either expected given the initial snapshot or has
// been concurrently added since the iterator started.
```

To ensure the correctness of the skip list in a parallel read-write environment, we can verify from the following 3 aspects:

1. Consistency verification: Ensure that read threads **do not miss keys that already existed when the iterator was created** during the iteration process.
2. Sequential traversal: Verify that **the order of iterator traversal is always increasing**, avoiding backtracking.
3. Parallel safety: Simulate parallel read operation scenarios through random iterator movement strategies to detect potential race conditions or data inconsistency issues.

The ReadStep method here has a while(true) loop. Before starting the loop, it first records the initial state of the skip list in initial_state, then uses the [RandomTarget](https://github.com/google/leveldb/blob/main/db/skiplist_test.cc#L176) method to randomly generate a target key pos, and uses the Seek method to search.

```cpp
void ReadStep(Random* rnd) {
    // Remember the initial committed state of the skiplist.
    State initial_state;
    for (int k = 0; k < K; k++) {
      initial_state.Set(k, current_.Get(k));
    }

    Key pos = RandomTarget(rnd);
    SkipList<Key, Comparator>::Iterator iter(&list_);
    iter.Seek(pos);

    //...
    while (true) {
      ...
    }
}
```

Then comes the entire verification process. Here, we've omitted the case where pos is not found in the skip list and only look at the core test path.

```cpp
    while (true) {
      Key current;
      //...
      current = iter.key();
      ASSERT_TRUE(IsValidKey(current)) << current;
      ASSERT_LE(pos, current) << "should not go backwards";

      // Verify that everything in [pos,current) was not present in
      // initial_state.
      while (pos < current) {
        ASSERT_LT(key(pos), K) << pos;
        ASSERT_TRUE((gen(pos) == 0) ||
                    (gen(pos) > static_cast<Key>(initial_state.Get(key(pos)))))
            << "key: " << key(pos) << "; gen: " << gen(pos)
            << "; initgen: " << initial_state.Get(key(pos));

        // Advance to next key in the valid key space
        if (key(pos) < key(current)) {
          pos = MakeKey(key(pos) + 1, 0);
        } else {
          pos = MakeKey(key(pos), gen(pos) + 1);
        }
      }
      // ...
  }
```

After finding the position current, it verifies if the hash of the key value at current is correct, then verifies if pos <= current. Afterwards, it uses a while loop to traverse the skip list, verifying that all keys in the `[pos, current)` interval were not in the initial state initial_state. Here, we can use **proof by contradiction: if there's a key tmp in the [pos, current) interval that's also in initial_state, then according to the properties of skip lists, Seek would have found tmp instead of current**. So as long as the linked list is implemented correctly, all keys in the [pos, current) interval should not be in initial_state.

Of course, we haven't recorded the key values in the skip list here. We only need to verify that the gen values of all keys in the [pos, current) interval are greater than the gen values in the initial state, which can prove that all keys in this range were not in the linked list when iteration began.

After each round of verification above, a new test target key pos is found and the iterator is updated, as shown in the following code:

```cpp
      if (rnd->Next() % 2) {
        iter.Next();
        pos = MakeKey(key(pos), gen(pos) + 1);
      } else {
        Key new_target = RandomTarget(rnd);
        if (new_target > pos) {
          pos = new_target;
          iter.Seek(new_target);
        }
      }
```

Here, it randomly decides whether to move to the next key with iter.Next() or create a new target key and relocate to that target key. The entire read test simulates the uncertainty in a real environment, ensuring the stability and correctness of the skip list under various access patterns.

### Single-threaded Read and Write

After introducing the methods for testing read and write, let's see how to combine them with threads for testing. Single-threaded read and write is relatively simple, just alternating between write and read execution.

```cpp
// Simple test that does single-threaded testing of the ConcurrentTest
// scaffolding.
TEST(SkipTest, ConcurrentWithoutThreads) {
  ConcurrentTest test;
  Random rnd(test::RandomSeed());
  for (int i = 0; i < 10000; i++) {
    test.ReadStep(&rnd);
    test.WriteStep(&rnd);
  }
}
```

### Parallel Read and Write Testing

In real scenarios, there's one write thread but can be multiple read threads, and we need to test the correctness of the skip list in parallel read and write scenarios. The core test code is as follows:

```cpp
static void RunConcurrent(int run) {
  const int seed = test::RandomSeed() + (run * 100);
  Random rnd(seed);
  const int N = 1000;
  const int kSize = 1000;
  for (int i = 0; i < N; i++) {
    if ((i % 100) == 0) {
      std::fprintf(stderr, "Run %d of %d\n", i, N);
    }
    TestState state(seed + 1);
    Env::Default()->Schedule(ConcurrentReader, &state);
    state.Wait(TestState::RUNNING);
    for (int i = 0; i < kSize; i++) {
      state.t_.WriteStep(&rnd);
    }
    state.quit_flag_.store(true, std::memory_order_release);
    state.Wait(TestState::DONE);
  }
}
``` 

Here, each test case iterates N times. In each iteration, the Env::Default()->Schedule method is used to create a new thread to execute the ConcurrentReader function, passing state as a parameter. ConcurrentReader will perform read operations in an independent thread, simulating a parallel read environment. Then, it calls state.Wait(TestState::RUNNING) to wait for the read thread to enter the running state before the main thread starts write operations.

Here, write operations are performed by calling state.t_.WriteStep(&rnd) in a loop, executing kSize write operations on the skip list. Each write operation will insert a new key-value pair into the skip list, simulating the behavior of the write thread. After completing the write operations, state.quit_flag_ is set to true, notifying the read thread to stop reading operations and exit. It then waits for the read thread to complete all operations and exit, ensuring that all read and write operations in the current loop have ended before proceeding to the next test.

This test uses TestState to synchronize thread states and encapsulates a ConcurrentReader as the read thread method. It also calls the Schedule method encapsulated by Env to execute read operations in an independent thread. This involves condition variables, mutexes, and thread-related content, which we won't expand on here.

It's worth noting that this **only tests the scenario of one write and one read in parallel, and doesn't test one write with multiple reads**. Multiple read threads could be started in each iteration, with all read threads executing concurrently with the write operation. Alternatively, a fixed pool of read threads could be maintained, with multiple read threads running continuously, operating concurrently with the write thread. However, the current test, through repeated one-write-one-read iterations, can still effectively verify the correctness and stability of the skip list under read-write concurrency.

Below is a screenshot of the test case execution output:

![Parallel test output](https://slefboot-1251736664.file.myqcloud.com/20240918_leveldb_source_skiplist_more_runtest.png)

## Correctness of Parallel Testing

The above parallel testing is quite detailed, but it's worth elaborating a bit more. For this kind of parallel code, especially code involving memory barriers, sometimes **passing tests might just be because issues weren't triggered** (the probability of problems occurring is very low, and it might also be related to the compiler and CPU model). For example, if I slightly modify the Insert operation here:

```cpp
  for (int i = 0; i < height; i++) {
    // NoBarrier_SetNext() suffices since we will add a barrier when
    // we publish a pointer to "x" in prev[i].
    x->NoBarrier_SetNext(i, prev[i]->NoBarrier_Next(i));
    prev[i]->NoBarrier_SetNext(i, x); // Change here, Use NoBarrier_SetNext
  }
```

Here, both pointers use the NoBarrier_SetNext method to set, then recompile the LevelDB library and test program, run multiple times, and all test cases can pass.

Of course, in this case, long-term testing can be conducted under different hardware configurations and loads, which might reveal issues. However, the drawback is that it's time-consuming and may not be able to reproduce the issues found.

### Detecting Data Races with ThreadSanitizer

In addition, we can use clang's dynamic analysis tool [ThreadSanitizer](https://clang.llvm.org/docs/ThreadSanitizer.html) to detect data races. It's relatively simple to use, just add the `-fsanitize=thread` option when compiling. The complete compilation command is as follows:

```shell
CC=/usr/bin/clang CXX=/usr/bin/clang++  cmake -DCMAKE_BUILD_TYPE=Debug -DCMAKE_EXPORT_COMPILE_COMMANDS=1 -DCMAKE_CXX_FLAGS="-fsanitize=thread" -DCMAKE_C_FLAGS="-fsanitize=thread" -DCMAKE_EXE_LINKER_FLAGS="-fsanitize=thread" -DCMAKE_INSTALL_PREFIX=$(pwd) .. && cmake --build . --target install
```

Recompile and link the code with the above modification, run the test case, and the result is as follows:

![ThreadSanitizer detecting data race](https://slefboot-1251736664.file.myqcloud.com/20240918_leveldb_source_skiplist_more_threadsanitizer.png)

It has precisely located the problematic code. If we undo this erroneous modification and recompile and run, there won't be any issues. The implementation principle of ThreadSanitizer is quite complex. When the program is compiled, TSan **inserts check code before and after each memory access operation**. During runtime, when the program executes a memory access operation, the inserted code is triggered. This code checks and updates the corresponding shadow memory. It compares the current access with the historical access records of that memory location. If a potential data race is detected, TSan records detailed information, including stack traces.

Its advantage is that it can detect subtle data races that are difficult to discover through other methods, while providing detailed diagnostic information, which helps to quickly locate and fix problems. However, it significantly increases the program's runtime and memory usage. It may not be able to detect all types of concurrent errors, especially those that depend on specific timing.

## Summary

We have completed the analysis of the skip list testing part, focusing on the correctness verification in parallel read and write scenarios. The design of the inserted key value Key and the verification method of read threads are both very clever, worthy of our reference. At the same time, we should recognize that in multi-threaded scenarios, data race detection is sometimes difficult to discover through test cases alone. Tools like ThreadSanitizer can assist in discovering some issues.

Finally, welcome everyone to leave comments and exchange ideas!