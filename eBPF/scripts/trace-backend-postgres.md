# eBPF Script: Trace Backend → Postgres TCP Connections

## What
Traces kernel-level TCP connect syscalls (`sys_enter_connect`) 
from the FinFlow backend pod to PostgreSQL  no APM tool, 
no code changes, zero overhead.

## Why
In fintech, every network call matters. By observing connections 
at the kernel level, we can identify connection pool behavior, 
DNS resolution patterns, and unnecessary calls  before they 
become production incidents.

## How to Run

# Basic — just confirm connection is happening
sudo bpftrace -e 'tracepoint:syscalls:sys_enter_connect \
  /pid == <BACKEND_PID>/ \
  { printf("backend -> postgres connection\n"); }'

# Advanced — see which thread is connecting
sudo bpftrace -e 'tracepoint:syscalls:sys_enter_connect \
  /pid == <BACKEND_PID>/ \
  { printf("%s (pid:%d) -> postgres\n", comm, pid); }'

Note: Get PID via `ps aux | grep node` inside `rdctl shell`

## What You'll See
libuv-worker(pid:8485)-> postgres  ← connection pool thread
libuv-worker(pid:8485)-> postgres  ← connection pool thread  
MainThread(pid:8485)-> postgres    ← actual query request

One browser refresh = 3 connect() syscalls:
- 2x libuv-worker = pg connection pool maintaining connections
- 1x MainThread = real query executing

## Key Insight
`comm` reveals which thread is doing what inside Node.js.
3-way TCP handshake happens below this layer — kernel handles it.
eBPF sees the intent, not the mechanics.
