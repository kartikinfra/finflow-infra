# Incident: Ingress Routing to Wrong Service
**Date:** march  
**Severity:** High  
**Status:** Resolved

## Problem
New Ingress was applied and looked correct.
But the app was still routing to the wrong service.
No errors. Pods running. Everything looked fine.

## How I Tackled It
Inspected the new Ingress YAML — it was correct.
Checked pods and services — all healthy.
Then ran:

kubectl get ingress -A

Two Ingress resources appeared — in different namespaces.
A stale Ingress from a previous namespace was still active
and silently overriding the new one.
Traefik was picking up the old rules without any warning.

## Fix
Deleted the stale Ingress from the old namespace.
New Ingress took effect immediately.
Correct service started receiving traffic.

Rule locked: Always run kubectl get ingress -A
when routing behaves unexpectedly.
Namespace-scoped resources can conflict silently.

## Business Impact
Wrong service receiving traffic = broken user experience.
In production, this could mean payment requests 
routing to the wrong backend — silent data misrouting
with no error thrown to the client.
