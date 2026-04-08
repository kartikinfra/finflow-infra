#  Network Policies & RBAC: Locking Down FinFlow

## What I Built
Applied a full Network Policy set to the FinFlow stack (frontend, backend, postgres)
and created dedicated ServiceAccounts for each pod.

## Network Policy Order
Started from the most sensitive component and worked outward:
1. `default-deny-all` — block everything first
2. Postgres ingress — allow only backend to reach it
3. Backend egress → postgres, ingress ← frontend
4. Frontend egress → backend, ingress ← external traffic
5. CoreDNS egress (port 53 UDP+TCP) for both frontend and backend

Tested each policy individually — `kubectl exec` into pod, then `curl` to 
verify allow/deny behavior before moving to the next rule.

## CoreDNS — Why Port 53 Matters
After default-deny-all, DNS resolution breaks silently. When frontend tries 
to reach backend via service name, the request first goes to CoreDNS in 
`kube-system` namespace on port 53. Without an explicit egress rule for 
port 53 (UDP + TCP), the pod cannot resolve any service name — connection 
fails before it even starts.

## Bug — default-deny-all Missing Egress
Initial commit had only `Ingress` in policyTypes. This meant pods could 
still send traffic anywhere outbound. In a fintech context, this is a 
critical gap — an attacker with pod access could exfiltrate data freely. 
Fixed by adding `Egress` to policyTypes.

## Ingress vs Egress — YAML Direction Confusion
Key rule to remember:
- **Egress rule** → `podSelector` is the pod *sending* traffic, `to` is the destination
- **Ingress rule** → `podSelector` is the pod *receiving* traffic, `from` is the source

Getting this backwards is a silent failure — policy applies to the wrong pod.

## ServiceAccounts — Why No Role/RoleBinding
Created `svc-acc-frontend`, `svc-acc-backend`, `svc-acc-postgres`.
None of these pods need K8s API access to do their job — frontend serves UI,
backend handles API + DB queries, postgres stores data. Kubelet handles 
secret injection at startup via `secretKeyRef`; the pod itself never calls 
the API.

No Role or RoleBinding needed. This is intentional.

> Principle of Least Privilege — if a pod doesn't need K8s API access, 
> don't give it any. Empty ServiceAccount = no cluster permissions = 
> smaller attack surface.

## Key Takeaway
Network Policies are additive and whitelist-only. Default-deny-all first,
then open exactly what's needed — nothing more. Test after every single rule.
