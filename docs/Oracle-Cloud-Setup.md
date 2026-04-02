#Oracle Cloud Setup

## Goal
Extend the existing FinFlow cluster virtually by provisioning real Linux ARM nodes 
on Oracle Cloud Free Tier. Real kernel required for Falco rule validation and 
production-grade eBPF experimentation — Rancher Desktop's Lima VM kernel 
limitation blocked this on Day 19.

## Architecture
```
MacBook (kubectl only)
        ↕ WireGuard VPN tunnel
Oracle Node 1 — 2 OCPU 12GB RAM — k3s server (Ubuntu 22.04 ARM)
Oracle Node 2 — 2 OCPU 12GB RAM — k3s agent  (Ubuntu 22.04 ARM)
```

## What We Built
- VCN: `finflow-vcn` (10.0.0.0/16)
- Public Subnet: `public subnet-finflow-vcn` (10.0.0.0/24)
- Private Subnet: `private subnet-finflow-vcn` (10.0.1.0/24)
- Gateways: Internet Gateway, NAT Gateway, Service Gateway
- Security List — ports opened:
  - 22 (SSH)
  - 6443 (k3s API server)
  - 51820/UDP (WireGuard)
  - 10250 (kubelet)
- Instance shape: VM.Standard.A1.Flex — 2 OCPU, 12GB RAM
- Image: Canonical Ubuntu 22.04

## Problem
Mumbai region ARM capacity unavailable — `Out of host capacity` error.
Auto-retry bash script running via Oracle Cloud Shell every 30 seconds.

## Pending
- [ ] Instance provisioning (waiting on capacity)
- [ ] SSH access verify
- [ ] WireGuard tunnel setup
- [ ] k3s install — Node 1 (server), Node 2 (agent)
- [ ] Falco rule validation on real kernel
