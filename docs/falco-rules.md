# Day 18 — Falco Custom Rules: Suppressing False Positives
 
## Context
 
Falco was installed on Day 17 and immediately started alerting on Grafana's `k8s-sidecar` container polling the Kubernetes API every 60 seconds. This is expected behavior — the sidecar watches for new ConfigMaps/dashboards so Grafana can hot-reload without a restart. Falco flagged it as suspicious because a container accessing the K8s API from inside the cluster looks like reconnaissance.
 
**Business impact:** Noisy false positives = alert fatigue = real threats get ignored. A security tool that cries wolf is worse than no tool at all.
 
---
 
## What We Were Trying To Do
 
Suppress the `Contact K8S API Server From Container` rule specifically for Grafana's k8s-sidecar containers, without disabling the rule globally.
 
---
 
## What Went Wrong (and Why)
 
### Attempt 1 — Custom rule with `ka_uri`
```yaml
condition: ka_uri contains "k8s.io" and not container.name = "k8s-sidecar"
```
**Failure:** `ka_uri` is a Kubernetes audit log field — not valid for syscall-based events. Falco on this cluster uses `modern_ebpf` probe which captures syscalls, not K8s audit logs.
 
### Attempt 2 — Wrong container name
```yaml
not container.name = "k8s-sidecar"
```
**Failure:** Actual container name in logs was `k8s_grafana-sc-datasources_kube-prometheus-...` — completely different from what we assumed. Always verify from actual logs, never assume.
 
### Attempt 3 — Wrong Helm values keys
```yaml
extraVolumes: ...
extraVolumeMounts: ...
```
**Failure:** Falco helm chart uses `volumes` and `volumeMounts`, not the `extra*` prefix. Lesson: always run `helm show values <chart> | grep -i <keyword>` before writing custom values.
 
### Attempt 4 — `append: true` (deprecated)
**Failure:** Falco 0.43.0 deprecated the `append` key. New syntax requires `override: condition: append`.
 
### Attempt 5 — Wrong rule name
```yaml
- rule: Unexpected connection to K8s API Server from container
```
**Failure:** Actual rule name in `falco_rules.yaml` is `Contact K8S API Server From Container`. Exact string match required.
 
---
 
## What Actually Worked
 
Falco's default rules expose **user-defined macros** as extension points for whitelisting. Instead of overriding the rule itself, we appended to the macro:
 
```yaml
customRules:
  falco_rules.local.yaml: |-
    - macro: user_known_contact_k8s_api_server_activities
      condition: or container.name contains "k8s_grafana-sc"
      override:
        condition: append
```
 
**Why this works:**
- `user_known_contact_k8s_api_server_activities` macro is already referenced in the default rule condition
- By default it evaluates to `never_true`
- Appending `or container.name contains "k8s_grafana-sc"` makes it return true for Grafana sidecars
- When the macro returns true → rule skips the alert
 
**Deployed via:**
```bash
helm upgrade falcosecurity falcosecurity/falco \
  -f falco-values.yaml \
  -n monitoring
```
 
---
 
## Verification
 
Startup logs confirmed both rule files loaded:
```
/etc/falco/falco_rules.yaml | schema validation: ok
/etc/falco/rules.d/falco_rules.local.yaml | schema validation: ok
```
 
Grafana sidecar alerts stopped. Rule is working.
 
---
 
## Key Takeaways
 
| What | Lesson |
|------|--------|
| `helm show values` | Always check chart-specific keys before writing values |
| Container names | Verify from actual logs — never assume |
| Falco field validity | Syscall-based events ≠ audit log fields |
| `append` deprecated | Use `override: condition: append` in Falco 0.43.0+ |
| Macro override | Cleanest way to whitelist — use built-in extension points |
 
---
 
## Files Changed
 
- `monitoring/falco-values.yaml` — customRules with macro override
- `monitoring/falco-rules.yaml` — removed (replaced by customRules approach)
 
