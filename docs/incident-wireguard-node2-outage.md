# Grafana "No Data" — WireGuard Tunnel Failure on Worker Node

## Problem

Custom Grafana dashboard provisioned via Helm (`grafana-values.yaml`) 
showed "No Data" across all panels after a Helm upgrade on k3s 
(Oracle Cloud ARM nodes).

## Investigation

**Step 1 — Dashboard layer**
- Helm upgrade failed initially due to incorrect `json: |` block 
  indentation in `grafana-values.yaml`
- Fixed YAML embedding, corrected `namespace="default"` → 
  `namespace="finflow"`
- Dashboard loaded — queries parsed — but still no data

**Step 2 — Prometheus layer**
- Tested `:9090` locally → `connection refused`
- Prometheus pod stuck in `Terminating` after Helm upgrade
- StatefulSet was `0/1` — new pod waiting for old to terminate

```bash
kubectl delete pod prometheus-kube-prometheus-stack-prometheus-0 \
  -n monitoring --force --grace-period=0
```

- StatefulSet recovered to `1/1` — still no data

**Step 3 — Node layer**
- Three monitoring pods stuck in `Terminating`
- Logs showed: `dial tcp 10.10.0.2:10250: connect: connection refused`
- Port `10250` = kubelet

```bash
kubectl get nodes
# NAME        STATUS     ROLES
# k3s-node1   Ready      control-plane
# k3s-node2   NotReady   worker
```

- k3s-agent on Node2 inactive for 5 hours
- WireGuard tunnel was down — node disconnected from control plane

## Root Cause

WireGuard tunnel on `k3s-node2` was `inactive` and `disabled`.
Node lost connection to control plane → kubelet stopped →
pods stuck terminating → Prometheus couldn't scrape → No data.

## Fix

```bash
sudo systemctl enable wg-quick@wg0
sudo systemctl start wg-quick@wg0
sudo systemctl restart k3s-agent
```

Node2 → Ready. Metrics flowing. Dashboard live.

## Business Impact

Complete monitoring blackout on production cluster — no alerts,
no metrics, no visibility. Any incident during this window 
would have gone undetected.

## Lesson

When Grafana shows "No Data" — don't debug the dashboard.
Debug the infrastructure underneath it.

Restore first. Debug second.
