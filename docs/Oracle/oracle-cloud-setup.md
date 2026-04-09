# Day 20 — Oracle Cloud ARM Infrastructure Setup

## Goal
Provision real Linux ARM nodes on Oracle Cloud Free Tier to validate 
Falco custom rules on a real kernel. Rancher Desktop's Lima VM kernel 
blocks `kubectl exec` syscall visibility — eBPF tracepoints invisible 
for Falco rule triggering (confirmed Day 19).

## Architecture
MacBook (kubectl only)
        ↕ WireGuard VPN tunnel
Oracle Node 1 — 2 OCPU 12GB RAM — k3s server (Ubuntu 22.04 ARM)
Oracle Node 2 — 2 OCPU 12GB RAM — k3s agent  (Ubuntu 22.04 ARM)

## Infrastructure Built

### VCN
- Name: finflow-vcn
- CIDR: 10.0.0.0/16

### Subnets
- Public: 10.0.0.0/24 (instances live here)
- Private: 10.0.1.0/24

### Gateways
- Internet Gateway (public subnet)
- NAT Gateway (private subnet)
- Service Gateway (Oracle services)

### Security List — Ingress Rules
| Port  | Protocol | Purpose        |
|-------|----------|----------------|
| 22    | TCP      | SSH            |
| 6443  | TCP      | k3s API server |
| 51820 | UDP      | WireGuard VPN  |
| 10250 | TCP      | kubelet        |

### Instances
| Name      | Public IP        | Shape              | OCPU | RAM  | OS              |
|-----------|------------------|--------------------|------|------|-----------------|
| k3s-node1 | 140.238.230.201  | VM.Standard.A1.Flex| 2    | 12GB | Ubuntu 22.04 ARM|
| k3s-node2 | 161.118.170.143  | VM.Standard.A1.Flex| 2    | 12GB | Ubuntu 22.04 ARM|

## Problem Faced
Mumbai AD-1 — `Out of host capacity` error on manual creation.

**Fix:** OCI CLI + bash auto-retry script via Oracle Cloud Shell.
Script retried every 120 seconds — instances provisioned after ~3 hours.

## Key Learnings
- Oracle ARM capacity is limited in Mumbai — auto-retry is the only reliable approach
- Oracle Cloud Shell has OCI CLI pre-installed — no local setup needed
- Private key permissions must be `600` before SSH keygen operations
- Always Free limits: 4 OCPU + 24GB RAM total — mathematically impossible to exceed with this setup

## SSH Access
ssh -i ~/Downloads/ssh-key-2026-04-02.key ubuntu@140.238.230.201
ssh -i ~/Downloads/ssh-key-2026-04-02.key ubuntu@161.118.170.143

## Pending
- [x ] WireGuard tunnel — MacBook ↔ Node1 ↔ Node2
- [x ] k3s install — Node1 (server), Node2 (agent)
- [x ] kubectl verify from MacBook
- [x ] Falco rule validation on real kernel
- [x ] Falco + Alertmanager integration
- [x ] Backend outbound connections Falco rule
