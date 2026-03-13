# Options for simulating TCP connection delay before `https-gateway`

This document summarizes practical ways to simulate **TCP connection delay between external clients and the `https-gateway`** in this cluster.

The goal is to delay the connection seen by external clients that call:

- `https://faulty-thingy.kim.tec.br`
- or, more generally, any hostname served by `https-gateway`

## Current traffic path

For the current cluster setup, external HTTPS traffic flows like this:

```text
external client
  -> 192.168.10.1 (MetalLB VIP)
  -> Service https-gateway:443
  -> NodePort 31601
  -> https-gateway pod on node01-82nm
```

Relevant observed details:

- `https-gateway` is exposed as a `LoadBalancer` Service
- the Service IP announced by MetalLB is `192.168.10.1`
- the Service uses NodePort `31601`
- the `https-gateway` pod currently runs on `node01-82nm`

Because the goal is to delay **external clients connecting to the gateway**, the fault must be injected **before** or **at** the gateway entrypoint. Delaying traffic only between gateway and backend is a different experiment.

## Alternatives

## 1. Inject delay from inside the cluster

### 1.1 Apply `tc/netem` inside the `https-gateway` pod

This approach delays packets directly in the gateway pod network namespace.

Conceptually, it would be similar to:

```sh
tc qdisc replace dev eth0 root handle 1: prio bands 3
tc qdisc replace dev eth0 parent 1:3 handle 30: netem delay 65s
tc filter replace dev eth0 protocol ip parent 1:0 prio 3 u32 \
  match ip protocol 6 0xff \
  match ip sport 443 0xffff \
  match u8 0x12 0xff at 33 \
  flowid 1:3
```

Intent:

- match outbound TCP packets from port `443`
- match only packets with TCP flags `SYN+ACK`
- delay the packet that completes the server side of the TCP handshake

Pros:

- closest in-cluster approximation of a true client-visible slow TCP connect
- packet-level control

Cons:

- the gateway pod is managed by `kgateway`, so changes are not durable unless automated
- the gateway container may not have `tc` installed
- the container may not have enough Linux capabilities to shape traffic
- operationally brittle

### 1.2 Use a privileged helper pod or debug container

Instead of changing the managed gateway container, a privileged helper pod can:

- run on the same node
- enter the gateway pod network namespace
- apply `tc` there

Pros:

- avoids modifying the gateway image
- can be automated for test setup and cleanup

Cons:

- advanced operational pattern
- still more complex than a dedicated chaos tool

### 1.3 Use a chaos/network tool in-cluster

A Kubernetes-native chaos platform can target the gateway pod and inject delay.

This is operationally easier than ad hoc `tc`, but less precise if the goal is **handshake-only** delay rather than general traffic delay.

Pros:

- repeatable
- declarative
- easier to enable/disable than manual host tuning

Cons:

- usually delays broader traffic, not only the TCP handshake completion packet

## 2. Do it using `kgateway` / Envoy

This is useful for **gateway and upstream behavior**, but it is usually **not the right layer for true client-to-gateway TCP handshake delay**.

Why:

- the client TCP connection is accepted by the gateway listener itself
- once Envoy owns the socket, the TCP connection is already established from the client perspective

What `kgateway` can control well:

- upstream connect timeout
- request timeout
- retries
- listener idle timeout
- HTTP-layer or upstream-side fault behavior

What it is not ideal for:

- making the external client wait a long time during the initial TCP connection to the gateway itself

In other words:

- use `kgateway` when you want to simulate **slow backend connection** or **slow routed requests**
- do **not** rely on `kgateway` alone when you want to simulate **slow inbound TCP handshake to the gateway**

## 3. Do it using Chaos Mesh or a similar chaos platform

This is the best Kubernetes-native option if the fault should be:

- repeatable
- declarative
- easy to enable and disable

The main candidate is a network chaos experiment that targets the `https-gateway` pod or traffic around it.

What it is good for:

- packet delay
- loss
- duplication
- partitions
- repeatable experiments in a cluster workflow

Important limitation:

- it is usually easier to simulate **general network slowness** than to target only the handshake packet

So Chaos Mesh is a great option when the experiment can be phrased as:

