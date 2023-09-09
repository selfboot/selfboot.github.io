---
title: Protobuf 序列化消息引起的存储失败问题分析
tags:
  - 方法
  - Go
category: 程序设计
toc: true
description: 记录了在 C++ Protobuf 使用中遇到的问题。
---

之前在实际业务中遇到过一个 Protobuf 序列化消息导致存储失败的问题，当时这个问题差点导致重大故障，但是也没写文章好好沉淀下来。刚好最近又遇到另一个 Protobuf 的问题，在写完 [C++ 中使用 Protobuf 诡异的字段丢失问题排查](https://selfboot.cn/2023/09/07/protobuf_redefine/) 后，又想起前面的这个问题，这里再补一篇文章，好好介绍上次的踩坑过程。

<!-- more -->

## 简单故障回顾


## 复现问题

业务中的服务是用 C++ 实现的，不过这里为了更简单一些（刚好最近也在学着写Go），就用 Go 来复现。我们要模拟两个微服务来操作一个 protobuf 的 message：

- 服务 A(下面 serverA) 依赖新添加了字段的 proto 文件，里面会 set 新的字段，然后把序列化后的 pb 存到文件 message.pb 中。
- 服务 B(下面 serverB) 是老的服务，用的老的 proto 文件，里面会创建新的 message，然后 Merge 从上面文件读取并反序列化的 pb；

老的 Proto 如下：

```ptotobuf
syntax = "proto3";

package user;
option go_package = "./;user";

message Info {
  string page = 1;
  string title = 2;
  int32 idx = 3;
}
```

在服务 A 中，给这个 proto 增加了字段 `string content = 4;`，操作都是基于新的 proto 文件。

### serverA 

下面是 serverA 的实现，比较简单，需要注意的是这里用了新的字段：

```go
func main() {
	newInfo := &user.Info{
		Page:    "example_page",
		Title:   "example_title",
		Idx:     1,
		Content: strings.Repeat("example_content, ", 5)[:len("example_content, ")*5-2], // 去掉最后一个逗号和空格
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

这里模拟的是业务中很常见的使用场景，从 kv 拿到某个 pb(这里为了简单，直接创建一个新的)，然后新 set 一个字段重新保存。

### server B

接下来是 serverB 的实现了，这个服务中由于没有重新编译，所以 proto 还是用的老的。这种情况还是很常见的，毕竟实际业务中，经常会有多个服务依赖同一个 proto 文件，更新了 proto 后，不一定会立马更新所有服务。

这里复现代码也很简单，新建 proto meesage，然后 Merge 上面 serverA 保存到文件中的 message。注意这里在一个循环中重复 Merge，模拟于业务中不断触发的过程。整体代码如下，这里只是为了演示核心逻辑，所以去掉了每一步检查 err 的代码，实际项目中一定要注意检查 err。

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

先执行 serverA，把 pb 序列号保存好文件。然后执行 serverB，读取文件反序列化，并执行后面的循环操作。可以看到下面的输出：

![不断膨胀的 pb 消息内容](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230909_protobuf_field_merge_reproduce.png)

这里的 pb 内容不断膨胀，在实际业务中，如果不断触发这个 Merge 的过程，会**慢慢导致**很严重的后果。比如占满 KV 存储空间，或者因为内容过大导致网络传输超时。更糟糕的是，这个**过程可能比较缓慢**，可能是在服务 A 上线后的几个月后，才导致严重后果，排查起来就更加困难了。

## 源码分析


## CS 下 Protobuf 指南



