# Azure Deployment Guide for Onboarding Microservice

This guide provides multiple options for deploying your onboarding microservice to Azure.

## 🚀 Quick Start (Recommended: Container Apps)

### Prerequisites
- Azure CLI installed and logged in
- Docker installed
- Node.js 18+ installed

### 1. Container Apps Deployment (Recommended)

```bash
# Clone and navigate to your project
cd onboarding-service

# Make deployment script executable
chmod +x azure-deployment/deploy.sh

# Set environment variables
export DATABASE_URL="your-postgresql-connection-string"
export REDIS_URL="your-redis-connection-string"

# Run deployment
./azure-deployment/deploy.sh
```

### 2. Manual Container Apps Setup

```bash
# Create resource group
az group create --name oms-microservices-rg --location "East US"

# Create Container Registry
az acr create --resource-group oms-microservices-rg --name omsregistry --sku Basic --admin-enabled true

# Login to registry
az acr login --name omsregistry

# Build and push image
docker build -f azure-deployment/Dockerfile -t omsregistry.azurecr.io/onboarding-service:latest .
docker push omsregistry.azurecr.io/onboarding-service:latest

# Create Container Apps Environment
az containerapp env create \
  --name oms-container-env \
  --resource-group oms-microservices-rg \
  --location "East US"

# Deploy Container App
az containerapp create \
  --name onboarding-service \
  --resource-group oms-microservices-rg \
  --environment oms-container-env \
  --image omsregistry.azurecr.io/onboarding-service:latest \
  --target-port 3004 \
  --ingress external \
  --cpu 0.5 \
  --memory 1.0Gi \
  --env-vars PORT=3004 NODE_ENV=production
```

## 🏗️ Alternative Deployment Options

### Option 2: Azure App Service

```bash
# Deploy using ARM template
az deployment group create \
  --resource-group oms-microservices-rg \
  --template-file azure-deployment/app-service.json \
  --parameters appName=onboarding-service

# Deploy code using ZIP
zip -r app.zip . -x "node_modules/*" ".git/*" "*.md"
az webapp deployment source config-zip \
  --resource-group oms-microservices-rg \
  --name onboarding-service \
  --src app.zip
```

### Option 3: Azure Functions (Serverless)

```bash
# Install Azure Functions Core Tools
npm install -g azure-functions-core-tools@4 --unsafe-perm true

# Create Function App
az functionapp create \
  --resource-group oms-microservices-rg \
  --consumption-plan-location "East US" \
  --runtime node \
  --runtime-version 18 \
  --functions-version 4 \
  --name onboarding-service-func \
  --storage-account omsstorageaccount

# Deploy function
func azure functionapp publish onboarding-service-func
```

## 🔧 Configuration

### Environment Variables

Set these in your Azure deployment:

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:port/db
REDIS_URL=redis://host:port
CORS_ORIGIN=https://oms-client-01ry.onrender.com,https://oms-server-ntlv.onrender.com

# Optional
PORT=3004
NODE_ENV=production
LOG_LEVEL=info
```

### Secrets Management

For sensitive data, use Azure Key Vault:

```bash
# Create Key Vault
az keyvault create --name oms-keyvault --resource-group oms-microservices-rg

# Add secrets
az keyvault secret set --vault-name oms-keyvault --name "database-url" --value "$DATABASE_URL"
az keyvault secret set --vault-name oms-keyvault --name "redis-url" --value "$REDIS_URL"
```

## 🔗 Frontend Integration

After deployment, update your frontend configuration:

```typescript
// OMS-client/lib/api/onboardingClient.ts
const base = 'https://your-container-app-url.azurecontainerapps.io';
```

Or set environment variable:
```bash
VITE_ONB_BASE_URL=https://your-container-app-url.azurecontainerapps.io
```

## 📊 Monitoring & Logging

### Application Insights

```bash
# Create Application Insights
az monitor app-insights component create \
  --app onboarding-service-insights \
  --location "East US" \
  --resource-group oms-microservices-rg

# Get instrumentation key
az monitor app-insights component show \
  --app onboarding-service-insights \
  --resource-group oms-microservices-rg \
  --query instrumentationKey
```

### Health Checks

Your service includes a health endpoint at `/health` that Azure can use for monitoring.

## 🔒 Security Best Practices

1. **Use Managed Identity** for Azure service authentication
2. **Enable HTTPS only** in all configurations
3. **Use Key Vault** for secrets management
4. **Configure CORS** properly for your domains
5. **Enable Application Insights** for monitoring

## 🚀 CI/CD Pipeline

### GitHub Actions Example

```yaml
name: Deploy to Azure Container Apps

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Azure Login
        uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      
      - name: Build and Push
        run: |
          az acr build --registry omsregistry --image onboarding-service:${{ github.sha }} .
      
      - name: Deploy
        run: |
          az containerapp update \
            --name onboarding-service \
            --resource-group oms-microservices-rg \
            --image omsregistry.azurecr.io/onboarding-service:${{ github.sha }}
```

## 🆘 Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure CORS_ORIGIN includes your frontend domain
2. **Database Connection**: Verify DATABASE_URL is correct and accessible
3. **Port Issues**: Ensure PORT=3004 is set correctly
4. **Memory Issues**: Increase memory allocation if needed

### Debug Commands

```bash
# Check container logs
az containerapp logs show --name onboarding-service --resource-group oms-microservices-rg

# Check app service logs
az webapp log tail --name onboarding-service --resource-group oms-microservices-rg

# Test health endpoint
curl https://your-app-url.azurecontainerapps.io/health
```

## 💰 Cost Optimization

- **Container Apps**: Pay per request, good for variable traffic
- **App Service**: Fixed cost, good for consistent traffic
- **Functions**: Pay per execution, good for event-driven workloads

Choose based on your traffic patterns and budget requirements.
