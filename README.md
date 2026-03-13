# FinFlow Infra 🚀

> K8s homelab for FinFlow — a fictional fintech payments startup.
> Real disasters. Real fixes. Real learning.

---

## 🏢 About FinFlow

FinFlow ek fictional fintech startup hai jo payment processing handle karta hai.
Har hafte kuch na kuch toot ta hai — aur yahan sab publicly fix hota hai.

This repo is part of **Startup Disaster Lab** — a project to document
real-world Kubernetes disasters and their fixes.

---

## 📁 Structure
```
finflow-infra/
├── apps/
│   ├── frontend/      # Payment dashboard
│   ├── backend/       # API server
│   └── postgres/      # PostgreSQL database
├── manifests/
│   ├── deployments/   # K8s deployment manifests
│   ├── services/      # Service definitions
│   └── configmaps/    # App configurations
├── monitoring/        # Prometheus + Grafana setup
└── docs/              # Disaster reports + runbooks
```

---

## 🔥 Disasters Fixed

| # | Disaster | Impact | Status |
|---|----------|--------|--------|
| Coming soon... | | | |

---

## 🛠 Stack

| Tool | Purpose |
|------|---------|
| Kubernetes (K3s) | Container orchestration |
| Docker | Containerization |
| Helm | Package management |
| Prometheus | Metrics collection |
| Grafana | Dashboards + alerting |
| Falco | Runtime security |
| Kubecost | Cost monitoring |
| ArgoCD | GitOps deployments |
| Terraform | Infrastructure as code |
| Sealed Secrets | Secret management |
| Velero | Backup + disaster recovery |

---

## 📈 Roadmap

**Phase 1 — Foundation**
- [x] Cluster setup
- [x] Repo structure
- [ ] 3-tier app deployment (Frontend + Backend + PostgreSQL)
- [ ] Ingress + HPA setup
- [ ] DB Backup (Velero)

**Phase 2 — Monitoring & Security**
- [ ] Prometheus + Grafana monitoring
- [ ] Falco security alerts
- [ ] Kubecost integration
- [ ] RBAC setup
- [ ] Sealed Secrets

**Phase 3 — GitOps & IaC**
- [ ] ArgoCD GitOps pipeline
- [ ] Terraform infrastructure

**Phase 4 — eBPF (Month 10+)**
- [ ] bpftrace + BCC tools on cluster
- [ ] eBPF-based observability
- [ ] Cilium + Tetragon integration

---

## 📝 Disaster Reports

Detailed writeups in `/docs` — each disaster includes:
- What broke
- How it was detected
- Root cause analysis
- Fix applied
- Prevention strategy

---

*Built by [@kartikinfra](https://github.com/kartikinfra) | Startup Disaster Lab*
