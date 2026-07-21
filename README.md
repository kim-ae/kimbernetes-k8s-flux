# kimbernetes-k8s-flux — Full Reference Memory

This document is a comprehensive technical memory of the `kimbernetes-k8s-flux` GitOps repository. It exists so that anyone (human or AI) picking this repo back up can understand the whole architecture without re-deriving it from scratch. It complements (does not replace) `CLAUDE.md`, which holds the condensed day-to-day operating conventions.

Cluster codename: **kim7s** (Flux calls it `awesome-kim7s` in `externalLabels.cluster: ${CLUSTER}`).

## 1. Physical / cluster facts

- 2 nodes, both notebooks on WiFi only:
  - `controlplane-82md` — `192.168.0.101` (interface `wlp0s20f3`)
  - `node01-82nm` — `192.168.0.102`
- Kubernetes `v1.33.0` installed via `kubeadm` (`kubelet`/`kubeadm`/`kubectl` pinned and held with `apt-mark hold`)
- Cluster bootstrap used `--skip-phases=addon/kube-proxy --apiserver-advertise-address=192.168.0.101 --pod-network-cidr=10.1.0.0/16 --upload-certs` (no kube-proxy — Cilium replaces it)
- Pod CIDR: `10.1.0.0/16`. Service CIDR: Kubernetes default `10.96.0.0/12`.
- Pre-reqs applied on both nodes: `net.ipv4.ip_forward=1`, swap disabled (`swapoff -a`, fstab commented, `swap.target` masked), containerd configured with `SystemdCgroup = true`.
- inotify limits raised (`fs.inotify.max_user_instances/watches/queued_events`) to avoid "too many open files" issues.

## 2. Networking stack

### 2.1 Cilium (CNI)
Config lives in `cilium-values.yaml` at repo root (installed directly with `cilium install`/`cilium upgrade`, not via Flux HelmRelease):
```yaml
cluster:
  name: kubernetes
k8sServiceHost: 192.168.0.101
k8sServicePort: 6443
kubeProxyReplacement: true
operator:
  replicas: 1
routingMode: tunnel
tunnelProtocol: vxlan
gatewayAPI:
  enabled: false   # Gateway API support moved to kgateway; Cilium's own GatewayAPI was removed
nodePort:
  enabled: false
l2announcements:
  enabled: true
```
Key facts:
- **No kube-proxy** — Cilium eBPF handles all service routing (`kubeProxyReplacement: true`). Never suggest kube-proxy/IPVS fixes.
- **VXLAN tunneling** (`routingMode: tunnel`, `tunnelProtocol: vxlan`) — chosen because the nodes are WiFi notebooks; direct routing isn't viable on WiFi.
- Cilium's built in Gateway API support was tried first, then **removed in favor of `kgateway`** (see repo history note in `overlays/kimawesome/README.md`: "Installed kgateway and removed cilium gatewayapi").
- L2 announcements are enabled at the Cilium level; the actual policy CR is `overlays/kimawesome/loadbalancer/cilium-l2-policy.yaml`:
  ```yaml
  apiVersion: cilium.io/v2alpha1
  kind: CiliumL2AnnouncementPolicy
  metadata:
    name: l2-policy
    namespace: kube-system
  spec:
    interfaces:
      - wlp0s20f3
    externalIPs: false
    loadBalancerIPs: true
  ```

### 2.2 MetalLB (`overlays/base/metallb`, `overlays/kimawesome/loadbalancer/`)
- Base (`overlays/base/metallb`): HelmRelease + HelmRepository for MetalLB (namespace `metallb-system`).
- `overlays/kimawesome/loadbalancer/ippool.yaml`:
  ```yaml
  apiVersion: metallb.io/v1beta1
  kind: IPAddressPool
  metadata:
    name: first-pool
    namespace: metallb-system
  spec:
    addresses:
    - 192.168.10.0/24
  ```
