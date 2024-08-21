title: Analysis of Mysterious Field Loss When Using Protobuf in C++
tags:
  - Debug
  - C++
category: Programming
toc: true
description: This article documents a strange field loss issue encountered when using Protobuf in C++. Through investigation and analysis, it was found to be caused by linking different versions of Proto files. It introduces the problem reproduction, dependency analysis, symbol viewing, and other localization methods. It reminds us of the importance of consistent linking versions when using Protobuf, as inconsistencies can lead to unpredictable problems.
date: 2023-09-07 22:24:48
---

I encountered a **particularly strange** problem when using Protobuf, which took a day to investigate before finally discovering the cause. This article records the process of troubleshooting and locating the problem.

![Protobuf field set and then lost](https://slefboot-1251736664.file.myqcloud.com/20230906_protobuf_redefine_cover.png)

<!-- more -->
## Problem Background

In one of our services, there was a simple logic: set the fields in the proto protocol, then convert the pb to json, and send an HTTP request. In a recent change, we added a field called user_type to the original proto and assigned a value to this field. The change was simple, and normally, the new HTTP request's json should have an additional user_type field in the corresponding position. However, after deploying to the test environment, we found that the new request's json not only lacked the new field but also lost several of the original fields!

This seemed bizarre. We've been using protobuf in the project for several years and have never encountered a similar problem. Just adding an optional field and assigning a value to it, why did the old fields disappear too?

## Troubleshooting Process

First, we ruled out some possible points:

1. Code logic issues: We checked the entire service code and confirmed that there was no place that would delete the set fields;
2. Inconsistent proto versions: We recompiled the code for setting fields and the pb2json part, confirming that they all used the latest proto file.

Could it be that the pb2json reflection implemented in the service itself has problems? Would it lose certain fields in some special scenarios? So instead of using this function, we changed to use the DebugString function that comes with protobuf to print the content of pb, and found that there were still missing fields.

It's a bit incredible. The DebugString function comes with protobuf and should be fine. The previous problem investigation required adding logs, changing the service online, which was troublesome. To narrow down the code and eliminate other interferences, **quickly verify the changes**, we wrote a separate tool, set the fields in the proto in the tool, and then printed them out, and the result still lost fields!

Thinking about the entire change again, we added a user_type field to the proto here, then set a value for this field in the code, and then the problem occurred. So what if we only change the proto here and don't set a value for the newly added user_type field? Would there be a problem? We changed the tool and found that the fields printed out were also missing!

**Just because a field was added to the proto, some fields were missing when printed by DebugString?**! This doesn't make sense. Although our protobuf version is very old, we've been using it for so long and never encountered such a problem. The difference between this proto and previous protos is that it has many layers of nested messages. We haven't had so many layers of nesting before. Could it be related to this? So we directly set the message where user_type is located, regardless of other nested messages, and the problem still persisted!

At this point, we started to suspect protobuf. **Could it be that the old version has some bugs**? We're using version 2.6.1, which is about 10 years old. Could this special proto have triggered some mysterious bug? We searched the internet for keywords like "protobuf c++ lack field" but didn't find any related bug descriptions.

It's a bit frustrating. **Reason tells me that even a low version of protobuf wouldn't have such a low-level bug**, but I really can't find what's wrong with my usage that would cause such strange behavior. So I threw the problem to some colleagues, after all, I've tried various things and really couldn't find a clue.

## Solution

Indeed, experts are around us. After reproducing the problem, a colleague immediately pointed out a key point: there's another proto in the project that's almost identical to this one. I also remembered that this module was actually copied from another module and underwent some changes. But the proto protocol used was still the same, just with a new field added here.

Intuition told me that the problem should be what my colleague discovered. To quickly verify, I changed the namespace in this new proto, then recompiled and ran it, and everything returned to normal! It seems that it was indeed because the wrong proto file was read when linking the binary, causing problems in field parsing, which led to the loss of some field values.

However, there are still several questions that need to be answered:

1. **When was the other proto introduced?**
2. **If the two protos have the same fields and functions, why wasn't there a link symbol redefinition error, and why was the wrong proto ultimately used?**
3. **Why does linking to another proto cause the DebugString function to read different fields?**

With these questions in mind, let's delve deeper. First, we need a simple reproducible code, after all, the project code is quite large, slow to compile, and has many interferences, making it troublesome to analyze. Moreover, the project code involves a lot of business information and is not suitable for public disclosure. So we need code that is completely unrelated to the current project, simple enough, and only focuses on the core problem.

## Minimal Reproduction Code

In practice, reproducing the problem here was simpler than imagined, requiring only a small amount of code. Mainly two proto files and one main.cpp file.

First is `modelA/data.proto`, which records one field, corresponding to the older proto in our project:

```cpp
syntax = "proto2";
package model;
message HWPushAndroid{
    optional string bi_tag = 1;
}
```

Then there's `modelB/data.proto`, where the proto package and message name are the same as `modelA/data.proto`, but it has two additional fields, corresponding to the newer proto in the project:

```cpp
syntax = "proto2";
package model;
message HWPushAndroid{
    optional int32 collapse_key = 1 [default = -1];
    optional string bi_tag = 2;
    optional int32 target_user_type = 3;
}
```

Then in `main.cpp`, we use the fields from `modelB/data.proto`, first assigning a value to each field, then printing them out:

```cpp
#include <iostream>
#include "modelB/data.pb.h"  // Assume we want to use modelB's version

int main() {
    model::HWPushAndroid androidMessage;
    androidMessage.set_collapse_key(100);    // This field only exists in modelB's version
    androidMessage.set_bi_tag("example_tag");
    androidMessage.set_target_user_type(1);  // This field only exists in modelB's version
    std::cout << androidMessage.DebugString() << std::endl;
    return 0;
}
```

First, compile the proto files with protoc as follows:

```shell
protoc --cpp_out=. modelA/data.proto
protoc --cpp_out=. modelB/data.proto
```

Then compile and link main as follows:

```cpp
g++ main.cpp -I./ -o main ./modelA/data.pb.cc -lprotobuf
```

After running, you'll find a strange output: `bi_tag: "example_tag"`; Note that the output here is related to the version of protoc, this is the DebugString output of version `3.21.12`. In some older versions like 2.6.1, the output here may be different, or even lose certain field values.

We clearly set three fields, why is only one output? It's simple, because the wrong `data.proto` was linked; the linked proto only has the `bi_tag` field, so only the value of this field is printed. In fact, this also depends on the version of protoc. In older versions, the output might be empty, or even core dump during destruction. Newer versions of protoc handle this situation better and can be compatible with such cases.

The correct compile and link command should be `g++ main.cpp -I./ -o main ./modelB/data.pb.cc -lprotobuf`, which would correctly output all three fields.

## Additional Thoughts

We have successfully reproduced the problem here, now it's time to answer the previous questions.

### Project Dependency Relationships

The first question is, when was the other proto introduced? Our C++ project uses [bazel](https://bazel.build/?hl=zh-cn) for building, and the target I built **theoretically** shouldn't depend on the incorrect proto in modelA. But in reality, it did depend on it. We can use query to view the dependency relationships:

```shell
bazel query 'deps(//**/**:demo_tools)' --output graph > graph.in
dot -Tpng graph.in -o graph.png
```

This will output a dependency relationship graph, showing that the build target indeed depends on protos in both `modelA` and `modelB`. The reason is that the tools directly depend on a comm library, which in turn depends on `modelA`, while modelB is directly depended on by the tools.

Then comes the second question: **Since it depends on both libraries, and there are the same functions in the proto, why didn't the linking report duplicate symbol definitions, and why was the wrong proto ultimately used?**

### Link Symbol Resolution

Before answering the above question, let's go back to the reproduction code and try to compile by introducing `data.pb.cc` from both modelA and modelB at the same time, and see what happens:

```shell
g++ main.cpp -I./ -o main ./modelB/data.pb.cc ./modelA/data.pb.cc -lprotobuf
```

The result is as shown in the following figure, reporting a duplicate symbol definition error:

![Dependency on two modules leading to link failure](https://slefboot-1251736664.file.myqcloud.com/20230905_protobuf_redefine.png)

This is because **the linker found two identical strong symbol definitions in the object files and couldn't choose which one to use, so it directly reported a linking error**. However, in the actual project, these two protos are in different modules, compiled into libraries first and then linked. Linking can be dynamic or static, let's first look at the case of C++ dynamic libraries. Compile these two protos into dynamic libraries, then use dynamic linking. The specific commands are as follows:

```shell
g++ -c -fPIC modelA/data.pb.cc -o modelA/data.pb.o -I.
g++ -c -fPIC modelB/data.pb.cc -o modelB/data.pb.o -I.
g++ -shared -o libmodelA.so modelA/data.pb.o
g++ -shared -o libmodelB.so modelB/data.pb.o
g++ main.cpp -I./ -o main -L./ -lmodelA -lmodelB -lprotobuf -Wl,-rpath,./
g++ main.cpp -I./ -o main -L./ -lmodelB -lmodelA -lprotobuf -Wl,-rpath,./
```

When linking, there are two linking orders for modelA and modelB, and the results of the binary execution are also different:

![Different dynamic linking order, different results](https://slefboot-1251736664.file.myqcloud.com/20230906_protobuf_redefine_linkorder.png)

What about static linking? The commands for static linking are as follows:

```shell
g++ -c modelA/data.pb.cc -o modelA/data.pb.o -I.
g++ -c modelB/data.pb.cc -o modelB/data.pb.o -I.
ar rcs libmodelA.a modelA/data.pb.o
ar rcs libmodelB.a modelB/data.pb.o
g++ main.cpp -I./ -o main -L./  -lmodelA -lmodelB -lprotobuf
g++ main.cpp -I./ -o main -L./  -lmodelB -lmodelA -lprotobuf
```

We find that, just like dynamic linking, different linking orders result in different outcomes. From the experimental results, it appears that during linking, **whether it's dynamic or static linking, the symbol definition from the library listed earlier is actually used**. This behavior is determined by the design of the linker and is not specific to static or dynamic linking. However, it's worth noting that not all linkers will do this; this is specific to the GNU linker (commonly used on Linux), and other linkers may have different behaviors or options.

In the classic work [Computer Systems: A Programmer's Perspective](https://hansimov.gitbook.io/csapp/), section 7.6.3 **How Linkers Use Static Libraries to Resolve References** provides a detailed explanation of this.

### Which Symbols Were Linked

Now let's answer the third question: Why does linking to another proto cause the DebugString function to read different fields?

Through the above experiments, we know that due to incorrect linking order, the fields read by protobuf's `DebugString` are different. So which symbol resolutions are wrong, causing incorrect output? We can use the `objdump` command to check the symbols in the binary. Let's first look at the DebugString symbol, with the specific command as follows:

```shell
$ objdump -tT  main | grep DebugString
0000000000000000       F *UND*	0000000000000000              _ZNK6google8protobuf7Message11DebugStringB5cxx11Ev
0000000000000000      DF *UND*	0000000000000000  Base        _ZNK6google8protobuf7Message11DebugStringB5cxx11Ev
```

In the binary files generated with different linking orders, the DebugString function is marked as `UND` (undefined), which means this function is not defined in the current binary file but is loaded from some dynamic library at runtime. We can use ldd to find the address of the protobuf dynamic library that the binary depends on, and then use readelf to verify that it's indeed in the libprotobuf dynamic library:

```
$ ldd mainA
	linux-vdso.so.1 (0x00007ffe53b86000)
	libprotobuf.so.32 => /lib/x86_64-linux-gnu/libprotobuf.so.32 (0x00007f6682359000)
	...

$ nm -D /lib/x86_64-linux-gnu/libprotobuf.so.32 | grep DebugString
...
```

The implementation of `DebugString` is in [protobuf/src/google/protobuf/text_format.cc](https://github.com/protocolbuffers/protobuf/blob/main/src/google/protobuf/text_format.cc#L131), which uses a **reflection mechanism** and is quite complex. I haven't fully understood it yet, and when I have time, I can continue to study it and organize a dedicated article. Here we just want to know why `target_user_type` wasn't output, so let's try filtering this symbol and see if there's any difference in the binaries with different orders, as shown in the following figure:

![Different dynamic linking order, different results](https://slefboot-1251736664.file.myqcloud.com/20230906_protobuf_redefine_sysbol.png)

We can see that under both linking orders, there are symbols from modelB like `set_target_user_type`, corresponding to two functions:

```shell
$ c++filt _ZN5model13HWPushAndroid20set_target_user_typeEi
model::HWPushAndroid::set_target_user_type(int)
$ c++filt _ZN5model13HWPushAndroid30_internal_set_target_user_typeEi
model::HWPushAndroid::_internal_set_target_user_type(int)
```

This is as expected because main calls this function to set it, and modelA doesn't have this field, so regardless of the order, it will link to modelB's symbol implementation. However, when modelA is in front, the following symbols are missing:

```shell
$ c++filt _ZN5model13HWPushAndroid9_Internal24set_has_target_user_typeEPN6google8protobuf8internal7HasBitsILm1EEE
model::HWPushAndroid::_Internal::set_has_target_user_type(google::protobuf::internal::HasBits<1ul>*)
$ c++filt _ZNK5model13HWPushAndroid26_internal_target_user_typeEv
model::HWPushAndroid::_internal_target_user_type() const
```

For protobuf, all the metadata of this type, including all fields, nested types, etc., are associated with the generated message type. This allows for very rich reflection operations at runtime, including but not limited to finding fields, dynamically creating messages, dynamically setting and getting field values, etc. Here, linking the pb from modelA first causes the message type in the proto to not be associated with the target_user_type field, so the functions `_internal_target_user_type()` and `set_has_target_user_type` are not used, hence these two symbols are not in the binary.

Going a step further, what happens if I directly access the target_user_type field in main.cpp? The code is as follows:

```cpp
...
std::cout << androidMessage.target_user_type() << std::endl;
std::cout << androidMessage.DebugString() << std::endl;
```

We can see that the output of DebugString is still related to the linking order, but regardless of the order, directly outputting target_user_type is possible. This time, because the target_user_type() function is directly used, both binaries have the following symbols:

```shell
$ c++filt _ZNK5model13HWPushAndroid16target_user_typeEv
model::HWPushAndroid::target_user_type() const
$ c++filt _ZNK5model13HWPushAndroid26_internal_target_user_typeEv
model::HWPushAndroid::_internal_target_user_type() const
```

At this point, the three questions in the article have been resolved. When using protobuf, we must pay attention to **whether the linked proto implementation is correct**. If there are duplicate fields in multiple protos, we can use namespaces to distinguish them, which will avoid the linking error problem in this article.

During the troubleshooting process of this problem, it really felt like "seeing a ghost". Even with simple and common usage, there can be such unexpected behavior. Through various exclusion methods of debugging, we couldn't locate the problem at all, giving a sense of helplessness like hitting a "ghost wall". Thankfully, with the hints from colleagues, we were able to clear the fog and finally locate the problem. And through reproduction, we further understood the reasons behind it.