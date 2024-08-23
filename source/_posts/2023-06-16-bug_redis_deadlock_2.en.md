---
title: Redis Deadlock Problem Caused by Stream Data Read and Write (2)
tags:
  - Redis
  - Debug
category: Source Code Analysis
toc: true
date: 2023-06-16 22:45:16
description:
lang: en
---

In [Redis Issue Analysis: "Deadlock" Problem Caused by Stream Data Read and Write (1)](https://selfboot.cn/en/2023/06/14/bug_redis_deadlock_1/), we successfully reproduced the bug mentioned in the Issue, observing that the Redis Server CPU spiked, unable to establish new connections, and existing connections couldn't perform any read or write operations. With the help of powerful eBPF profile tools, we observed where the CPU time was mainly consumed. Now, let's take a look at the debugging process and fix for this bug.

## Debugging the bug

Considering that the Redis server process is still running, we can use GDB to attach to the process and set breakpoints to see the specific execution process. In the flame graph, we saw that the time-consuming `handleClientsBlockedOnKey` function contains a while loop statement. Since CPU spikes are usually caused by infinite loops, to verify if there's an infinite loop in this while statement, we can set breakpoints at line 565 before the while loop and line 569 inside it, then `continue` multiple times to observe.

```c
while((ln = listNext(&li))) {
    client *receiver = listNodeValue(ln);
    robj *o = lookupKeyReadWithFlags(rl->db, rl->key, LOOKUP_NOEFFECTS);
    ...
}
```

<!--more-->

We see that **it always pauses at line 569 inside the loop**, basically confirming that an infinite loop is occurring here. Looking at the local variables on the current stack frame, we can see the receiver pointer. Specifically:
![GDB continue confirms infinite loop](https://slefboot-1251736664.file.myqcloud.com/20230616_bug_redis_deadlock_2_0.png)

Here, receiver is a struct client declared in `server.h`, which is the data structure maintained by Redis for each client connection. The problem is now clear: the server process keeps taking out client connections in the while loop and can't stop. To understand where these clients come from, we can print the name field in the client.

```c
typedef struct client {
    ...
    robj *name;             /* As set by CLIENT SETNAME. */
    ...
} client;
```

However, this needs to be set when the client connects, so let's modify our test script from [Redis Issue Analysis: "Deadlock" Problem Caused by Stream Data Read and Write (1)](https://selfboot.cn/2023/06/14/bug_redis_deadlock_1/), restart the server, run the reproduction process, and then re-analyze with GDB.

```python
def subscriber(user_id):
    r = Redis(unix_socket_path='/run/redis-server.sock')
    r.client_setname(f'subscriber_{user_id}')   # Set client name here
    try:
        ...
```

GDB prints out the receiver's name as follows:

```shell
(gdb) p *receiver->name
$6 = {type = 0, encoding = 8, lru = 9013978, refcount = 1, ptr = 0x7f8b17899213}
```

Here, name is a redisObject. Based on type=0 and encoding=8, we know that this name is actually a string, stored in memory at the ptr pointer.

```c
// object.c
#define OBJ_STRING 0    /* String object. */
#define OBJ_ENCODING_EMBSTR 8

struct redisObject {
    unsigned type:4;
    unsigned encoding:4;
    unsigned lru:LRU_BITS; /* LRU time (relative to global lru_clock) or
                            * LFU data (least significant 8 bits frequency
                            * and most significant 16 bits access time). */
    int refcount;
    void *ptr;
};
```

Then we can use `p (char *)receiver->name->ptr` to print the specific name of the client. Here we need to print the client name multiple times continuously to see what client is taken out each time. To print automatically multiple times, we can use the commands instruction in GDB, as shown in the following image:

![GDB continue observes clients here](https://slefboot-1251736664.file.myqcloud.com/20230616_bug_redis_deadlock_2_1.png)

In fact, `subscriber_1` and `subscriber_2` are always taken out from the queue alternately, endlessly, so it can't break out of the loop.

## Fix the code

The fix used here is a rather tricky method, ensuring that only the clients currently in the queue at this moment are processed, and newly added clients are not processed. The specific commit is [commit e7129e43e0c7c85921666018b68f5b729218d31e](https://github.com/redis/redis/blob/e7129e43e0c7c85921666018b68f5b729218d31e/src/blocked.c), and the commit message describes this issue:

> Author: Binbin <binloveplay1314@qq.com>  
> Date:   Tue Jun 13 18:27:05 2023 +0800  
>    Fix XREADGROUP BLOCK stuck in endless loop (#12301)  
>
>    For the XREADGROUP BLOCK > scenario, there is an endless loop.  
>    Due to #11012, it keep going, reprocess command -> blockForKeys -> reprocess command
>
>    The right fix is to avoid an endless loop in handleClientsBlockedOnKey and handleClientsBlockedOnKeys,
>    looks like there was some attempt in handleClientsBlockedOnKeys but maybe not sufficiently good,  
>    and it looks like using a similar trick in handleClientsBlockedOnKey is complicated.  
>    i.e. stashing the list on the stack and iterating on it after creating a fresh one for future use,  
>    is problematic since the code keeps accessing the global list.  
>  
>    Co-authored-by: Oran Agra <oran@redislabs.com>  

The changes in the commit are relatively minor, as shown below:

![Fix code comparison](https://slefboot-1251736664.file.myqcloud.com/20230616_bug_redis_deadlock_2_2.png)

### When are elements added to the list?

There's another question that needs to be clarified: when exactly are the clients that have been taken out of the queue put back into the queue? Because I'm not very familiar with the Redis source code, I couldn't find the relevant code after looking for a while at first. I asked about this on the Issue, and [oranagra](https://github.com/oranagra) came out to explain that it's in `blockForKeys` (actually, this function is mentioned in the commit message).

When I thought about this later, I realized I could have found it myself. Because the list is definitely continuously adding clients in the loop, and the function for adding elements to the tail of the list in Redis is easy to find, it's `listAddNodeTail`:

```cpp
// adlist.c
list *listAddNodeTail(list *list, void *value)
{
    listNode *node;

    if ((node = zmalloc(sizeof(*node))) == NULL)
        return NULL;
    node->value = value;
    listLinkNodeTail(list, node);
    return list;
}
```

We just need to set a breakpoint on this function, and when it executes here, we can get the function stack and know the call relationship, as shown in the following image:

![Call chain for re-adding to the list](https://slefboot-1251736664.file.myqcloud.com/20230616_bug_redis_deadlock_2_3.png)

### Is breaking out of the loop enough?

There's another question: in the fix solution here, during a single `handleClientsBlockedOnKey` function processing, the client will still be appended to the queue tail (there's actually no change here). So why won't these two clients be taken out again in the modified code?

TODO...(To be continued)

## Test case

The official team also added a [tcl](https://www.tcl.tk/) test case script, adding the following case in tests/unit/type/stream-cgroups.tcl:

```txt
    test {Blocking XREADGROUP for stream key that has clients blocked on list - avoid endless loop} {
        r DEL mystream
        r XGROUP CREATE mystream mygroup $ MKSTREAM

        set rd1 [redis_deferring_client]
        set rd2 [redis_deferring_client]
        set rd3 [redis_deferring_client]

        $rd1 xreadgroup GROUP mygroup myuser COUNT 10 BLOCK 10000 STREAMS mystream >
        $rd2 xreadgroup GROUP mygroup myuser COUNT 10 BLOCK 10000 STREAMS mystream >
        $rd3 xreadgroup GROUP mygroup myuser COUNT 10 BLOCK 10000 STREAMS mystream >

        wait_for_blocked_clients_count 3

        r xadd mystream MAXLEN 5000 * field1 value1 field2 value2 field3 value3

        $rd1 close
        $rd2 close
        $rd3 close

        assert_equal [r ping] {PONG}
    }
```

The test logic here is basically the same as the reproduction script, creating 3 clients blocked in xreadgroup, and then using another client to add 3 sets of data. Then it closes the consumer clients and tries to send a ping message with the client that added data to see if there's a pong reply. If this bug still exists, sending ping would not get any response.

You can run `./runtest --single unit/type/stream-cgroups` in the [redis-7.2-rc2](https://github.com/redis/redis/releases/tag/7.2-rc2) directory to test this newly added case group. The execution result is as follows:

![Effectiveness of the added test case](https://slefboot-1251736664.file.myqcloud.com/20230616_bug_redis_deadlock_2_4.png)

After executing the group of test cases before the newly added one, the test case got stuck, and then we saw that the CPU usage of the Redis process was also 100%, indicating that this test case can fully reproduce this problem. Here's an additional point: in the TCL test, the Redis binary file used is located in the src subdirectory of the Redis source code directory. Specifically, it's found through the following command in the TCL script:

```tcl
set ::redis [file normalize [file join [pwd] ../src/redis-server]]
```

It connects the parent directory of the current directory (i.e., the root directory of the Redis source code) with src/redis-server to form the complete path of the Redis binary file. This means it uses the Redis version you compiled yourself, not any version that might already be installed on the system.