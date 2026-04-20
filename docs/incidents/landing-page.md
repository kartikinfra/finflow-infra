# Incident: Slow Query Detection via Live Trace

**Incident ID:** INC-6796  
**Severity:** HIGH  
**MTTD:** 2.70s  
**RBI Reportable:** YES (>500ms threshold)

---

## Problem

FinFlow backend latency spiked from ~200ms to 2700ms on the `/api/simulate-slow` endpoint. No index on the `amount` column in `transactions` table caused a full sequential scan across 100,000 rows.

---

## Detection

- Button click on `landing.kartikinfra.in` triggered real API call
- OpenTelemetry auto-instrumentation captured the HTTP span
- Trace ID `fe22fa958780efd250082053fdc669da` recorded in Grafana Tempo
- MTTD: 2.70s (client-side `performance.now()` measurement)

---

## Root Cause

```sql
SELECT * FROM transactions WHERE amount > $1 ORDER BY created_at
```

- No index on `amount` column
- Full table scan: 100,000 rows
- CPU saturation → latency spike
- Sequential scan cost: O(n) instead of O(log n)

---

## Fix Applied

```sql
CREATE INDEX idx_transactions_amount ON transactions(amount);
```

Expected latency post-fix: <50ms

---

## Business Impact

Payment flows exceeding 500ms breach RBI threshold for UPI transaction SLAs. At scale, this pattern causes customer-facing timeouts and potential regulatory flags under RBI's payment system guidelines.

---

## Evidence

- Trace ID: `fe22fa958780efd250082053fdc669da`
- Grafana Tempo: `https://grafana.kartikinfra.in/explore`
- Landing Page: `https://landing.kartikinfra.in`
