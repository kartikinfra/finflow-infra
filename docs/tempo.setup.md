#  Observability: Grafana Tempo Setup

## Overview
This document outlines the installation and configuration of **Grafana Tempo** within the `monitoring` namespace to enable distributed tracing for the FinFlow application. 

By implementing Tempo, I'm  moving beyond simple metrics and gain the ability to visualize the entire lifecycle of a request across microservices.

##  Installation Details

### 1. Repository Management
Added the official Grafana Helm repository to access the latest Tempo charts:
```bash
helm repo add grafana [https://grafana.github.io/helm-charts](https://grafana.github.io/helm-charts)
helm repo update

Tempo installed via Helm
Datasource configured in Grafana
URL: http://tempo.monitoring.svc.cluster.local:3200
