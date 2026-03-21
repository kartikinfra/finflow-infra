# finflow-infra

I love seeing through the kernel — the way K8s actually makes things happen underneath.

This repo is where that curiosity meets production-grade infrastructure.

---

## What this is

**FinFlow** is a fintech payments simulation — a 3-tier PERN stack (React + Node.js + PostgreSQL) running on Kubernetes, built to the same standards I'd apply to a real system.

Every infrastructure decision here has a business consequence attached to it:

- Hardcoded secrets = compliance failure
- Missing resource limits = no autoscaling under load
- Lost PVC = transaction history gone
- Wrong image tag = silent rollback, payments down

This isn't a demo. It gets broken, diagnosed, and fixed — the same way it happens in production.

---

## Stack

| Layer | Tool |
|-------|------|
| Orchestration | Kubernetes — Rancher Desktop |
| Ingress | Traefik |
| App | React (Vite) + Node.js + Express |
| Database | PostgreSQL 15 + PVC |
| Autoscaling | HPA — CPU based |
| Config | ConfigMap + K8s Secrets |
| Monitoring | Prometheus + Grafana *(Week 3)* |
| Runtime Security | Falco *(Week 3)* |
| Cost Visibility | Kubecost *(Week 3)* |
| GitOps | ArgoCD *(Month 2)* |
| Backup | Velero *(Month 2)* |
| Deep Observability | eBPF — bpftrace, Cilium, Tetragon *(Month 10+)* |

---

## Repo structure

```
finflow-infra/
├── apps/
│   ├── backend/          # Node.js + Express API
│   └── frontend/         # React + Vite dashboard
├── manifests/
│   ├── deployments/
│   ├── services/
│   ├── ingress/
│   ├── configmaps/
│   ├── secrets/
│   ├── hpa/
│   └── postgres/
├── monitoring/
└── docs/                 # Incident reports + runbooks
```

---

## Current cluster state

```
WORKLOADS
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
```

---

## Incidents

| # | What broke | Root cause | Fix |
|---|-----------|------------|-----|
| 1 | Ingress routing to wrong service | Two wildcard rules — Traefik picks silently | Explicit path rules, removed duplicate |
| 2 | HPA showing `<unknown>` CPU | `resources.requests` missing in spec | Added CPU requests to all deployments |
| 3 | DB credentials in Git | `POSTGRES_PASSWORD` hardcoded in YAML | K8s Secret + `secretKeyRef` |
| 4 | `/api/transactions` 404 after update | Stale image tag caused silent rollback | Fixed image tag — YAML is source of truth |

Full writeups in `/docs`.

---

## Architecture

```
Browser
   │
   ▼
Traefik Ingress
   ├── /        →  finflow-frontend (React)
   └── /api     →  psq-backend (Node.js)
                        │
                        ▼
                  postgres-svc (ClusterIP)
                        │
                        ▼
                  postgres PVC (1Gi)
```

---

## Contact

**Kartik Kakodiya** — DevOps & SRE · Kubernetes Troubleshooter · Fintech Infra  
[linkedin.com/in/kartikk09](https://linkedin.com/in/kartikk09) · kartikops.dev@gmail.com  
Open to infrastructure audits, K8s troubleshooting, and SRE roles.
