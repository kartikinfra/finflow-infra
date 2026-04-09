# Day 21 — WireGuard VPN + k3s Cluster on Oracle Cloud ARM

## Goal

Rancher Desktop (Lima VM) pe `kubectl exec` events Falco eBPF probe ko visible nahi the — kernel tracepoint path bypass ho raha tha. Real Linux kernel chahiye tha validation ke liye.

Day 20 mein Oracle Cloud pe 2 ARM nodes provision kiye the. Aaj unhe ek private Kubernetes cluster mein join kiya — WireGuard VPN tunnel ke through.

---

## Architecture

```
MacBook (kubectl only)
        ↕  WireGuard tunnel (encrypted)
        ↕
┌─────────────────────────────────────┐
│  Node 1  —  10.10.0.1 (WireGuard)  │  ← VPN Hub + k3s control-plane
│  Public:    140.238.230.201          │
│  Spec:      2 OCPU, 12GB RAM ARM    │
└─────────────────────────────────────┘
        ↕  WireGuard tunnel
┌─────────────────────────────────────┐
│  Node 2  —  10.10.0.2 (WireGuard)  │  ← k3s worker node
│  Public:    161.118.170.143          │
│  Spec:      2 OCPU, 12GB RAM ARM    │
└─────────────────────────────────────┘

MacBook WireGuard IP: 10.10.0.3
```

**Why hub-and-spoke with Node 1 as hub:**
Node 1 is always on with a static public IP. MacBook goes offline. Hub must be reachable 24/7.

**Why WireGuard IPs internally (not public IPs):**
- kubelet, API server, pod scheduling traffic stays off public internet
- Public IPs can change or become unreachable — WireGuard IPs are stable
- Same pattern as production fintech infra — cluster traffic on private network only

---

## Part 1 — WireGuard Setup

### Install

```bash
# Node 1 and Node 2 (run on both)
sudo apt update
sudo apt install wireguard -y
wg --version  # verify
```

Ubuntu 22.04 has WireGuard built into the kernel — `lsmod` shows nothing, that's normal.

### Generate Keypairs

Run on each machine (Node 1, Node 2, MacBook):

```bash
wg genkey > privatekey
wg pubkey < privatekey > publickey
```

### Config Files

**Node 1 — Hub (2 peers)**

```ini
[Interface]
PrivateKey = <Node1 private key>
Address = 10.10.0.1/24
ListenPort = 51820

[Peer]
PublicKey = <Node2 public key>
AllowedIPs = 10.10.0.2/32
Endpoint = 161.118.170.143:51820

[Peer]
PublicKey = <MacBook public key>
AllowedIPs = 10.10.0.3/32
Endpoint = <MacBook public IP>:51820
```

**Node 2 — Worker (1 peer)**

```ini
[Interface]
PrivateKey = <Node2 private key>
Address = 10.10.0.2/24
ListenPort = 51820

[Peer]
PublicKey = <Node1 public key>
AllowedIPs = 10.10.0.0/24
Endpoint = 140.238.230.201:51820
```

> `AllowedIPs = 10.10.0.0/24` — whole subnet allowed so Node 2 can route packets to MacBook (10.10.0.3) via Node 1.

**MacBook — Client**

```ini
[Interface]
PrivateKey = <MacBook private key>
Address = 10.10.0.3/32
ListenPort = 51820

[Peer]
PublicKey = <Node1 public key>
AllowedIPs = 10.10.0.0/24
Endpoint = 140.238.230.201:51820
```

Import into WireGuard Mac App → `+` → Import tunnel(s) from file → Activate.

> **Lesson learned:** Never use nano to write WireGuard configs. Nano pastes its status bar text (`"wg0.conf" [New] 0,0-1`) into the file — `wg-quick` fails with "Line unrecognized". Always use `tee` with heredoc:
> ```bash
> sudo tee /etc/wireguard/wg0.conf << 'EOF'
> ...config...
> EOF
> ```

### Start WireGuard

```bash
# Node 1 and Node 2
sudo wg-quick up wg0
sudo wg show
```

---

## Part 2 — Oracle Cloud iptables Fix (Critical)

Oracle Cloud VMs ship with an iptables `REJECT all` rule that blocks everything not explicitly allowed. This is **inside the VM** — separate from Oracle's Security List.