- `l2advertisement.yaml` advertises `first-pool` on interface `wlp0s20f3`.
- **Important nuance**: MetalLB's own `L2Advertisement` is kept for IP *allocation*, but actual L2 ARP announcement duty on WiFi is handled by Cilium's `CiliumL2AnnouncementPolicy` above (plain MetalLB L2 ARP does not work reliably over WiFi APs — see `tailscale-metallb-troubleshooting.md` at repo root of the parent `home-server` repo for the full war story).
- Known VIP assignments (from `192.168.10.0/24` pool):
  - `192.168.10.0` → http-gateway
  - `192.168.10.1` → https-gateway (confirmed via `https-gateway-tcp-delay-options.md`: VIP `192.168.10.1`, Service `https-gateway:443`, NodePort `31601`, pod currently on `node01-82nm`)
  - `192.168.10.2` → internal-gateway

### 2.3 Gateway API / kgateway (`overlays/kimawesome/infrastructure/apigateway/`, `.../gatewayapi/`)
- Gateway API CRDs installed directly: `kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.4.0/standard-install.yaml`.
- `kgateway` is the GatewayClass/controller implementation (Envoy based), replacing Cilium's native Gateway API.
- Three `Gateway` objects defined in `overlays/kimawesome/infrastructure/apigateway/`:
  1. **`http-gateway.yaml`** — plain HTTP listener on port 80, `allowedRoutes.namespaces.from: All`. Backs MetalLB VIP `192.168.10.0`. Also has `http-internal-redirect.yaml` for internal HTTP→HTTPS redirect behavior.
  2. **`https-gateway.yaml`** — the public facing gateway (VIP `192.168.10.1`). Has many hostname specific listeners (one per external app, each with its own `certificateRefs` and `allowedRoutes.namespaces.from: All`):
     - `kim.tec.br` (root) → `root-kim-tec-br-tls`
     - `*.kim.tec.br` (wildcard) → `wildcard-kim-tec-br-tls`
     - `kim.tplinkdns.com` → `kim-iplinkdns-tls`
     - `yopass.kim.tec.br` → `yopass-kim-tec-br-tls`
     - `knowledge-hub.kim.tec.br` → `knowledge-hub-kim-tec-br-tls`
     - `leituras.kim.tec.br` → `leituras-kim-tec-br-tls`
     - `keepupprom.kim.tec.br` → `keepupprom-kim-tec-br-tls`
     - `no.kim.tec.br` (no-as-a-service) → `no-as-a-service-kim-tec-br-tls`
     - `grafana.kim.tec.br` → `grafana-kim-tec-br-tls`
     - `*.marianacabral.odo.br` (wildcard, second domain/tenant "mari") → `wildcard-marianacabral-odo-br-tls`
     - All listeners annotate `cert-manager.io/cluster-issuer: cluster-issuer` so cert-manager auto-provisions each `certificateRef` secret.
     - Port is 443 externally, backed by a NodePort internally (comment notes e.g. `31000`/`31601`).
  3. **`internal-gateway.yaml`** — VIP `192.168.10.2`, wildcard hostname `*.internal.kim.tec.br` on both `http` (port 80) and `https` (port 443, TLS terminate via `wildcard-internal-kim-tec-br-tls`). This is the gateway used for anything that should stay LAN only (Proxmox, TrueNAS, etc.)
  - Additional policies: `httppolicy-access-logs.yaml` (access logging), `httppolicy-internal-gateway.yaml` (policy scoped to the internal gateway).
- Apps attach via `HTTPRoute` with `parentRefs.sectionName` matching one of the listener `name`s above, and the route hostname must match the listener hostname exactly.

### 2.4 External (non-k8s) services exposed through the internal gateway
`overlays/kimawesome/applications/external-services/` — this is the key pattern for exposing **bare metal / non-cluster machines** through the cluster's Gateway API and (by extension) through Prometheus scraping. Each external target follows this exact recipe: a selector-less `Service` + a manually authored `Endpoints` object pointing at the real LAN IP, then an `HTTPRoute`, then (if TLS cert on the target is self signed) a `kgateway` `BackendConfigPolicy` with `tls.insecureSkipVerify: true`.

Current external services defined:
- **`proxmox-external-service.yaml`** — Proxmox host `192.168.0.4:8006` → `proxmox.internal.kim.tec.br` via `internal-gateway` `https` listener, insecure TLS skip-verify.
- **`truenas-external-service.yaml`** — TrueNAS `192.168.0.40:443` → `truenas.internal.kim.tec.br` via `internal-gateway` `https` listener, insecure TLS skip-verify.
- `drive-external-service.yaml`, `media-external-service.yaml` — same pattern for other LAN services (not fully inspected here; follow same shape).

