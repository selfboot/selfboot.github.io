---
title: Analysis of Storage Failure Caused by Protobuf Serialized Messages
tags:
  - Debug
  - Go
category: Programming
toc: true
description: This article reproduces a typical case using Go code, two services use different versions of Protobuf message definitions, where one service repeatedly merges old and new messages, causing the message size to continuously increase. It analyzes how the handling of unknown fields in the source code leads to the problem.
date: 2023-09-09 22:19:40
lang: en
---

Previously, I encountered a problem in actual business where Protobuf serialized messages caused storage failures. At that time, this issue almost led to a major failure, but I didn't write an article to properly reflect on it. Recently, I encountered another Protobuf problem, and after writing [Investigating the Mysterious Field Loss Problem When Using Protobuf in C++](https://selfboot.cn/en/2023/09/07/protobuf_redefine/), I was reminded of the previous issue. Here, I'd like to write another article to properly introduce the pitfall I encountered last time.

![Analysis of Storage Failure Caused by Protobuf Serialized Messages](https://slefboot-1251736664.file.myqcloud.com/20230910_protobuf_field_merge_summary.png)

<!-- more -->

## Failure Review

A certain HTTP request in the business consistently timed out. Through logs, we quickly located that a certain service reading from KV at the bottom layer had timed out, where reading from KV didn't finish within 5 seconds. This was a core KV, with fine-grained monitoring, and the average latency and P99 were at the millisecond level. Such long latency had never occurred before.

Fortunately, the timeout for this key was consistently reproducible. For reproducible problems, it's much easier to investigate. I directly wrote a tool, set the timeout a bit longer, so that we could read the complete content. Since what was stored here was serialized protobuf, after reading it out, we could directly deserialize it and use `DebugString` to print the content. Strangely, what was printed out were normal business proto fields, and the field content was very little, which shouldn't have caused a timeout.

So I went back to review the timeout logs and found that the logs showed the size of the value read from KV was **tens of megabytes**, which explained the long latency. But why did DebugString only print out a few fields? To further confirm how large the serialized content read out was, I modified the tool further to output the size of the value, which was indeed tens of megabytes, matching the KV logs.

Tens of megabytes of content, but only a few fields output after deserialization, **it might be that the proto wasn't updated**. So I asked a colleague and found out that a field had been added to this proto in the test branch, but it hadn't been submitted yet. After getting the new proto, we deserialized it again and found a large amount of repetitive content in the newly added field. Further tracing the entire process, we found that the trigger for this problem was quite subtle:

1. A new test module set a new proto field, serialized it, and stored it in KV;
2. In another old module, a new message was created, then merged with the pb read from KV, and written back to KV;
3. Each Merge operation would cause the message to expand, and after multiple calls, the size of this pb would become extremely large.

To better demonstrate this problem, I'll prepare a simple reproduction step below.

## Problem Reproduction

The services in the business were implemented in C++, but to make it simpler here (and I've been learning to write Go recently), I'll use Go to reproduce it. We need to simulate two microservices operating on a protobuf message:

- Service A (serverA below) depends on the proto file with newly added fields, where it will set new fields and then store the serialized pb in a file message.pb.
- Service B (serverB below) is the old service, using the old proto file, where it will create a new message, then merge the pb read and deserialized from the above file;

The old Proto is as follows:

```protobuf
syntax = "proto3";

package user;
option go_package = "./;user";

message Info {
  string page = 1;
  string title = 2;
  int32 idx = 3;
}
```

In service A, a field `string content = 4;` was added to this proto, and operations are based on the new proto file.

### serverA 

Below is the implementation of serverA, which is relatively simple. Note that it uses the new field:

```go
func main() {
	newInfo := &user.Info{
		Page:    "example_page",
		Title:   "example_title",
		Idx:     1,
		Content: strings.Repeat("example_content, ", 5)[:len("example_content, ")*5-2], // remove the last comma and space
	}
	data, err := proto.Marshal(newInfo)
	if err != nil {
		log.Fatalf("Marshaling error: %v", err)
	}
	err = ioutil.WriteFile("message.pb", data, 0644)
	if err != nil {
		log.Fatalf("Failed to write to file: %v", err)
	}

	fmt.Println("Serialized data saved to message.pb")
}
```

This simulates a very common use case in business: get a pb from KV (here, for simplicity, we directly create a new one), then set a new field and save it again.

### serverB

Next is the implementation of serverB. In this service, because it hasn't been recompiled, it's still using the old proto. This situation is quite common, after all, in actual business, there are often multiple services depending on the same proto file, and after updating the proto, not all services will be updated immediately.

The reproduction code here is also very simple, creating a new proto message, then merging the message saved to the file by serverA above. Note that the Merge is repeated in a loop, simulating the process that is continuously triggered in the business. The overall code is as follows. Here, just to demonstrate the core logic, the code for checking err at each step has been removed. In actual projects, it's crucial to check for errors.

```go
func main() {
	fileName := "message.pb"
	data, _ := ioutil.ReadFile(fileName)

	initialInfo := &user.Info{}
	proto.Unmarshal(data, initialInfo)

	newInfo := &user.Info{
		Page:  "page",
		Title: "title",
		Idx:   1,
	}

	for i := 0; i < 5; i++ {
		proto.Merge(newInfo, initialInfo)
		mergedData, _ := proto.Marshal(newInfo)
		fmt.Printf("Iteration %d: Size(bytes) = %d \n", i+1, len(mergedData))
		fmt.Printf("Iteration %d: Content     = %v\n", i+1, newInfo)
	}
}
```

First, execute serverA to save the serialized pb to a file. Then execute serverB, read the file, deserialize it, and execute the subsequent loop operation. You can see the following output:

![Continuously expanding pb message content](https://slefboot-1251736664.file.myqcloud.com/20230909_protobuf_field_merge_reproduce.png)

The pb content here keeps expanding. In actual business, if this Merge process is continuously triggered, it will **gradually lead** to severe consequences. For example, it might fill up the KV storage space, or cause network transmission timeouts due to oversized content. Worse still, this **process might be quite slow**, possibly causing serious consequences several months after service A is deployed, making it even more difficult to troubleshoot.

## Source Code Analysis

Using the Go language is comfortable; in VSCode, you can jump through the code, making it incredibly convenient to look at the code implementation of some third-party libraries. The implementation of `proto.Merge(newInfo, initialInfo)` above is as follows (google.golang.org/protobuf v1.31.0):

```go
// Merge merges src into dst, which must be a message with the same descriptor.
//
// Populated scalar fields in src are copied to dst, while populated
// singular messages in src are merged into dst by recursively calling Merge.
// The elements of every list field in src is appended to the corresponded
// list fields in dst. The entries of every map field in src is copied into
// the corresponding map field in dst, possibly replacing existing entries.
// The unknown fields of src are appended to the unknown fields of dst.
//
// It is semantically equivalent to unmarshaling the encoded form of src
// into dst with the UnmarshalOptions.Merge option specified.
func Merge(dst, src Message) {
	// TODO: Should nil src be treated as semantically equivalent to a
	// untyped, read-only, empty message? What about a nil dst?

	dstMsg, srcMsg := dst.ProtoReflect(), src.ProtoReflect()
	if dstMsg.Descriptor() != srcMsg.Descriptor() {
		if got, want := dstMsg.Descriptor().FullName(), srcMsg.Descriptor().FullName(); got != want {
			panic(fmt.Sprintf("descriptor mismatch: %v != %v", got, want))
		}
		panic("descriptor mismatch")
	}
	mergeOptions{}.mergeMessage(dstMsg, srcMsg)
}
```

The code comments in some classic open-source libraries are very well written. Note this comment:

> The unknown fields of src are appended to the unknown fields of dst.

The content field value added by ServerA earlier is `unknown fields` for newInfo in ServerB (because the proto wasn't updated here). Each time the Merge operation is executed, the content of content will be appended to the unknown fields of newInfo, causing the size to continuously expand. This append process is in the `mergeMessage` function above, specifically as follows (irrelevant code omitted):

```go
func (o mergeOptions) mergeMessage(dst, src protoreflect.Message) {
    // ....
	src.Range(func(fd protoreflect.FieldDescriptor, v protoreflect.Value) bool {
		switch {
            // ...
		default:
			dst.Set(fd, v)
		}
		return true
	})

	if len(src.GetUnknown()) > 0 {
		dst.SetUnknown(append(dst.GetUnknown(), src.GetUnknown()...))
	}
}
```

You can see that as long as src has an unknown field, the append operation will be executed. In fact, not just in Go, Proto's Merge in C++ and Python also handles `unknown fields` in this way.