# Incident: WireGuard Hub Failure → Full Cluster Disconnect

**Date:** April 2025  
**Severity:** High — demo fully inaccessible  
**Recovery Time:** ~3 minutes  

## What Happened
Oracle Cloud silently rebooted Node1 (WireGuard hub).
WireGuard was not enabled on systemd — required manual start after every reboot.
Result: Cloudflare tunnel down, kubectl unreachable, all services inaccessible.

## Detection
Manually hit demo.kartikinfra.in → site down.
Ran kubectl get pods -n finflow → command hung (no WG = no API server access).
Ran sudo wg show → confirmed WireGuard inactive on Node1.

## Root Cause
Node1 = WireGuard hub + k3s control plane.
WireGuard service not enabled in systemd.
Oracle Cloud instance reboot → WG stayed down → entire cluster disconnected.

## Fix Applied
sudo systemctl enable wg-quick@wg0  (Node1 + Node2)
sudo systemctl is-enabled wg-quick@wg0 → confirmed: enabled

## Validation
Node1 reboot test next day:
- ping 10.10.0.1 from Node2 → live in 1.5 min
- kubectl get nodes + pods -A → all Running in 3 min
- demo.kartikinfra.in → live, zero manual intervention

## Business Impact
Before fix: Any cloud reboot = full demo outage, manual SSH required.
After fix: Full auto-recovery in <3 min. Zero downtime for external users.
