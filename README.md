# finflow-infra

Production-grade Kubernetes infrastructure for **FinFlow** — a fictional fintech payments startup I'm using to learn K8s the hard way.

No tutorials. No copy-paste. Break it, debug it, fix it, document it.

---

## What this is

I'm building a real 3-tier app (React + Node.js + PostgreSQL) on Kubernetes from scratch — and documenting every mistake publicly.

The goal isn't just to make it work. It's to understand *why* it breaks.

Stack: **Rancher Desktop** · **Traefik** · **Helm** · **Prometheus** · **Falco** *(coming)*

---

## Repo structure

```
finflow-infra/
├── apps/
│   ├── backend/          # Node.js + Express API
│   └── frontend/         # React + Vite payment dashboard
├── manifests/
│   ├── deployments/
│   ├── services/
│   ├── ingress/
│   ├── configmaps/
│   ├── secrets/
│   ├── hpa/
│   └── postgres/
├── monitoring/
└── docs/
```

---

## Current cluster state

```
finflow-frontend    1/1 Running    NodePort :80
psq-backend         1/1 Running    ClusterIP :5000
postgres            1/1 Running    ClusterIP :5432

Ingress (Traefik)
  /      → frontend:80
  /api   → backend:5000

HPA
  frontend   target: 50% CPU   min: 1   max: 3
  backend    target: 60% CPU   min: 1   max: 3
```

---

## Incidents

Real mistakes. Not manufactured drama.

| # | What broke | Root cause | Fix |
|---|-----------|------------|-----|
| 1 | Ingress serving wrong app | Two wildcard Ingress rules — Traefik picks one silently | Removed duplicate, added explicit path rules |
| 2 | HPA stuck at `unknown` CPU | `resources.requests` missing in deployment | Added CPU requests to both deployments |
| 3 | DB password in plain text on GitHub | Hardcoded `value: secret123` in YAML | Moved to K8s Secret + `secretKeyRef` |
| 4 | `/api/transactions` returning 404 after config update | YAML had `image: v1` — K8s rolled back silently | Updated YAML to v2, learned: YAML is source of truth |

Full writeups in `/docs`.

---

## Roadmap

**Week 1** — K8s fundamentals ✅  
Pods, Deployments, Services, Ingress, HPA, Probes, DNS, Rolling updates

**Week 2** — Real app ✅  
3-tier PERN stack · Secrets · ConfigMaps · HPA on real workloads

**Week 3** — Observability *(in progress)*  
Prometheus · Grafana · Falco · Kubecost · RBAC

**Week 4** — Ship  
GitHub polish · Loom demo · Founder outreach

**Month 2+**  
ArgoCD · Terraform · Velero · Sealed Secrets

**Month 10+**  
eBPF — bpftrace · Cilium · Tetragon

---

## Why FinFlow

Most K8s learning uses toy apps with no stakes.

FinFlow has fake-but-realistic constraints — payment SLAs, compliance requirements, data loss costs — so the decisions I make actually mean something.

When I misconfigure an HPA, "payments fail at scale."  
When I hardcode a DB password, "we fail an RBI audit."  
When I lose PVC data, "transaction history is gone."

The stakes are fictional. The learning is real.

---

## Follow along

**LinkedIn** — [kartikk09](https://linkedin.com/in/kartikk09/) — 3 posts/week  
**GitHub** — [@kartikinfra](https://github.com/kartikinfra)  
**Email** — kartikops.dev@gmail.com

Day 1 → Top 1% K8s specialist. 24 month plan. No shortcuts.
