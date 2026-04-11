# Oracle Cloud ARM Deployment  
**Date:** April 11, 2026  

## Objective  
Deploy **FinFlow 3-tier application** on an Oracle Cloud **k3s cluster (ARM64)**  

---

##  What Was Done  

- Created `finflow` namespace on Oracle cluster  
- Built ARM64 images using `docker buildx`  
  - Pushed to Docker Hub: `v4-arm`, `v5-arm`  
- Created **Postgres Secret** + **ConfigMap** in `finflow` namespace  

### Deployment Order  

1. **Postgres**
   - PVC  
   - Deployment  
   - Service  

2. **Backend**
   - ConfigMap  
   - Service  
   - Deployment  

3. **Frontend**
   - Deployment  
   - Service  

- Updated Oracle Security List → Opened port **30970** for public access  

---

## Incidents & Fixes  

| Problem | Root Cause | Fix |
|--------|------------|-----|
| Frontend loaded, but API returned 404 | `nginx.conf` missing — no `/api/` proxy | Added `proxy_pass` config, rebuilt `v5-arm` |
| 500 error on transactions | `transactions` table missing in fresh Postgres | Created table + seeded data via `kubectl exec` |
| Date showing "Invalid Date" | `created_at` not included in SELECT query | Updated query, rebuilt backend `v5-arm` |
| GitHub push blocked | Slack webhook URL exposed in commit history | Removed using `git filter-repo`, force pushed |

---

##  Result  

Application is live at:  
http://140.238.230.201:30970  

---

## 📦 GitHub  

Commit: `e3d8b21`  