```bash
# Verify the REJECT rule exists
sudo iptables -L INPUT -n -v | head -30
# Look for: REJECT all -- * * 0.0.0.0/0 0.0.0.0/0 reject-with icmp-host-prohibited
```

**Fix on Node 1:**

```bash
# Allow WireGuard handshakes
sudo iptables -I INPUT -p udp --dport 51820 -j ACCEPT

# Allow k3s API server (workers connecting to control plane)
sudo iptables -I INPUT -p tcp --dport 6443 -j ACCEPT

# Allow Node 1 to forward packets between peers (Mac → Node 2 route)
sudo iptables -I FORWARD -i wg0 -o wg0 -j ACCEPT

# Enable IP forwarding (Node 1 as router)
sudo sysctl -w net.ipv4.ip_forward=1

# Persist rules across reboot
sudo apt install iptables-persistent -y
sudo netfilter-persistent save
```

**Fix on Node 2:**

```bash
sudo apt install iptables-persistent -y
sudo netfilter-persistent save
```

> **Diagnosis method:** `tcpdump -i enp0s6 udp port 51820` on Node 1 while pinging from MacBook. Packets were arriving but getting no response — classic iptables REJECT signature.

---

## Part 3 — k3s Cluster

### k3s Server on Node 1

```bash
curl -sfL https://get.k3s.io | sh -s - \
  --node-ip 10.10.0.1 \
  --tls-san 10.10.0.1 \
  --tls-san 140.238.230.201
```

- `--node-ip 10.10.0.1` — bind k3s to WireGuard IP, not public IP
- `--tls-san` — add both IPs to TLS certificate so kubectl doesn't get cert errors

```bash
sudo k3s kubectl get nodes  # verify Node 1 Ready
```

### Get Join Token

```bash
cat /var/lib/rancher/k3s/server/node-token
```

### k3s Agent on Node 2

```bash
curl -sfL https://get.k3s.io | K3S_URL=https://10.10.0.1:6443 \
  K3S_TOKEN=<paste token> \
  sh -s - \
  --node-ip 10.10.0.2
```

### Label Worker Node

```bash
sudo k3s kubectl label node k3s-node2 node-role.kubernetes.io/worker=worker
```

### Configure kubectl on MacBook

```bash
# On Node 1 — make kubeconfig readable
sudo cp /etc/rancher/k3s/k3s.yaml /home/ubuntu/k3s.yaml
sudo chmod 644 /home/ubuntu/k3s.yaml

# On MacBook
mkdir -p ~/.kube
scp -i <key> ubuntu@140.238.230.201:~/k3s.yaml ~/.kube/config

# Replace localhost with Node 1 WireGuard IP
sed -i '' 's/127.0.0.1/10.10.0.1/g' ~/.kube/config

# Verify
kubectl get nodes
```

> `127.0.0.1` in kubeconfig means localhost — on MacBook that points to MacBook itself, not Node 1. Must replace with `10.10.0.1`.

---

## Final State

```
NAME        STATUS   ROLES           AGE   VERSION
k3s-node1   Ready    control-plane   Xm    v1.34.6+k3s1
k3s-node2   Ready    worker          Xm    v1.34.6+k3s1
```

`kubectl get nodes` working from MacBook over WireGuard tunnel ✅

---

## Business Impact

Fintech infrastructure requirement: cluster traffic must not traverse public internet. Customer transaction data, internal service communication, secrets — none of it should be sniffable.

This setup mirrors that requirement:
- Zero cluster ports exposed publicly (6443, 10250 reachable only via WireGuard)
- All node-to-node traffic encrypted in transit
- MacBook access over VPN — same as how engineers in production access internal clusters

---

## Key Learnings

- **WireGuard hub must be always-on** — laptops sleep, cloud VMs don't
- **Oracle Cloud has two firewall layers** — Security List (cloud level) AND iptables (VM level). Both must be configured
- **iptables -I vs -A** — Insert at top (above REJECT rule), not Append at bottom
- **TLS-SAN required** — every IP that connects to API server must be in the cert
- **tee > nano** for config files — nano status bar corrupts configs silently
- **k3s uses WireGuard IPs for cluster** — `--node-ip` binds kubelet to private IP, not public

---

## Next

- Falco install on this cluster
- Validate `kubectl exec` → execve tracepoint on real Linux kernel (Day 19 blocked on Lima VM)
- Falco + Alertmanager pipeline
- Backend outbound connections Falco rule
