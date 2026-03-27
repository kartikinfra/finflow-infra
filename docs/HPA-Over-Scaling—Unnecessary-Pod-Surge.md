# Incident: HPA Over-Scaling — Unnecessary Pod Surge
**Date:** march  
**Severity:** Medium  
**Status:** Resolved

## Problem
Immediately after applying the deployment, pods scaled 
to maxReplicas (3) without any real load.
CPU request was set to 2m — far too low for a Node.js process.

## How I Tackled It
Ran kubectl get hpa — utilization showed 65%+.

HPA formula: actual usage / request × 100
Even minimal CPU usage against a 2m request
triggers aggressive scaling.

This confirmed the root cause: undermeasured CPU request.

## Fix
Updated resources in the deployment:

resources:
  requests:
    cpu: "100m"
    memory: "25Mi"
  limits:
    cpu: "300m"
    memory: "30Mi"

HPA stabilized back to 1 pod.

Rule locked: Never guess resource requests.
Measure with kubectl top, then set accordingly.

## Business Impact
3 pods running when 1 was sufficient.
In production, this means 3x compute cost for zero benefit.
For an early-stage fintech startup, this is direct runway burn —
infrastructure waste that compounds silently over time.
