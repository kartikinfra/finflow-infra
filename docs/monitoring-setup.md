# Monitoring Stack Setup — Prometheus + Grafana on FinFlow
**Date:** sat/28/march
## Overview
Deployed a full observability stack on the FinFlow Kubernetes cluster 
using kube-prometheus-stack via Helm. Prometheus handles metric 
collection, Grafana handles visualization. Both isolated in a dedicated 
`monitoring` namespace.

## What Was Set Up

**Stack:** kube-prometheus-stack (Prometheus + Grafana + Alertmanager 
+ node-exporter + kube-state-metrics)
**Namespace:** monitoring
**Dashboard:** FinFlow Monitoring — 3 panels (CPU, Memory, Pod Restarts)

## Issues Encountered

### 1. CPU Metrics — No Data
**Query used initially:**
```promql
rate(container_cpu_usage_seconds_total{namespace="default", container!=""}[5m])
```
**Root cause:** Rancher Desktop's cAdvisor metrics do not expose a 
`container` label on this metric. The `container!=""` filter was 
silently dropping all results.

**Fix:** Removed the `container` label filter.
```promql
rate(container_cpu_usage_seconds_total{namespace="default"}[5m])
```

### 2. Memory Showing Raw Bytes
Memory panel was displaying values like `35000000` — unreadable at 
a glance.

**Fix:** Divided by 1024 twice to convert to MB directly in PromQL.
```promql
container_memory_working_set_bytes{namespace="default"} / 1024 / 1024
```
Set panel unit to `MB`. Values now display as `~30 MB`, `~25 MB`, 
`~5 MB` per pod.

## Final Dashboard State
| Panel | Metric | Type |
|-------|--------|------|
| CPU Usage | rate(container_cpu_usage_seconds_total) | Time series |
| Memory Usage | container_memory_working_set_bytes / 1024 / 1024 | Time series |
| Pod Restarts | kube_pod_container_status_restarts_total | Time series |

## Key Observations
- Backend pod is the highest CPU consumer in the default namespace
- All three FinFlow pods (frontend, backend, postgres) visible and 
  being scraped automatically — no manual ServiceMonitor config needed
- Pod restart count currently at 1 — stable, being monitored

## Takeaway
`rate()` applies to counters (values that only increase — CPU seconds, 
request totals). Gauges (memory, restart current state) are queried 
directly. Mixing them up produces either wrong data or no data.
![Dashboard](docs/assets/dashboard-1.png)