> traffic to or from `https-gateway` is slow

It is less ideal if the requirement is:

> only delay the `SYN-ACK` packet so the TCP connect phase alone is slow

## 4. Do it through the MetalLB path

MetalLB itself is not a traffic shaper. It mainly provides the external VIP and advertises that IP on the network.

In this setup, the important MetalLB-related fact is:

- the VIP `192.168.10.1` is what external clients connect to

That means the practical delay options around MetalLB are:

- shaping traffic on the node interface that handles the VIP
- shaping traffic on upstream network devices
- introducing a separate appliance or proxy in front of the VIP

Pros:

- affects the real external path

Cons:

- coarse-grained
- can affect more than one application or gateway listener
- not really a MetalLB feature, but a network-path technique around the MetalLB VIP

## 5. Do it on the Kubernetes node host

This is the strongest option for a **true external-to-gateway TCP connection delay**.

Given the current setup:

- VIP: `192.168.10.1`
- Service port: `443`
- NodePort: `31601`
- gateway pod node: `node01-82nm`

The node can shape traffic at the point where it enters or leaves the real host networking stack.

Possible host-level implementations:

### 5.1 Apply `tc/netem` on the node network interface

Target:

- traffic to the VIP `192.168.10.1`
- traffic to TCP `443`
- or traffic to NodePort `31601`

Best case:

- delay only the server-side `SYN-ACK` on the return path

Pros:

- most realistic for external clients
- true L4/TCP behavior
- independent of backend application behavior

Cons:

- operationally risky
- easy to affect unrelated traffic if matching is too broad

### 5.2 Use packet marking plus `tc`

This is a refinement of the previous option.

Possible pattern:

- use `iptables` or `nftables` to mark only packets for the gateway path
- use `tc` to delay only packets with that mark

Pros:

- cleaner targeting than relying only on raw packet offsets
- easier to separate gateway traffic from other host traffic

Cons:

- more moving parts
- still requires host access and careful testing

### 5.3 Use eBPF-based shaping or filtering

This is the most powerful and flexible host-level option.

Pros:

- precise
- can be very efficient
- works well for packet-level behavior

Cons:

- significantly more complex
- higher operational and debugging cost

## Recommendations

## Recommended option for the exact goal

If the exact goal is:

> simulate TCP connection delay for external clients connecting to `https-gateway`

then the best option is:

### Node-level `tc` on the gateway host path

Prefer host-level traffic shaping on the node handling the VIP / NodePort path, currently `node01-82nm`.

Why this is the best fit:

- it delays the connection where the client actually reaches the cluster
- it models true TCP connect slowness
- it does not depend on backend application behavior
- it aligns with the goal of delaying traffic **before** the gateway handles the request

## Best Kubernetes-native operational option

If you want something more repeatable and easier to manage in-cluster:

### Chaos Mesh network delay targeting `https-gateway`

Choose this when:

- you want a declarative experiment
- handshake-only precision is not required
- general slowness around the gateway is acceptable

## Not recommended as the primary solution

### `kgateway` policy only

This is not the right primary tool for delaying the client-to-gateway TCP handshake.

Use it for:

- backend connect timeout
- request lifetime tuning
- request-layer behavior

Do not use it alone if the intent is to make the external client wait during TCP connect to the gateway.

### Pod-local manual `tc` inside `https-gateway`

This can work, but it is brittle because the pod is managed and the container runtime environment may not be suitable for persistent packet shaping.

## Summary

If you want to simulate TCP connection delay **before `https-gateway`**:

1. best technical match: **host-level `tc` on the node or network path**
2. best declarative cluster option: **Chaos Mesh**
3. useful but not sufficient for this exact goal: **`kgateway` policies**
4. possible but awkward: **manual `tc` inside the gateway pod**
5. MetalLB is relevant mainly because of the VIP path, not because it provides delay features itself

## Suggested next steps

Depending on how you want to operate the experiment, the next concrete step should be one of these:

- prepare **node-level `tc` commands** for `node01-82nm`
- prepare a **Chaos Mesh manifest** targeting `https-gateway`
- design a **handshake-only** experiment versus a **general network delay** experiment