This is the exact template used for exposing `node_exporter`/`process-exporter` targets running on bare-metal machines too — see `overlays/kimawesome/infrastructure/observability/monitors-external/` and section 4.3 below.

## 3. Flux GitOps structure

### 3.1 Bootstrap
Flux was bootstrapped with:
```
flux bootstrap github \
  --owner=<owner> --repository=<repo> --private=false --personal=true \
  --path=cluster/kimawesome \
  --token-auth=false --read-write-key=true \
  --components-extra='image-reflector-controller,image-automation-controller' \
  -v v2.6.4
```
- Flux version: **v2.6.4**, with `image-reflector-controller` and `image-automation-controller` extras enabled (for automated image tag updates).
- Bootstrap artifacts live in `cluster/kimawesome/flux-system/` (the `gotk-*.yaml` files) — these are Flux's own managed files, **not** where app changes go.
- `cluster/kimawesome/kustomization.yaml` is the literal entrypoint Flux watches; it references `cluster/kimawesome/kustomization.flux.yaml`.
- That Flux `Kustomization` CR reconciles path **`./overlays/kimawesome`** from the Git repo.

### 3.2 Reconciliation tree
```
cluster/kimawesome/kustomization.yaml
  -> cluster/kimawesome/kustomization.flux.yaml (Flux Kustomization CR)
       -> reconciles ./overlays/kimawesome

overlays/kimawesome/kustomization.yaml (plain Kustomize composition)
  resources:
    - loadbalancer/kustomization.flux.yaml
    - infrastructure/kustomization.flux.yaml
    - applications/kustomization.flux.yaml
    - site/kustomization.flux.yaml
    - mari/kustomization.flux.yaml
```
Each of `loadbalancer/`, `infrastructure/`, `applications/`, `site/`, `mari/` is its own Flux `Kustomization` CR (`kustomization.flux.yaml`) reconciled independently, alongside a plain `kustomization.yaml` used for local `kubectl kustomize`/`kustomize build` rendering. **Both files must be kept in sync when changing topology.**

### 3.3 `overlays/base/` vs `overlays/kimawesome/`
- `overlays/base/<name>/` — reusable, environment-agnostic building blocks. Usually a `HelmRelease` + `HelmRepository` pair (for Helm-based components) or `deployment.yaml`/`service.yaml` (+ `configMapGenerator`) for raw manifest apps. No cluster-specific values (namespace, hostnames, TLS refs) belong here.
- `overlays/kimawesome/` — the actual environment. References bases by relative path and layers on cluster-specific bits: namespace, `HTTPRoute`s, HelmRelease value overrides/patches, sealed secrets, PVCs tied to the real storage classes.
- `overlays/minikube/` — a second, throwaway/dev environment overlay (not used for the real home cluster; has its own minimal `README.md`).

### 3.4 Namespaces (namespace-per-parent-overlay pattern)
Namespace is usually set once at a parent `kustomization.yaml` (e.g. `overlays/kimawesome/applications/tooling/kustomization.yaml` sets `namespace: tooling`), so child resources omit `metadata.namespace`. Observed namespaces:
- `flux-system` — Flux controllers
- `kube-system` — Cilium, MetalLB pieces, kgateway control plane, metrics-server
- `metallb-system` — MetalLB Helm release
- `observability` — Prometheus stack, Grafana Operator, Grafana Alloy, Grafana Loki
- `cert-manager` — cert-manager controller
- `sealed-secrets` — sealed-secrets controller
- `chaos-mesh` — Chaos Mesh
- `dns-server` — bind9 (+ acme-dns)
- `tooling` — yopass, n8n, metube, no-as-a-service ("no"), faulty-thing
- `media` — calibre-web-automated
- `version-management` — version-management app + its MySQL
- `site` — knowledge-hub + articles content
- `mari` — second-tenant namespace for `marianacabral.odo.br` (currently minimal: only `kustomization.yaml`)
- `vpn` — Tailscale operator / Connector (`overlays/kimawesome/infrastructure/vpn/`)
- default namespace hosts ad hoc `BackendConfigPolicy` objects for external services

