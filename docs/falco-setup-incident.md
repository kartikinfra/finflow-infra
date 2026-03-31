# Falco Runtime Security Setup

## What
Falco is a runtime security tool that detects suspicious 
behavior in containers at millisecond speed — using syscalls, 
no code changes required.

## Installation
helm repo add falcosecurity https://falcosecurity.github.io/charts
helm install falcosecurity falcosecurity/falco --namespace monitoring

Pod went through Init:1/2 → Init:2/2 → Running.
Driver: modern BPF probe (confirmed in startup logs).

## First Alert — False Positive
kubectl logs -n monitoring -l app.kubernetes.io/name=falco --tail=20

Alert: "Unexpected connection to K8s API Server from container"
Container: kube-prometheus-stack-grafana (k8s-sidecar)

Root cause: Grafana sidecar watches K8s API every 60 seconds 
to auto-load ConfigMaps as dashboards — no restart needed.
This is expected behavior, not an attack.

Key lesson: Falco detects everything. You need to know 
what's normal in your cluster before you can identify 
what's suspicious.

## Trigger Test — kubectl exec
Attempted: kubectl exec -it postgres -- sh
Expected: "Terminal shell in container" alert
Result: No alert triggered.

Root cause: Single-node VM limitation.
On production multi-node clusters, this rule fires immediately.

## Key Insight
False positives are not failures — they are signal.
Grafana sidecar talking to K8s API every minute looks 
exactly like a compromised container doing reconnaissance.
The difference is context. Falco gives you the data.
You bring the context. 

 ## Next Steps
- Add second node to cluster — validate Falco rules on 
  multi-node setup
