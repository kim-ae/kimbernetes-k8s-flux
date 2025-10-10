# Knowledge Hub Kubernetes Deployment

This directory contains Kubernetes manifests to deploy the Interactive Knowledge Hub using nginx with configmaps.

## Architecture

The deployment consists of:
- **ConfigMaps**: Store the HTML, CSS, and JS files separately
- **Nginx Deployment**: Serves the static files from configmaps
- **Service**: Exposes the nginx deployment internally
- **Ingress**: Routes external traffic based on domain rules

## Domain Configuration

The nginx configuration supports multiple domain patterns:

### Root Path Serving
- `knowledge-hub.kim.tec.br` → serves at `/`
- `leituras.kim.tec.br` → serves at `/`

### Subpath Serving  
- `kim.tec.br` → serves at `/knowledge-hub`

## Deployment Instructions

### 1. Deploy using Kustomize

```bash
# From the k8s directory
kubectl apply -k .
```

### 2. Manual Deployment (alternative)

```bash
# Deploy individual resources
kubectl apply -f configmap.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f ingress.yaml
```

### 3. Verify Deployment

```bash
# Check if pods are running
kubectl get pods -l app=knowledge-hub

# Check service
kubectl get svc knowledge-hub-service

# Check ingress
kubectl get ingress knowledge-hub-ingress
```

## Configuration Details

### ConfigMaps Generated
- `knowledge-hub-html`: Contains index.html
- `knowledge-hub-css`: Contains styles.css  
- `knowledge-hub-js`: Contains script.js
- `knowledge-hub-nginx-config`: Contains nginx.conf

### Nginx Configuration
The nginx.conf handles:
- Multiple server blocks for different domains
- Proper MIME types for CSS/JS files
- Security headers
- Gzip compression
- Cache control headers

### Resource Limits
- Memory: 64Mi request, 128Mi limit
- CPU: 50m request, 100m limit
- 2 replicas for high availability

## Updating Content

To update the site content:

1. Modify the source files (index.html, styles.css, script.js)
2. Redeploy using kustomize:
   ```bash
   kubectl apply -k .
   ```
3. Restart the deployment to pick up new configmaps:
   ```bash
   kubectl rollout restart deployment/knowledge-hub
   ```

## Troubleshooting

### Check nginx configuration
```bash
kubectl exec -it deployment/knowledge-hub -- nginx -t
```

### View nginx logs
```bash
kubectl logs -l app=knowledge-hub -f
```

### Test internal connectivity
```bash
kubectl port-forward svc/knowledge-hub-service 8080:80
# Then visit http://localhost:8080
```

## Notes

- The ingress assumes you have an nginx ingress controller installed
- TLS certificates are managed by cert-manager (optional)
- Adjust the ingress annotations based on your ingress controller
- The deployment uses nginx:1.25-alpine for security and size optimization