## 4. Observability stack (`overlays/base/{prometheus,grafana}`, `overlays/kimawesome/infrastructure/observability/`)

### 4.1 Prometheus
`overlays/base/prometheus/helmrelease.yaml` installs the **`kube-prometheus-stack`** chart (Prometheus Operator bundle) version `=79.5.0` from HelmRepository `prometheus` (`https://prometheus-community.github.io/helm-charts`), `targetNamespace: observability`, `interval: 24h`, `install.crds: Create` / `upgrade.crds: CreateReplace`.

Key values set:
- `nodeExporter.enabled: true` — the chart's own bundled node_exporter runs as a DaemonSet on the k8s nodes only (this already gives you the two notebooks' host metrics — it does NOT cover the other 5 notebooks/desktop since they aren't kubelets in this cluster).
- `grafana.enabled: false` — Grafana is **not** installed via kube-prometheus-stack; it's managed separately by `grafana-operator` (see 4.2).
- `prometheus.prometheusSpec`:
  - `replicas: 2`, `podAntiAffinity: hard` (spread across both nodes)
  - `retention: 2d`, `retentionSize: 25GiB`
  - `storageSpec.volumeClaimTemplate`: `50Gi`, `storageClassName: local-storage`, `ReadWriteOnce`
  - **`serviceMonitorSelectorNilUsesHelmValues: false`** and **`podMonitorSelectorNilUsesHelmValues: false`** — this is important: it means Prometheus has a nil/empty selector for `ServiceMonitor`/`PodMonitor`, so it picks up **any** `ServiceMonitor`/`PodMonitor` in the cluster regardless of label, not just ones matching the Helm release's own label convention. This confirms `ServiceMonitor`/`PodMonitor` CRDs are the intended, already-working pattern for adding new scrape targets here.
  - `enableRemoteWriteReceiver: false`
  - `externalLabels.cluster: ${CLUSTER}` (Flux substitutes this from a variable, presumably `kim7s`/`awesome-kim7s`)
  - `tolerations: [{effect: NoSchedule, operator: Exists}]` — schedulable on tainted nodes too
- `alertmanager.alertmanagerSpec`:
  - `replicas: 1` — **deliberately pinned to 1**, comment: *"Mimir can't handle more than 1 without lots of config, don't change this!"* (implies logs/metrics may be forwarded to a Mimir/Grafana Cloud backend somewhere, or this is a carried-over comment from a template — worth clarifying if revisited)
  - `storage`: `50Gi`, `storageClassName: managed-csi-zrs`
  - `podDisruptionBudget.enabled: false`
- `kube-state-metrics`: extended RBAC to `list`/`watch` all Flux CRD groups (`source/kustomize/helm/notification/image.toolkit.fluxcd.io`), plus a large `customResourceState.config` block that turns Flux's own CRs (`Kustomization`, `HelmRelease`, `GitRepository`, `Bucket`, `HelmRepository`, `HelmChart`, `OCIRepository`, `Alert`, `Provider`, `Receiver`, `ImageRepository`, `ImagePolicy`, `ImageUpdateAutomation`) into Prometheus metrics prefixed `gotk_*` (e.g. `gotk_resource_info` with labels `name`, `exported_namespace`, `ready`, `suspended`, `revision`, `source_name`, etc). This is how Flux health/reconciliation state becomes visible in Grafana/Prometheus.

### 4.2 Grafana stack (no classic in-chart Grafana)
`overlays/base/grafana/` contains three separate pieces, each its own Helm chart, all sourced from the `grafana` HelmRepository (`https://grafana.github.io/helm-charts`):
- **`grafana-operator`** — CRD-based Grafana instance/dashboard/datasource management (Grafana itself runs as a CR-managed deployment, not the classic subchart).
- **`grafana-alloy`** — the collector agent (replaces Promtail/older Grafana Agent). Ships pod logs, node journal logs, and Kubernetes events to Loki, and likely also does some metrics forwarding.
- **`grafana-loki`** — Loki log storage, `SingleBinary` mode, backed by a local MinIO for object storage.
- Cluster-specific composition lives in `overlays/kimawesome/infrastructure/observability/`:
  ```
  namespace: observability
  resources:
  - namespace.yaml
  - grafana-alloy
  - prometheus
  - ../../../base/grafana/helm-repository.yaml
  - grafana-operator
  - monitors-infrastructure/kustomization.flux.yaml
  - grafana-loki
  ```
