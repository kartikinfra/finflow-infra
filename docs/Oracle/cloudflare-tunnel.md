# Cloudflare Tunnel — Kubernetes Deployment Guide

Expose a Kubernetes service publicly over HTTPS without opening any inbound ports.  
No `port-forward`. No NodePort exposed to internet. Tunnel survives node restarts automatically.

**Live demo:** https://demo.kartikinfra.in

---

## Why Not Just Use NodePort or LoadBalancer?

| Approach | Problem |
|---|---|
| `kubectl port-forward` | Dies when terminal closes |
| NodePort | Exposes port directly — security risk |
| LoadBalancer | Costs money on cloud providers |
| Cloudflare Tunnel | Outbound only, free, HTTPS, survives restarts |

---

## Prerequisites

- A running Kubernetes cluster (k3s or any)
- A service already deployed (e.g. `finflow-frontend-svc` in `finflow` namespace)
- A Cloudflare account (free tier works)
- A domain added to Cloudflare (e.g. `kartikinfra.in`)

---

## Step 1 — Create Tunnel in Cloudflare Dashboard

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. **Zero Trust → Networks → Tunnels → Create a Tunnel**
3. Select **Cloudflared**
4. Name your tunnel (e.g. `finflow-demo`)
5. Copy the token shown — you will need it in Step 2

---

## Step 2 — Store Token as Kubernetes Secret

Never put the token directly in YAML. Store it as a secret:

```bash
kubectl create secret generic cloudflare-tunnel-token \
  --from-literal=token=<YOUR_TOKEN_HERE> \
  -n finflow
```

Verify:
```bash
kubectl get secret -n finflow
```

---

## Step 3 — Deploy Cloudflared as a Kubernetes Pod

Create `manifests/deployments/cloudflared-deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cloudflared
  namespace: finflow
spec:
  replicas: 1
  selector:
    matchLabels:
      app: cloudflared
  template:
    metadata:
      labels:
        app: cloudflared
    spec:
      containers:
        - name: cloudflared
          image: cloudflare/cloudflared:latest
          args:
            - tunnel
            - --no-autoupdate
            - run
            - --token
            - $(TUNNEL_TOKEN)
          env:
            - name: TUNNEL_TOKEN
              valueFrom:
                secretKeyRef:
                  name: cloudflare-tunnel-token
                  key: token
```

Apply:
```bash
kubectl apply -f manifests/deployments/cloudflared-deployment.yaml
```

Verify pod is running:
```bash
kubectl get pods -n finflow | grep cloudflared
```

> **Why deploy inside the cluster?**  
> If you run cloudflared on the node directly and the node restarts, the tunnel dies.  
> Inside Kubernetes, if the pod dies, the cluster restarts it automatically. 99.9% uptime.

---

## Step 4 — Add Domain to Cloudflare

1. Cloudflare Dashboard → **Websites → Onboard a domain**
2. Enter your domain (e.g. `kartikinfra.in`)
3. Select Free plan
4. Cloudflare will give you 2 nameservers — copy them

Go to your domain registrar (GoDaddy/Namecheap) → DNS Settings → Replace default nameservers with Cloudflare's nameservers.

Propagation takes 10–30 minutes.

Verify propagation:
```bash
nslookup kartikinfra.in
```

You should see Cloudflare IPs (`172.67.x.x` or `104.21.x.x`).

---

## Step 5 — Configure Public Hostname

In Cloudflare Dashboard:

**Zero Trust → Networks → Tunnels → finflow-demo → Edit → Public Hostname → Add**

| Field | Value |
|---|---|
| Subdomain | `demo` |
| Domain | `kartikinfra.in` |
| Type | `HTTP` |
| URL | `finflow-frontend-svc.finflow.svc.cluster.local:80` |

> Use `HTTP` here — Cloudflare handles HTTPS for the visitor automatically.

---

## Step 6 — Verify

Open browser:
```
https://demo.kartikinfra.in
```

Your app should be live over HTTPS with no manual steps.

---

## How It Works (Architecture)

```
Visitor
  ↓ HTTPS
Cloudflare Edge
  ↓ encrypted tunnel (outbound from cluster)
cloudflared pod (inside k8s)
  ↓ ClusterIP
finflow-frontend-svc
  ↓
Frontend Pod
```

- All traffic is **outbound** from the cluster — no inbound ports opened
- Token is stored in **K8s Secret** — never in YAML or code
- Pod restart = tunnel reconnects automatically

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `ERR_CONNECTION_TIMED_OUT` | Wait for DNS propagation, run `nslookup` to verify |
| Pod not starting | Check `kubectl logs -n finflow <cloudflared-pod>` |
| Tunnel shows unhealthy | Verify token is correct in secret |
| 502 Bad Gateway | Check service name and port in Public Hostname config |
