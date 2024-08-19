---
title: LevelDB Explained -  Understanding Advanced C++ Techniques
tags:
  - C++
  - LevelDB
category: Source Code Analysis
toc: true
date: 2024-08-13 21:00:00
description: This article delves into the advanced C++ techniques used in LevelDB, including flexible arrays, symbol exporting for linking, and the Pimpl class design. Through specific code examples, it explains in detail how to implement variable-length data structures using flexible arrays, optimizing memory usage and reducing memory fragmentation. It also introduces different methods of symbol exporting and their importance for cross-platform compilation, as well as the application of the Pimpl design pattern in encapsulation and binary compatibility.
---

The overall code of LevelDB is quite understandable, **without using many esoteric C++ techniques**. However, there are some implementations that are relatively uncommon, such as flexible arrays, symbol exporting for linking, and Pimpl class design. This article will review these advanced C++ techniques to help better understand the implementation of LevelDB.

## Flexible Arrays

In the LRUHandle structure definition in [util/cache.cc](https://github.com/google/leveldb/blob/main/util/cache.cc), there's a flexible array member `char key_data[1]`, used to implement **variable-length data structures** in C/C++.

```cpp
struct LRUHandle {
  // ...
  char key_data[1];  // Beginning of key

  Slice key() const {
    assert(next != this);
    return Slice(key_data, key_length);
  }
};
```

<!-- more -->

In this handle structure, `key_data[1]` is actually just a placeholder. The space actually allocated to `key_data` is larger than 1 byte, determined by the total_size calculated during malloc. Specifically, in LevelDB's implementation, when inserting a new cache entry, memory is dynamically allocated based on the length of the key, and then the content of the key is copied into this memory. The code is as follows:

```cpp
Cache::Handle* LRUCache::Insert(const Slice& key, uint32_t hash, void* value,
                                size_t charge,
                                void (*deleter)(const Slice& key,
                                                void* value)) {
  MutexLock l(&mutex_);
  // Calculate the total memory size needed. Note that 1 is subtracted here because key_data[1] is a placeholder, already having one byte
  LRUHandle* e = reinterpret_cast<LRUHandle*>(malloc(sizeof(LRUHandle) - 1 + key.size()));
  e->value = value;
  // ...
  e->refs = 1;  // for the returned handle.
  // Copy key data into key_data
  std::memcpy(e->key_data, key.data(), key.size());
  // ... omitted
```

The code above allocates **contiguous memory** for both the LRUHandle structure and the trailing key_data array in a single malloc call. This avoids allocating memory separately for the key data, thereby **reducing additional memory allocation overhead and potential memory fragmentation issues**. At the same time, the entire data structure of LRUHandle is compactly stored in a contiguous block of memory, improving space utilization and potentially enhancing cache locality. If std::vector or std::string were used instead, it would require two memory allocations for each LRUHandle object: one for the LRUHandle object itself, and one for the dynamically allocated memory by std::vector or std::string to store the data. In a high-performance database implementation, such memory allocation overhead is not negligible.

Furthermore, the array length at the end of the structure here is 1. In many other code examples, **the trailing array length is 0 or not written at all**. What's the difference between these two methods? In fact, both approaches are used to add variable-length data at the end of a structure. `char key_data[];` is a more explicit way of declaring a trailing array, directly indicating that the array itself doesn't allocate any space, introduced in the C99 standard. However, this declaration is not legal in some standard C++ versions, although some compilers may support it as an extension. In C++, to avoid compatibility issues, it's usually recommended to use `char key_data[1];`, as it typically has better support in compilers.

There are some discussions about this that you can refer to: [What's the need of array with zero elements?](https://stackoverflow.com/questions/14643406/whats-the-need-of-array-with-zero-elements) and [One element array in struct](https://stackoverflow.com/questions/4559558/one-element-array-in-struct).

## Symbol Exporting for Linking

In many classes in include/leveldb, such as the [DB class](https://github.com/google/leveldb/blob/main/include/leveldb/db.h#L46) in [db.h](https://github.com/google/leveldb/blob/main/include/leveldb/db.h), the definition includes a macro `LEVELDB_EXPORT`, as follows:

```cpp
class LEVELDB_EXPORT DB {
 public:
 ...
};
```

The definition of this macro is in [include/leveldb/export.h](https://github.com/google/leveldb/blob/main/include/leveldb/export.h), with many compilation option branches. For ease of reading, indentation has been added below (the actual code doesn't have it):

```cpp
#if !defined(LEVELDB_EXPORT)
    #if defined(LEVELDB_SHARED_LIBRARY)
        #if defined(_WIN32)
            #if defined(LEVELDB_COMPILE_LIBRARY)
            #define LEVELDB_EXPORT __declspec(dllexport)
            #else
            #define LEVELDB_EXPORT __declspec(dllimport)
        #endif  // defined(LEVELDB_COMPILE_LIBRARY)

        #else  // defined(_WIN32)
            #if defined(LEVELDB_COMPILE_LIBRARY)
            #define LEVELDB_EXPORT __attribute__((visibility("default")))
        #else
            #define LEVELDB_EXPORT
        #endif
    #endif  // defined(_WIN32)
    #else  // defined(LEVELDB_SHARED_LIBRARY)
        #define LEVELDB_EXPORT
    #endif
#endif  // !defined(LEVELDB_EXPORT)
```

We know that leveldb itself doesn't provide database services like MySQL or PostgreSQL; it's just a library that we can link to for reading and writing data. To export leveldb as a dynamic link library, it's necessary to control the visibility and linking attributes of symbols. To support cross-platform builds, different attributes are specified based on different platform information.

On Linux systems, when compiling the library, if LEVELDB_COMPILE_LIBRARY is defined, the `__attribute__((visibility("default")))` attribute will be added. This sets the linking visibility of the symbol to default, so that other code linking to this shared library can use this class.

What's the problem if we don't use this macro to export symbols? In the Linux environment, **all symbols are visible by default**, which will export more symbols. This not only increases the size of the library but may also conflict with symbols in other libraries. Hiding some symbols that are not intended for public use can help the linker optimize the program, **improving loading speed and reducing memory usage**. Moreover, through export macros, we can explicitly control which interfaces are public and which are private, **hiding implementation details to achieve good encapsulation**.

When `LEVELDB_SHARED_LIBRARY` is not defined, the LEVELDB_EXPORT macro **is defined as empty**, which means that when leveldb is compiled as a static library, all symbols that might otherwise need special export/import markers don't need such markers. In the case of static linking, symbol exporting is not necessary for the linking process because the code of the static library will be directly included in the final binary file during compilation.

## Pimpl Class Design

In many classes in LevelDB, there is only one private member variable of pointer type. For example, in the TableBuild class definition in the include/leveldb/table_builder.h header file, there is a private member variable Rep *rep_, which is a pointer to the Rep structure:

```cpp
 private:
  struct Rep;
  Rep* rep_;
```

Then in the [table/table_builder.cc](https://github.com/google/leveldb/blob/main/table/table_builder.cc) file, the Rep structure is defined:

```cpp
struct TableBuilder::Rep {
  Rep(const Options& opt, WritableFile* f)
      : options(opt),
        index_block_options(opt),
        file(f),
// ...
```

**Why not directly define the Rep structure in the header file**? In fact, this is using the **Pimpl (Pointer to Implementation)** design pattern, which has several advantages:

- **Binary compatibility** (ABI stability). When the TableBuilder class library is updated, as long as its interface (.h file) remains unchanged, even if members are added to the Rep structure in the implementation or the implementation of the interface is changed, applications depending on this library **only need to update the dynamic library file, without recompilation**. If binary compatibility is not achieved, for example, if some member variables are added to a public class, and the application only updates the dynamic library without recompiling, it will cause the program to crash at runtime due to inconsistent object memory distribution. You can refer to a similar problem encountered in a previous business scenario, [Analysis of C++ Process Coredump Caused by Missing Bazel Dependencies](https://selfboot.cn/2024/03/15/object_memory_coredump/).
- **Reduced compilation dependencies**. If the definition of the Rep structure is in the header file, any modification to the Rep structure would cause files that include table_builder.h to be recompiled. By putting the definition of the Rep structure in the source file, only table_builder.cc needs to be recompiled.
- **Separation of interface and implementation**. The interface (public methods defined in the .h file) and the implementation (the Rep structure and specific implementation defined in the .cc file) are completely separate. This allows developers to freely modify implementation details, such as adding new private member variables or modifying internal logic, without changing the public interface.

**Why do these advantages exist after using member pointers**? This comes down to the memory layout of C++ objects. The layout of an object of a class in memory is contiguous and directly includes all of its non-static member variables. If the member variables are simple types (like int, double, etc.) or objects of other classes, these members will be directly embedded into the object's memory layout. You can refer to my previous article [In-depth Understanding of C++ Object Memory Layout with Examples](https://selfboot.cn/2024/05/10/c++_object_model/) for more information.

When a member variable is a pointer to another class, its layout in memory is just a pointer (Impl* pImpl), not the specific class object. The **size and alignment of this pointer are fixed, regardless of what data Impl contains**. Therefore, no matter how the internal implementation of the class corresponding to the pointer changes (e.g., adding or removing data members, changing the types of members, etc.), the size and layout of the external class remain unchanged and unaffected.

In "Effective C++", Item 31 mentions using this approach to reduce compilation dependencies:

> If you can accomplish a task with object references or pointers, don't use objects. You can define references and pointers to a type with just a type declaration; but if you define objects of a type, you need the type's definition.

Of course, there's no silver bullet in software development, and these advantages come with corresponding costs. Refer to [cppreference.com: PImpl](https://en.cppreference.com/w/cpp/language/pimpl):

- **Lifecycle management overhead (Runtime Overhead)**: Pimpl typically requires dynamically allocating memory on the heap to store the implementation object (Impl object). This dynamic allocation is **slower than allocating objects on the stack** (usually a faster allocation method) and involves more complex memory management. Additionally, allocating memory on the heap can cause memory leaks if not released. However, in the above example, Rep is allocated during object construction and released during destruction, so it won't cause memory leaks.
- **Access overhead**: Each time a private member function or variable is accessed through Pimpl, it requires indirect access through a pointer.
- **Space overhead**: Each class using Pimpl will add at least one pointer's worth of space overhead in its object to store the implementation pointer. If the implementation part needs to access public members, additional pointers may be needed or pointers may need to be passed as parameters.

Overall, Pimpl is a good design pattern for basic libraries. You can also refer to [Is the PIMPL idiom really used in practice?](https://stackoverflow.com/questions/8972588/is-the-pimpl-idiom-really-used-in-practice) for more discussion.

## Others

### constexpr

`constexpr` specifies variables or functions used to declare constant expressions. The purpose of this declaration is to inform the compiler that **this value or function is known at compile time**, allowing for more optimization and checks during compilation.

```cpp
static constexpr int kCacheSize = 1000;
```

Compared to const, constexpr emphasizes compile-time constants, while const variables are initialized at the time of declaration, but they **don't necessarily have to be determined at compile time**, usually just indicating that they cannot be modified at runtime.