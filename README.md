finflow-infra
I love seeing through the kernel — the way K8s actually makes things happen underneath.
This repo is where that curiosity meets production-grade infrastructure.

What this is
FinFlow is a fintech payments simulation — a 3-tier PERN stack (React + Node.js + PostgreSQL) running on Kubernetes, built to the same standards I'd apply to a real system.
Every infrastructure decision here has a business consequence attached to it:

Hardcoded secrets = compliance failure
Missing resource limits = no autoscaling under load
Lost PVC = transaction history gone
Wrong image tag = silent rollback, payments down

This isn't a demo. It gets broken, diagnosed, and fixed — the same way it happens in production.

Stack
LayerToolOrchestrationKubernetes — Rancher DesktopIngressTraefikAppReact (Vite) + Node.js + ExpressDatabasePostgreSQL 15 + PVCAutoscalingHPA — CPU basedConfigConfigMap + K8s SecretsMonitoringPrometheus + Grafana (Week 3)Runtime SecurityFalco (Week 3)Cost VisibilityKubecost (Week 3)GitOpsArgoCD (Month 2)BackupVelero (Month 2)Deep ObservabilityeBPF — bpftrace, Cilium, Tetragon (Month 10+)

Repo structure
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

Current cluster state
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

Incidents
#What brokeRoot causeFix1Ingress routing to wrong serviceTwo wildcard rules — Traefik picks silentlyExplicit path rules, removed duplicate2HPA showing <unknown> CPUresources.requests missing in specAdded CPU requests to all deployments3DB credentials in GitPOSTGRES_PASSWORD hardcoded in YAMLK8s Secret + secretKeyRef4/api/transactions 404 after updateStale image tag caused silent rollbackFixed image tag — YAML is source of truth
Full writeups in /docs.

Architecture
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

Contact
Kartik Kakodiya — DevOps & SRE · Kubernetes Troubleshooter · Fintech Infra
linkedin.com/in/kartikk09 · kartikops.dev@gmail.com
Open to infrastructure audits, K8s troubleshooting, and SRE roles.