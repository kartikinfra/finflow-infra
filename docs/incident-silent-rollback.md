# Incident: Silent Rollback — Stale Image Tag
**Date:** march  
**Severity:** High  
**Status:** Resolved
## Problem
After updating the deployment YAML to fix hardcoded 
DB credentials, the /api/transactions endpoint returned 404.
Pods were running. Logs looked clean. Network was fine.
## How I Tackled It
Checked pod logs — no errors.
Checked service and ingress — both correct.
Finally inspected the deployment YAML directly:
image: kaka750/finflow-backend:v1
The YAML had v1. v2 was running before the edit.
When the updated YAML was applied, K8s rolled back 
to v1 silently — no warning, no error.
kubectl describe pod confirmed the image tag.
## Fix
Updated the deployment YAML:
image: kaka750/finflow-backend:v2
Applied it. Endpoint restored immediately.
Rule locked: YAML is the source of truth.
K8s enforces exactly what the YAML says —
not what was previously running.
## Business Impact
/api/transactions was down — core payment feature unavailable.
In production, this means failed transactions, 
lost revenue, and customer trust damage.
Silent rollbacks are dangerous precisely because 
there is no warning. The system looks healthy while 
the wrong version is serving traffic.
