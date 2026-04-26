<div align="center">

#  FinFlow Infrastructure

### Production-grade Kubernetes infrastructure for a fintech payments simulation — built, broken, debugged, and hardened in the open.

[![Kubernetes](https://img.shields.io/badge/Kubernetes-k3s-326CE5?logo=kubernetes&logoColor=white)](https://k3s.io/)
[![Oracle Cloud](https://img.shields.io/badge/Oracle%20Cloud-ARM%20Nodes-F80000?logo=oracle&logoColor=white)](https://cloud.oracle.com/)
[![Falco](https://img.shields.io/badge/Runtime%20Security-Falco-00ACD7?logo=falco&logoColor=white)](https://falco.org/)
[![eBPF](https://img.shields.io/badge/Observability-eBPF-orange)](https://ebpf.io/)
[![WireGuard](https://img.shields.io/badge/VPN-WireGuard-88171A?logo=wireguard&logoColor=white)](https://wireguard.com/)
[![Prometheus](https://img.shields.io/badge/Monitoring-Prometheus%20%2B%20Grafana-E6522C?logo=prometheus&logoColor=white)](https://prometheus.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**[LinkedIn](https://linkedin.com/in/kartikk09) · [Docker Hub](https://hub.docker.com/u/kaka750) · [Contact](mailto:kartikops.dev@gmail.com)**

</div>

---

##  TL;DR — What is this?

This is a **Startup Disaster Lab** — a production-grade Kubernetes infrastructure project where I simulate, break, and fix the exact incidents that take down real fintech startups.

**FinFlow** is a fictional payments company running a 3-tier PERN stack (React + Node.js + PostgreSQL) on a multi-node k3s cluster deployed across Oracle Cloud ARM instances, connected via a WireGuard VPN overlay — secured with Falco runtime security, observed at the kernel level with eBPF, and monitored with Prometheus + Grafana.

Every engineering decision here has a **business consequence** attached to it. That's the point.

> *"Anyone can follow a tutorial. This repo shows what happens when things go wrong at 2 AM — and how to fix them."*

---

##  Live Infrastructure — Not a Local Demo

This is **real cloud infrastructure**, not a laptop simulation:

```
┌─────────────────────────────────────────────────────────┐
│              WireGuard VPN (10.10.0.0/24)               │
│                                                         │
│  ┌──────────────────┐      ┌──────────────────────┐     │
│  │  k3s-node1       │      │  k3s-node2           │     │
│  │  Oracle Cloud    │◄────►│  Oracle Cloud        │     │
│  │  ARM (2C/12GB)   │      │  ARM (2C/12GB)       │     │
│  │  10.10.0.1 (Hub) │      │  10.10.0.2           │     │
│  └──────────────────┘      └──────────────────────┘     │
│             ▲                                           │
│             │ kubectl over VPN                          │
│  ┌──────────┴─────────┐                                │
│  │  MacBook M1        │                                │
│  │  10.10.0.3         │                                │
│  │  (Control Plane)   │                                │
│  └────────────────────┘                                │
└─────────────────────────────────────────────────────────┘
```

**Oracle Cloud Always Free ARM nodes** — VM.Standard.A1.Flex (2 OCPU, 12GB RAM each)  
**k3s** running across both nodes, `kubectl` works from MacBook over WireGuard  
**Dual firewall layers** — Oracle Security Lists + iptables inside VM (both required)

---

##  Architecture — Full Application Stack

```
                        Browser
                           │
                           ▼
                   ┌──────────────┐
                   │    Traefik   │  ← Ingress Controller
                   │    Ingress   │
                   └──────┬───────┘
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
    ┌──────────────────┐   ┌──────────────────┐
    │  finflow-frontend│   │   psq-backend    │
    │  React + Vite    │   │   Node.js/Express│
    │  HPA: 1–3 pods   │   │   HPA: 1–3 pods  │
    └──────────────────┘   └────────┬─────────┘
                                    │
                                    ▼
                           ┌──────────────────┐
                           │    PostgreSQL 15  │
                           │    PVC: 1Gi       │ ← Persistent, survives pod restarts
                           │    CronJob Backup │ ← Timestamped dumps, DR verified
                           └──────────────────┘

Monitoring Layer (monitoring namespace):
  ├── Prometheus     ← Scrapes cluster + app metrics
  ├── Grafana        ← Custom FinFlow dashboard (CPU, memory, restarts)
  ├── Kubecost       ← Cost allocation per namespace
  └── Falco          ← Runtime security, eBPF-based syscall detection

eBPF Observability (bpftrace):
  └── trace-backend-postgres.bt  ← TCP flow tracing, kernel-level visibility
```

---

##  Full Stack

| Layer | Tool | Status |
|---|---|---|
| Cloud | Oracle Cloud ARM (2 nodes) | Live |
| Networking | WireGuard VPN (hub-and-spoke) |  Live |
| Orchestration | k3s (lightweight Kubernetes) |  Live |
| Ingress | Traefik | Live |
| Frontend | React + Vite (multi-stage Docker) |  Live |
| Backend | Node.js + Express |  Live |
| Database | PostgreSQL 15 + PVC |  Live |
| Autoscaling | HPA (CPU-based) |  Live |
| Config Management | ConfigMap + K8s Secrets |  Live |
| Monitoring | Prometheus + Grafana |  Live |
| Cost Visibility | Kubecost | Live |
| Runtime Security | Falco (modern eBPF probe) |  Live |
| Deep Observability | bpftrace + eBPF scripts |  Live |
| Backup/DR | CronJob → timestamped pg_dump |  Verified |
| GitOps | ArgoCD | 🔜 Month 2 |
| Backup Orchestration | Velero | 🔜 Month 2 |

---

##  Incident Reports — Real Breaks, Real Fixes

This is the core of the project. Every incident is documented with root cause, business impact, and verified fix.

| # | Incident | Root Cause | Business Impact | Fix |
|---|---|---|---|---|
| 1 | HPA stuck at `<unknown>` CPU | `resources.requests` missing from pod spec | Autoscaling dead — traffic spike = outage | Added CPU/memory requests to all deployments |
| 2 | DB credentials in Git history | `POSTGRES_PASSWORD` hardcoded in YAML | Compliance failure, data breach risk | K8s Secret + `secretKeyRef`, rotated creds |
| 3 | `/api/transactions` 404 after deploy | Stale image tag caused silent rollback | Payments endpoint down, invisible failure | Fixed image tag — YAML is source of truth |
| 4 | Ingress routing to wrong service | Two wildcard rules, Traefik picks silently | All traffic → wrong backend | Explicit path rules, removed duplicate Ingress |
| 5 | Pod OOMKilled (exit code 137) | Memory limit set to 3Mi — too low for Node.js | Backend crash-looping in production | Profiled actual memory, set realistic limits |
| 6 | HPA over-scaling (66% CPU at idle) | CPU request set to 2m — artificially low denominator | Wasted cloud spend, noisy metrics | Corrected CPU requests to match real consumption |
| 7 | Namespace Ingress conflict | Stale Ingress in old namespace silently overriding | Traffic hijacked — user-facing routing broken | `kubectl get ingress -A` — always check all namespaces |
| 8 | Falco false positive on Grafana | Grafana k8s-sidecar hits API server — expected behavior | Alert fatigue, real threats get ignored | Custom macro override in `falco-values.yaml` |
| 9 | PostgreSQL PVC lost on pod delete | Missing PVC in disaster recovery runbook | Transaction history permanently gone | Full DR cycle built and verified with CronJob backup |

Full writeups with kubectl output, timeline, and lessons → [`/docs`](./docs/)

---

##  Security Layer — Falco Runtime Detection

Falco runs with the **modern eBPF probe** (not kernel module) in the `monitoring` namespace, watching every syscall.

**What's being detected:**
- `kubectl exec` into any pod → immediate alert
- Unexpected outbound connections from backend
- Container writing to `/etc/` or `/bin/`
- Process spawning inside a container that shouldn't spawn processes

**Custom rules built:**
- Suppressed Grafana `k8s-sidecar` false positive — it legitimately contacts the API server
- Override uses `container.image.repository contains` (not `container.name` — autogenerated names break on restart)
- Rule structure follows Falco 0.43.0 `override: condition: append` syntax

```yaml
# Example: custom rule to suppress known-good Grafana API server contact
- rule: Contact K8s API Server From Container
  override:
    condition: append
    # Only alert when it's NOT grafana k8s-sidecar
```

---

##  eBPF — Kernel-Level Observability

bpftrace scripts in `/eBPF/scripts/` trace live kernel events without modifying application code.

**`trace-backend-postgres.bt`** — traces every TCP connection from Node.js backend to PostgreSQL at the kernel level:
- Identifies actual process names (`MainThread` vs `libuv-worker` — Node.js threading model visible at kernel)
- Maps PIDs to pods via `/proc/<pid>/cgroup`
- Works on real Linux kernel (Oracle Cloud ARM nodes) — not available in Lima VM

**Why this matters:** You can't fake kernel-level understanding. eBPF visibility is how Datadog, Cilium, and Tetragon work under the hood.

---

##  Monitoring — Prometheus + Grafana

Custom FinFlow dashboard built from scratch (not imported):

- **CPU usage** per pod (backend, frontend, postgres)
- **Memory in MB** — not raw bytes (operator-friendly)
- **Pod restart count** — canary for instability
- **HPA replica count** over time

**Key debug documented:** Rancher Desktop's cAdvisor doesn't expose the `container` label — removing it from PromQL fixed the no-data issue. This breaks 80% of copy-pasted dashboards from the internet.

Kubecost tracks **cost per namespace** — staging was consuming resources with 7.5% efficiency, deleted after audit, efficiency jumped to 13%.

---

##  Repo Structure

```
finflow-infra/
├── apps/
│   ├── backend/           # Node.js + Express — multi-stage Dockerfile
│   └── frontend/          # React + Vite — image reduced ~400MB → 92MB
├── manifests/
│   ├── deployments/       # All workloads with resource limits + requests
│   ├── services/          # ClusterIP + NodePort, selector-verified
│   ├── ingress/           # Traefik path rules
│   ├── configmaps/        # Non-secret config
│   ├── secrets/           # secretKeyRef references (no plaintext in Git)
│   ├── hpa/               # CPU-based autoscaling, requests set correctly
│   └── postgres/          # StatefulSet + PVC + CronJob backup
├── monitoring/
│   ├── falco-values.yaml  # Custom rules, false positive suppression
│   └── grafana-dashboard/ # FinFlow custom dashboard JSON
├── eBPF/
│   └── scripts/
│       └── trace-backend-postgres.bt   # Live TCP tracing, kernel-level
└── docs/
    ├── incident-*.md      # Full incident reports with root cause + fix
    ├── day-15-monitoring-setup.md
    ├── day-16-kubecost-setup.md
    ├── day-18-falco-rules.md
    └── day-20-oracle-cloud-setup.md
```

---

##  Current Cluster State

```
NODES (Oracle Cloud ARM — WireGuard overlay)
  k3s-node1    Ready    control-plane   Ubuntu 22.04
  k3s-node2    Ready    worker          Ubuntu 22.04

WORKLOADS (finflow namespace)
  finflow-frontend    1/1 Running    NodePort  :80
  psq-backend         1/1 Running    ClusterIP :5000
  postgres            1/1 Running    ClusterIP :5432

INGRESS (Traefik)
  /        →  frontend:80
  /api     →  backend:5000

AUTOSCALING
  frontend-hpa    CPU target: 50%    min: 1    max: 3
  backend-hpa     CPU target: 60%    min: 1    max: 3

STORAGE
  postgres-pvc    1Gi    Bound    local-path

MONITORING (monitoring namespace)
  prometheus      Running
  grafana         Running
  kubecost        Running
  falco           Running    (modern eBPF probe)
```

---

##  Documentation

| Doc | What's inside |
|---|---|
| [`incident-oomkilled.md`](./docs/) | OOMKilled postmortem — exit code 137, Node.js memory profiling |
| [`incident-hpa-unknown.md`](./docs/) | HPA `<unknown>` — why `resources.requests` is mandatory |
| [`incident-silent-rollback.md`](./docs/) | Stale image tag, silent rollback, YAML as source of truth |
| [`incident-ingress-conflict.md`](./docs/) | Multi-namespace Ingress hijack — `kubectl get ingress -A` |
| [`day-15-monitoring-setup.md`](./docs/) | Prometheus + Grafana — cAdvisor label fix |
| [`day-16-kubecost-setup.md`](./docs/) | Kubecost install — namespace cost allocation |
| [`day-18-falco-rules.md`](./docs/) | Falco custom rules, false positive suppression, eBPF probe |
| [`day-20-oracle-cloud-setup.md`](./docs/) | Oracle Cloud ARM provisioning, dual firewall setup |

---

##  Why This Project Exists

Most infrastructure portfolios are tutorials renamed. This one isn't.

I'm building toward **Fintech Infrastructure Consulting** — helping early-stage fintech startups (seed to Series A) avoid the infrastructure mistakes that kill compliance, availability, and investor trust before they even know it's happening.

The progression:
```
Kubernetes Troubleshooter
        ↓
K8s Security Specialist
        ↓
eBPF Expert
        ↓
Fintech Infrastructure Consultant
```

Every incident in this repo maps to a real category of failure I'd help a startup avoid:
- **Secrets in Git** → compliance failure before the first audit
- **Missing resource limits** → autoscaling that never kicks in under load  
- **No runtime security** → breach you find out about from a customer  
- **No DR tested** → "we have backups" becoming "we had backups"

This repo is the proof of work.

---

##  About

**Kartik Kakodiya** — Infrastructure Engineer · Kubernetes · eBPF · Fintech

I come from a trading background — I understand what infrastructure failure costs when money is moving. That's why I think in business consequences, not just kubectl commands.

**Open to:**
- Infrastructure audits for early-stage fintech startups
- K8s troubleshooting and SRE engagements
- Contract/freelance infrastructure work

**Links:**
-  [LinkedIn — kartikk09](https://linkedin.com/in/kartikk09)
-  [Docker Hub — kaka750](https://hub.docker.com/u/kaka750)
-  [kartikops.dev@gmail.com](mailto:kartikops.dev@gmail.com)

---

<div align="center">

*Built under the [Startup Disaster Lab](https://linkedin.com/in/kartikk09) brand — where infrastructure gets broken on purpose so yours doesn't break in production.*

</div>
