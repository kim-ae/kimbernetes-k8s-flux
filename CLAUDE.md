# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build, test, and lint commands

This repository does not define a dedicated test suite, linter, `Makefile`, or package manager workflow. The practical validation workflow is Kustomize-based.

This cluster is **not** AKS. `awesome-kim7s` runs on bare metal inside an internal network, so do not use AKS MCP tools or `az`/Azure MCP workflows for investigation, deployment, or troubleshooting in this repository.

**Shared environment safety rule**: the local `kubeconfig` has many unrelated contexts (other companies' AKS clusters, kubility, teds-shared, minikube, etc.) alongside this cluster's own context, named `awesome-kim7s`. Before running **any** `kubectl` or `flux` command in this project, always run `kubectl config current-context` first and confirm it is exactly `awesome-kim7s`. If it is not, run `kubectl config use-context awesome-kim7s` before proceeding. Never run a cluster-mutating command (`apply`, `delete`, `flux reconcile`, `flux suspend/resume`, etc.) without this check immediately before it in the same step.

Render the full cluster overlay:

```bash
kubectl kustomize overlays/kimawesome
```

Render a single application or infrastructure slice:

```bash
kubectl kustomize overlays/kimawesome/applications/tooling/faulty-thing
kubectl kustomize overlays/kimawesome/infrastructure/apigateway
kubectl kustomize overlays/base/faulty-thingy
```

Client-side validate a single overlay before committing:

```bash
kubectl apply --dry-run=client -k overlays/kimawesome/applications/tooling/faulty-thing
```

Apply a local overlay during manual verification:

```bash
kubectl apply -k overlays/kimawesome/applications/tooling/faulty-thing
```

If `kustomize` is installed separately, the equivalent render command is `kustomize build <path>`.

## High-level architecture

Flux bootstrapping lives under `cluster/kimawesome/flux-system/`. The cluster entrypoint is `cluster/kimawesome/kustomization.yaml`, which points Flux at `cluster/kimawesome/kustomization.flux.yaml`; that Flux `Kustomization` reconciles `./overlays/kimawesome`.

`overlays/kimawesome/kustomization.yaml` is the main environment composition layer. It splits the cluster into `loadbalancer`, `infrastructure`, `applications`, and `site`, each with a matching `kustomization.flux.yaml` when Flux should reconcile that subtree directly.

Reusable workload definitions live under `overlays/base/`. These bases usually contain the deployable Kubernetes objects for one app or service: `deployment.yaml`, `service.yaml`, and sometimes generated config like `configMapGenerator`.

Environment-specific behavior is layered on top of those bases under `overlays/kimawesome/...`. A typical application overlay references a base with a relative path and adds cluster-specific resources like `HTTPRoute`, namespace selection, or HelmRelease patches.

Ingress is implemented with Gateway API and `kgateway`. The shared gateways are defined in `overlays/kimawesome/infrastructure/apigateway/`, especially `https-gateway.yaml`. Application overlays attach `HTTPRoute` resources to specific gateway listeners by `parentRefs.sectionName`.

Certificates are managed separately from routes. Gateway listeners reference certificate secrets directly, while certificate and issuer setup lives under `overlays/kimawesome/infrastructure/base-certificate/` and `overlays/base/cert-manager/`.

## Key conventions

Use `kustomization.yaml` for normal Kustomize composition and `kustomization.flux.yaml` for Flux `Kustomization` custom resources. When changing deployment topology, check both layers.

Most day-to-day app changes belong under `overlays/`, not under `cluster/kimawesome/flux-system/`. The `gotk-*.yaml` files are Flux bootstrap artifacts, not the normal place for application edits.

Applications are often namespaced by a parent overlay instead of in each child manifest. For example, `overlays/kimawesome/applications/tooling/kustomization.yaml` sets `namespace: tooling`, so child resources in that subtree usually omit `metadata.namespace`.

For new externally reachable apps, follow the existing pattern:

- add or reuse a base under `overlays/base/<app>`
- include that base from an environment overlay
- add an `HTTPRoute` in the environment overlay
- make sure the route `parentRefs.sectionName` matches an existing listener in `overlays/kimawesome/infrastructure/apigateway/https-gateway.yaml`
- make sure the route hostname matches the gateway listener hostname

Gateway listener access may be namespace-wide or label-restricted. Some listeners allow routes from all namespaces, while others use `allowedRoutes.namespaces.from: Selector`. When a route is not attaching, verify the namespace labels and listener selector, not just the route itself.

Sensitive application configuration is stored as sealed secrets, for example under `overlays/kimawesome/applications/version-management/shared-resources/`. Do not replace those with plain `Secret` manifests. When drafting a new sealed secret without cluster access to run `kubeseal`, commit a `.ignore-*` gitignored plaintext template plus a placeholder `*.sealed.yaml` with a comment explaining it must be regenerated via `kubeseal` before it is real — never fabricate fake `encryptedData`.

Observability components that are pure in-cluster workloads (no `HTTPRoute`, e.g. exporters, `ServiceMonitor`s) live directly under `overlays/kimawesome/infrastructure/observability/<component>/` without a separate `overlays/base/` layer, following the existing `monitors-external`/`monitors-infrastructure`/`grafana-loki` pattern; only externally reachable apps need the full `overlays/base/<app>` + environment overlay split. `pve-exporter` (namespace `observability`, `prompve/prometheus-pve-exporter` image) follows this pattern: it reads Proxmox credentials from a mounted `pve.yml` config file passed via `--config.file=<path>` (the upstream image's CLI takes `--config.file`, not a bare positional path and not env vars — verify with `docker run --rm prompve/prometheus-pve-exporter:latest --help` if the image version changes) sourced from the `pve-exporter-secrets` sealed secret, and its `ServiceMonitor` scrapes `/pve?target=proxmox-external-service.external-services.svc.cluster.local&module=default` since the exporter runs off the Proxmox host and reaches it via the existing `proxmox-external-service` Service in the `external-services` namespace. On the Proxmox side, the API token backing this (and any future) exporter must have `PVEAuditor` (or another role) granted to **both** the token identity (`user@realm!tokenid`) **and** the underlying user (`user@realm`) on the same path — with privilege separation enabled (the default), Proxmox computes the effective permission as the **intersection** of the user's and the token's own ACLs, not their union and not the token acting fully independently; granting the role only to the token (leaving the user with no ACL at all) causes an intermittent-looking `403 Permission check failed` on some endpoints (e.g. `/cluster/status`, `/nodes/<node>/status`) while others (e.g. `/cluster/resources`) still work, which is confusing to debug.

Generated configuration is part of the repo's normal pattern. Examples include `configMapGenerator` for app scripts in `overlays/base/faulty-thingy/` and for CoreDNS customization in `overlays/kimawesome/applications/kustomization.yaml`. Preserve generator-based patterns instead of inlining generated output.
