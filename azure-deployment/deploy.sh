#!/bin/bash

# Azure Container Apps Deployment Script
set -e

# Configuration
RESOURCE_GROUP="oms-microservices-rg"
CONTAINER_APP_ENV="oms-container-env"
CONTAINER_APP_NAME="onboarding-service"
REGISTRY_NAME="omsregistry"
IMAGE_NAME="onboarding-service"
IMAGE_TAG="latest"

echo "🚀 Starting Azure Container Apps deployment..."

# 1. Create Resource Group (if it doesn't exist)
echo "📦 Creating resource group..."
az group create --name $RESOURCE_GROUP --location "East US" || echo "Resource group already exists"

# 2. Create Container Registry (if it doesn't exist)
echo "🏗️ Creating Azure Container Registry..."
az acr create --resource-group $RESOURCE_GROUP --name $REGISTRY_NAME --sku Basic --admin-enabled true || echo "Registry already exists"

# 3. Login to ACR
echo "🔐 Logging into Azure Container Registry..."
az acr login --name $REGISTRY_NAME

# 4. Build and push Docker image
echo "🐳 Building and pushing Docker image..."
docker build -t $REGISTRY_NAME.azurecr.io/$IMAGE_NAME:$IMAGE_TAG .
docker push $REGISTRY_NAME.azurecr.io/$IMAGE_NAME:$IMAGE_TAG

# 5. Create Container Apps Environment (if it doesn't exist)
echo "🌍 Creating Container Apps Environment..."
az containerapp env create \
  --name $CONTAINER_APP_ENV \
  --resource-group $RESOURCE_GROUP \
  --location "East US" || echo "Environment already exists"

# 6. Create Container App
echo "📱 Creating Container App..."
az containerapp create \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --environment $CONTAINER_APP_ENV \
  --image $REGISTRY_NAME.azurecr.io/$IMAGE_NAME:$IMAGE_TAG \
  --target-port 3004 \
  --ingress external \
  --cpu 0.5 \
  --memory 1.0Gi \
  --min-replicas 1 \
  --max-replicas 10 \
  --env-vars \
    PORT=3004 \
    NODE_ENV=production \
    CORS_ORIGIN="https://oms-client-01ry.onrender.com,https://oms-server-ntlv.onrender.com" \
  --secrets \
    database-url="$DATABASE_URL" \
    redis-url="$REDIS_URL" \
  --secret-env-vars \
    DATABASE_URL=secretref:database-url \
    REDIS_URL=secretref:redis-url

# 7. Get the application URL
echo "🔗 Getting application URL..."
APP_URL=$(az containerapp show --name $CONTAINER_APP_NAME --resource-group $RESOURCE_GROUP --query "properties.configuration.ingress.fqdn" -o tsv)
echo "✅ Deployment complete!"
echo "🌐 Your microservice is available at: https://$APP_URL"
echo "🔍 Health check: https://$APP_URL/health"

# 8. Update frontend configuration
echo "📝 Update your frontend configuration:"
echo "VITE_ONB_BASE_URL=https://$APP_URL"
