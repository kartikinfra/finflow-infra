# Incident: Hardcoded DB Credentials in Git
**Date:** march  
**Severity:** Critical  
**Status:** Resolved

## Problem
PostgreSQL password was hardcoded in the deployment YAML.
Plain text. Pushed to a public GitHub repository.
Any person with the repo URL had access to the database credentials.

## How I Tackled It
Identified POSTGRES_PASSWORD hardcoded directly in the 
deployment spec under env:.
Recognized this as a critical security violation —
credentials in Git cannot be untracked once pushed.

## Fix
Created a K8s Secret for sensitive values:
- POSTGRES_PASSWORD → psg-database-secret

Created a ConfigMap for non-sensitive DB config:
- DB_HOST, DB_NAME, DB_USER → postgres-config

Updated deployment to use envFrom:
- secretRef: psg-database-secret
- configMapRef: postgres-config

Credentials removed from YAML entirely.

## Business Impact
Exposed DB credentials = full database access for anyone 
with the repo URL.
For a fintech system, this means transaction data, 
user records, and payment history are all at risk.
In a regulated environment, this is a compliance failure —
not just a security issue.
