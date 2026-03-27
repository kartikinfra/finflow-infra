# Incident: OOMKilled — Backend Crash Loop
**Date:** march  
**Severity:** High  
**Status:** Resolved

## Problem
Backend pod entered a crash loop.
`kubectl describe pod` Events section showed:

Exit Code: 137 — OOMKilled  
Reason: memory limit exhausted

Root cause: `resources.memory.limit` was set to 3Mi —
insufficient for a running Node.js process.

## How I Tackled It
Ran `kubectl describe pod` — confirmed OOMKilled.
Then measured actual usage:

kubectl top pod <backend-pod>
→ 25Mi actual memory consumption

This revealed the limit was far too tight.

## Fix
Updated the `resources` section in the deployment:

resources:
  requests:
    memory: "25Mi"
  limits:
    memory: "30Mi"

Rule locked: Request = measure with kubectl top.
Limit = 2–3x request for safety headroom.

## Business Impact
Backend down = /api/transactions unreachable.
All payment requests were failing.
In a real system, this means FinFlow's core feature —
transaction processing — is completely unavailable.
Tight limits are not efficient. Unmeasured limits guarantee outages.
