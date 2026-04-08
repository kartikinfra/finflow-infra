## Problem
kubectl top node pe Node2 unknown aa raha tha

## Investigation
- Ping chal raha tha — WireGuard theek tha
- curl port 10250 — No route to host
- ss -tlnp — k3s-agent listen kar raha tha
- iptables -L INPUT — line 13 pe REJECT all tha

## Root Cause
iptables mein port 10250 explicitly allow nahi tha — 
WireGuard se aane wala TCP traffic REJECT ho raha tha

## Fix
iptables rule add kiya WireGuard subnet ke liye
netfilter-persistent se save kiya

## Lesson
In a multi-node k3s cluster connected over WireGuard, metrics-server pulls kubelet stats via port 10250 directly from each node. If that port isn't explicitly allowed in iptables before the default REJECT rule, the connection silently fails — kubectl top node shows <unknown> with no clear error. Fix is a single iptables rule scoped to the WireGuard subnet, persisted via netfilter-persistent.