- Grafana is exposed externally at **`grafana.kim.tec.br`** via the `https-gateway` `https-grafana` listener.
- There's also a hostname `keepupprom.kim.tec.br` on the https-gateway — likely a Grafana/Prometheus adjacent tool ("keep up" / uptime style?), not fully inspected — check `overlays/kimawesome/applications/` if this needs revisiting.

### 4.3 Existing ServiceMonitor/PodMonitor examples (proof of pattern)
`overlays/kimawesome/infrastructure/observability/monitors-infrastructure/`:
- **`kgateway-monitor.yaml`** — two `PodMonitor`s (`monitoring.coreos.com/v1`), namespace `observability`, `namespaceSelector.any: true`:
  - `kgateway-monitor`: selects pods labeled `kgateway: kube-gateway`, scrapes port `http-monitoring`, `interval: 30s`, `path: /metrics`.
  - `kgateway-app-monitor`: selects pods labeled `kgateway: kgateway`, scrapes port `metrics`, `interval: 30s`, `path: /metrics`.
- **`metallb-monitor.yaml`** — `PodMonitor` `metallb-monitor`, selects pods labeled `app.kubernetes.io/instance: metallb`, scrapes port `monitoring`, `interval: 30s`, `path: /metrics`.

`overlays/kimawesome/infrastructure/observability/monitors-external/` (bare-metal, non-cluster machines — headless `Service` + manual `Endpoints`, then a `ServiceMonitor` pointing at the Service since these aren't pods):
- **`xps-notebook.yaml`** — `192.168.0.221`, `xps-notebook-exporters` bundle, two named ports: `node` (`9100`, `node_exporter`) and `process` (`9256`, `process-exporter`), both scraped every `30s` at `/metrics`. `machine_name: xps-notebook` label propagated onto every metric via `targetLabels`.
- **`media-center.yaml`** — `192.168.0.110`, `media-center-exporters` bundle, same shape (`node`/`9100` + `process`/`9256`), `machine_name: media-center`.

Visualized in Grafana via `overlays/base/grafana/dashboards/process-exporter-overview.json` (uid `process-exporter-overview`) for the per-process metrics, alongside the existing `machine-overview.json` (uid `machine-overview-node-exporter`) for host-level `node_exporter` metrics.

**Conclusion for the "PodMonitor vs ServiceMonitor vs static config" question**: this cluster already uses **`PodMonitor`** as its standard pattern for in-cluster components. Since `podMonitorSelectorNilUsesHelmValues: false`, any new `PodMonitor`/`ServiceMonitor` you add anywhere in the cluster (any namespace, due to `namespaceSelector.any: true` style selectors) will automatically be picked up — no extra Prometheus config needed. For the external bare-metal machines (notebooks, desktop, Proxmox, TrueNAS), reuse the exact `external-services` pattern (headless `Service` + manual `Endpoints`) already used for Proxmox/TrueNAS, then attach a `ServiceMonitor` (Service-backed, since these aren't pods) pointing at that Service's port(s) (9100 for node_exporter, 9256 for process-exporter). No `additionalScrapeConfigs`/static config needed — the existing Prometheus Operator setup already supports both monitor CRDs cluster-wide.

## 5. Certificates & DNS

### 5.1 cert-manager (`overlays/base/cert-manager/`, `overlays/kimawesome/infrastructure/cert-manager/`)
- Base: HelmRelease + HelmRepository (`jetstack`) for `cert-manager`.
- Cluster overlay (`overlays/kimawesome/infrastructure/cert-manager/`):
  - `cluster-issuer.yaml` (prod) and `stg-cluster-issuer.yaml` (Let's Encrypt staging) — both named/referenced as `cluster-issuer` via the `cert-manager.io/cluster-issuer` annotation on the Gateways.
  - Uses **Cloudflare DNS-01** challenge (`claudflare-api-token-secret.sealed.yaml` — sealed secret holding the Cloudflare API token; `.ignore-cloudflare-token.yaml` is the local, gitignored plaintext used to generate the sealed secret).
  - DNS-01 was chosen specifically to support **wildcard certificates** (`*.kim.tec.br`, `*.internal.kim.tec.br`, `*.marianacabral.odo.br`) which HTTP-01 cannot provide.
- `base-certificate/` (`overlays/kimawesome/infrastructure/base-certificate/`) — presumably where the actual `Certificate` CRs are defined for the root/wildcard domains (referenced by the Gateways' `certificateRefs`); only `kustomization.yaml` inspected directly, contents not fully expanded — revisit if adding a new certificate.

### 5.2 DNS (bind9 + acme-dns)
- `overlays/base/bind9/` — raw manifests: `deployment.yaml` + `service.yaml` + `kustomization.yaml`. Serves the internal zone `internal.kim.tec.br`. Per the parent `home-server` repo docs, bind9 actually runs on **Proxmox** (not in this k8s cluster) at `192.168.53.53:53` — cross-check before assuming the in-cluster `overlays/base/bind9` base is the one actually in production use; it may be a duplicate/candidate migration target. Verify which is authoritative if editing.
- `overlays/base/acme-dns/` — HelmRelease/HelmRepository based; used for ACME DNS challenges (likely a fallback/alternative to Cloudflare DNS-01, or supporting subdomain delegation for the ACME challenge itself). Deployed in `dns-server` namespace alongside bind9.

## 6. Storage

- `overlays/kimawesome/infrastructure/storage-class.yaml` defines two `StorageClass`es:
  - `local-storage` — `provisioner: kubernetes.io/no-provisioner`, `volumeBindingMode: WaitForFirstConsumer` (used by Prometheus).
  - `local-storage-immediate` — same provisioner, `volumeBindingMode: Immediate`.
- `overlays/base/csi-driver-nfs/` — HelmRelease/HelmRepository for the Kubernetes CSI NFS driver (chart source `https://raw.githubusercontent.com/kubernetes-csi/csi-driver-nfs/master/charts`). Provides an `nfs-csi` style StorageClass backed by the TrueNAS NFS export (used by Metube, Calibre downloads/library/ingest paths per prior exploration — exact server/share path not reconfirmed directly in this pass, check the StorageClass/PV manifest under `overlays/kimawesome/infrastructure/csi-driver-nfs/` if precision is needed).
- `alertmanager` uses a separate `managed-csi-zrs` StorageClass (likely a leftover naming convention or actually backed by local/NFS storage under a differently named class — verify if `managed-csi-zrs` resolves to something real in this cluster before relying on it).

## 7. VPN (Tailscale) (`overlays/kimawesome/infrastructure/vpn/`)
- Namespace: `vpn`.
- `operator-oauth.sealed.yaml` — sealed secret with the Tailscale OAuth client for the Tailscale Kubernetes operator.
- `router/` subfolder: `proxyclass.yaml` + `router.yaml` — this is where the **Tailscale `Connector`** (subnet router) is defined, advertising `192.168.0.0/16` + `192.168.10.0/24` back to the tailnet (per parent repo docs). `proxyclass.yaml` likely tunes the proxy pod (e.g., enabling privileged mode needed for subnet routing).
- Related base: none under `overlays/base` was seen named `tailscale` with just a bare Helm chart pairing (`overlays/base/tailscale/helmrelease.yaml` + `helmrepository.yaml` — the Tailscale operator Helm chart).

## 8. Secrets management
- `overlays/base/sealed-secrets/` — Bitnami `sealed-secrets` controller (HelmRelease/HelmRepository, chart repo `https://bitnami-labs.github.io/sealed-secrets`), namespace `sealed-secrets`.
- Convention: any sensitive value is committed as a `*.sealed.yaml` (encrypted with the cluster's sealing key, safe to commit), with a matching `.ignore-*.yaml` filename pattern used locally (gitignored, holds the plaintext used to generate the sealed version) — see `.ignore-secret.yaml`, `.ignore-output.yaml`, `.ignore-cloudflare-token.yaml`, `.ignore-db-secret.yaml`. **Never replace a `*.sealed.yaml` with a plain `Secret` manifest.**
- Examples found: `claudflare-api-token-secret.sealed.yaml` (cert-manager/Cloudflare), `db-secret.sealed.yaml` (version-management's MySQL), `operator-oauth.sealed.yaml` (Tailscale).

## 9. Applications (`overlays/kimawesome/applications/`)

| App | Namespace | Base used | Exposure | Notes |
|---|---|---|---|---|
| bind9 | `dns-server` | `overlays/base/bind9` | internal only | Internal DNS zone `internal.kim.tec.br` |
| acme-dns | `dns-server` | `overlays/base/acme-dns` | internal only | ACME DNS challenge support |
| calibre-web-automated | `media` | `overlays/base/calibre-web-automated` | `https-gateway` (`leituras.kim.tec.br` likely, verify) | Ebook library/reader, uses NFS-backed PVCs for library/ingest |
| metube | `tooling` | `overlays/base/metube` | via `tooling` HTTPRoutes | YouTube-DL style downloader, NFS + local PVCs |
| n8n | `tooling` | `overlays/base/n8n` (Helm chart, `n8n` HelmRepository) | via `tooling` HTTPRoutes | Workflow automation |
| yopass | `tooling` | `overlays/base/yopass` | `https-gateway` `https-yopass` (`yopass.kim.tec.br`) | One-time secret sharing; 2 containers (yopass + memcached) |
| "no" (no-as-a-service) | `tooling` | not in `overlays/base` (custom, image tag date-based e.g. `20260115`) | `https-gateway` `https-no-as-a-service` (`no.kim.tec.br`) | Managed via Flux image-automation (date-tagged image bumps) |
| faulty-thing / faulty-thingy | `tooling` | `overlays/base/faulty-thingy` | internal, used for chaos/testing | Uses `configMapGenerator` for scripts; ties into Chaos Mesh experiments (see `https-gateway-tcp-delay-options.md`) |
| version-management | `version-management` | app manifests + `mysql/` + `shared-resources/` (sealed DB secret + `database-config.properties`) | `https-gateway` (root `kim.tec.br` and/or dedicated host — see `httproute-kim-tec-br.yaml`) | Has its own MySQL backend |
| knowledge-hub + articles | `site` | `overlays/kimawesome/site/site/` | `https-gateway` `https-knowledge-hub` (`knowledge-hub.kim.tec.br`) | Static/article content site |
| chaos-mesh | `chaos-mesh` | `overlays/base/chaos-mesh` (Helm chart, `chaos-mesh` HelmRepository) | internal only | Fault injection platform, used against e.g. `https-gateway` per `https-gateway-tcp-delay-options.md` |
| tools | (namespace not directly confirmed) | `overlays/base/tools` | — | Not fully inspected this pass |
| metrics-server | `kube-system` | `overlays/base/metrics-server` (HelmRepository `kubernetes-sigs`) | n/a | Configured with `--kubelet-insecure-tls` (per bootstrap notes) |
| kgateway | `kube-system` | `overlays/base/kgateway` | n/a | Gateway API controller/data plane |
| proxmox-external-service | default (or `applications` root) | n/a (raw manifest) | `internal-gateway` `https` (`proxmox.internal.kim.tec.br`) | Proxmox host `192.168.0.4:8006`, TLS skip-verify |
| truenas-external-service | default | n/a (raw manifest) | `internal-gateway` `https` (`truenas.internal.kim.tec.br`) | TrueNAS `192.168.0.40:443`, TLS skip-verify |
| drive-external-service, media-external-service | default | n/a (raw manifest) | `internal-gateway` | Same external-service pattern, targets not reconfirmed this pass |
| mari (`overlays/kimawesome/mari/`) | `mari` | minimal, just `kustomization.yaml` currently | `https-gateway` `https-mari-wildcard` (`*.marianacabral.odo.br`) | Second tenant/domain, mostly scaffold so far |

## 10. Known repo-level facts / gotchas to remember

1. `overlays/base/*` must stay environment-agnostic; all hostnames, namespaces, and TLS refs belong in `overlays/kimawesome/*`.
2. Every topology change needs updates in **both** `kustomization.yaml` (plain Kustomize) and `kustomization.flux.yaml` (Flux `Kustomization` CR) at the same directory level.
3. `serviceMonitorSelectorNilUsesHelmValues: false` / `podMonitorSelectorNilUsesHelmValues: false` on the Prometheus HelmRelease means **any** `ServiceMonitor`/`PodMonitor` in **any** namespace is auto-discovered — this is the preferred way to add new scrape targets (in-cluster or external via the `external-services` Service+Endpoints pattern), no `additionalScrapeConfigs`/static config edits needed.
4. `alertmanager` is pinned to `replicas: 1` deliberately — do not bump without reworking config (comment references Mimir limitations).
5. MetalLB's L2Advertisement alone does not reliably announce VIPs on WiFi; Cilium's `CiliumL2AnnouncementPolicy` (`l2annoucements.enabled: true` + the policy CR) is what actually makes L2 announcement work here. See parent repo's `tailscale-metallb-troubleshooting.md` for the debugging story.
6. Gateway API is served by `kgateway`, not Cilium's built-in Gateway API (explicitly disabled: `gatewayAPI.enabled: false` in `cilium-values.yaml`).
7. Certificates use Let's Encrypt via Cloudflare DNS-01 specifically to support wildcard domains; HTTP-01 would not support `*.kim.tec.br` etc.
8. External (non-Kubernetes) LAN devices are exposed to the cluster's Gateway/HTTPRoute (and thus can be exposed to Prometheus scraping) using a **headless `Service` + manually authored `Endpoints`** object with the real LAN IP — see `overlays/kimawesome/applications/external-services/`. This is the exact pattern to reuse for scraping `node_exporter`/`process-exporter` on the notebooks/desktop.
9. Flux image automation (`image-reflector-controller` + `image-automation-controller`) is enabled cluster-wide; at least the "no-as-a-service" app uses date-based image tags (e.g. `20260115`) that Flux can bump automatically.
10. This repo has no test suite/linter/Makefile — validation is purely `kubectl kustomize <path>` (render) and `kubectl apply --dry-run=client -k <path>` (client-side validate).

## 11. Open items / not fully verified in this pass

These are things worth double-checking directly in the repo before relying on them:
- Exact contents of `overlays/kimawesome/infrastructure/base-certificate/` (the actual `Certificate` CRs).
- Exact NFS server path backing `nfs-csi` StorageClass (parent repo docs previously suggested `storage.internal.kim.tec.br:/mnt/default-mirror-hdd-1tb/kubernetes` — reconfirm against `overlays/kimawesome/infrastructure/csi-driver-nfs/`).
- What `managed-csi-zrs` StorageClass actually resolves to (used only by Alertmanager).
- Full contents of `overlays/base/tools`, `overlays/base/version-management`, `overlays/base/knowledge-hub`, `overlays/base/n8n`, `overlays/base/metube`, `overlays/base/calibre-web-automated`, `overlays/base/yopass`, `overlays/base/chaos-mesh`, `overlays/base/kgateway`, `overlays/base/metrics-server` — base manifests weren't opened line by line this pass, only their file listing.
- Whether `bind9` actually runs from this cluster's `overlays/base/bind9` or from Proxmox directly, per the parent `home-server` repo's `CLAUDE.md` which states bind9 runs on Proxmox at `192.168.53.53:53`.
- `keepupprom.kim.tec.br` listener purpose (likely an uptime/monitoring tool, not yet identified precisely).

## References
- `CLAUDE.md` (this repo) — condensed day-to-day build/lint/architecture conventions.
- `overlays/kimawesome/README.md` — original cluster bring-up runbook (kubeadm, Cilium install, Flux bootstrap, kgateway migration, sysctl fixes).
- `overlays/minikube/README.md` — dev/minikube overlay notes (separate from production).
- `https-gateway-tcp-delay-options.md` — deep dive on simulating TCP delay in front of `https-gateway`, useful reference for the real MetalLB VIP/NodePort/pod placement facts it documents.
- Parent repo `home-server/CLAUDE.md` and `home-server/tailscale-metallb-troubleshooting.md` — cross-cluster/network facts (Tailscale, WiFi L2 ARP issue, bind9 on Proxmox).