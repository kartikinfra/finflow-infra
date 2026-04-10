# Falco Outbound Network Rule

## Problem
Finflow cluster mein koi bhi container bahari IP se connect kar sakta tha bina detection ke. Agar koi malicious process outbound connection banaye — customer data, transactions, API keys — sab exfiltrate ho sakta tha silently.

## Tackle
- Falco `outbound` macro dhundha `falco_rules.yaml` mein — `evt.type=connect`, `fd.typechar 4/6` (IPv4/IPv6), `rfc_1918_addresses` exclude
- Rule condition: `outbound and container`
- YAML indentation errors — multiple helm upgrade failures
- `fd.dip` invalid field — `fd.name` se fix kiya
- CoreDNS false positive — `169.254.169.254` Oracle IMDS IP tha — `not container.name contains "coredns"` se exclude kiya

## Fix
```yaml
- rule: outbound-rule-no-unathorized-trafic-can-come-insidethePod
  desc: Detect outbound network connections from containers
  condition: >
    outbound
    and container
    and not container.name contains "coredns"
  output: >
    container outbound network detected |
    connection=%fd.name process=%proc.name
  priority: WARNING
```

## Business Impact
Fintech mein unauthorized outbound = silent data exfiltration. Customer transactions, API keys, credentials — sab risk mein hote hain. Yeh rule ensures ki koi bhi unexpected connection immediately visible ho — breach se pehle response possible hai.
