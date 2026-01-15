## Cluster Creation

## Installing a cluster
ipfoward should be enabled:
\# Permanent (add to sysctl.conf)
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

swap should be disabled
sudo swapoff -a      # Turns off all swap devices
sudo sed -i '/swap/s/^/#/' /etc/fstab  # Comments out swap lines
sudo systemctl mask swap.target

swapon --show


I've modified /etc/containerd/config.toml in:
```
sudo containerd config default > /etc/containerd/config.toml
```
version = 2

[plugins]

  [plugins."io.containerd.grpc.v1.cri"]

   [plugins."io.containerd.grpc.v1.cri".containerd]

      [plugins."io.containerd.grpc.v1.cri".containerd.runtimes]

        [plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc]

          runtime_type = "io.containerd.runc.v2"

          [plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc.options]

            SystemdCgroup = true
## Install kubeadm
```shell
sudo apt-get update
# apt-transport-https may be a dummy package; if so, you can skip that package
sudo apt-get install -y apt-transport-https ca-certificates curl gpg
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.33/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.33/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list
sudo apt-get update
sudo apt-get install -y kubelet=1.33.0-1.1 kubeadm=1.33.0-1.1 kubectl=1.33.0-1.1
sudo apt-mark hold kubelet kubeadm kubectl
```

Steps:
1. Configure kubeadm with using --skip-phases=addon/kube-proxy  --apiserver-advertise-address=192.168.0.101 --pod-network-cidr="10.1.0.0/16" --upload-certs
	1. Add worker nodes
2. Install cilium
```
cilium install --set kubeProxyReplacement=true --set k8sServiceHost=192.168.0.101 --set k8sServicePort=6443 --set nodePort.enabled=true --set gatewayAPI.enabled=true 
```
Cilium cli:
```
CILIUM_CLI_VERSION=$(curl -s https://raw.githubusercontent.com/cilium/cilium-cli/main/stable.txt)
CLI_ARCH=amd64
if [ "$(uname -m)" = "aarch64" ]; then CLI_ARCH=arm64; fi
curl -L --fail --remote-name-all https://github.com/cilium/cilium-cli/releases/download/${CILIUM_CLI_VERSION}/cilium-linux-${CLI_ARCH}.tar.gz{,.sha256sum}
sha256sum --check cilium-linux-${CLI_ARCH}.tar.gz.sha256sum
sudo tar xzvfC cilium-linux-${CLI_ARCH}.tar.gz /usr/local/bin
rm cilium-linux-${CLI_ARCH}.tar.gz{,.sha256sum}
```
ref: https://docs.cilium.io/en/stable/installation/k8s-install-kubeadm/
3. cilium status --wait
4. Bootstrap flux
```
export GITHUB_TOKEN="<>" && flux bootstrap github \
          --owner= \
          --repository= \          
          --private=false \      
          --personal=true \       
          --path= \
          --token-auth=false \
          --read-write-key=true \
          --components-extra='image-reflector-controller,image-automation-controller' \
          -v v2.6.4
```
5. Install apigateway
   1. Add the helmchart to flux
6. Modify cilium to use apigateway and update the GatewayClass to be configured with config file to enable NodePort
   1. cilium upgrade --set nodePort.enabled=true --set gatewayAPI.enabled=true 
7. Install sealed secrets
8. Install cert-manager
9.  Install metrics-server
	1. Adding - --kubelet-insecure-tls
10. Install alloy
	1. Configure to use grafana cloud (for now)
	2. Configure Logs
	3. Configure mertics
11. Configured DNS kim.tec.br
	1. Added new certificate in the cluster for version-management.kim.tec.br
		1. To add * I need a DNS server that can use DNS01 Challange (maybe cloudflare that is free for now)
    
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.4.0/standard-install.yaml

Instlled kgateway and removed cilium gatewayapi

https://metallb.io/configuration/