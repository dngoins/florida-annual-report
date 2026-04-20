#!/usr/bin/env bash
# ============================================================
# Florida Annual Report - Azure Deployment Script
#
# Usage:
#   ./scripts/deploy.sh [ENVIRONMENT] [COMMAND]
#
# Examples:
#   ./scripts/deploy.sh dev infra        # Provision Azure infrastructure
#   ./scripts/deploy.sh dev images       # Build & push container images
#   ./scripts/deploy.sh dev migrate      # Run DB migrations
#   ./scripts/deploy.sh dev all          # Full deploy (infra + images + migrate)
#   ./scripts/deploy.sh prod all
#
# Prerequisites:
#   - Azure CLI (az) >= 2.50  [brew install azure-cli]
#   - Docker running locally
#   - Logged in: az login
#   - Repo cloned and .env set up from .env.example
# ============================================================

set -euo pipefail

# ── Args ─────────────────────────────────────────────────────
ENVIRONMENT="${1:-dev}"
COMMAND="${2:-all}"

# ── Validate environment ──────────────────────────────────────
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
  echo "❌ Invalid environment: '$ENVIRONMENT'. Use: dev | staging | prod"
  exit 1
fi

# ── Config ───────────────────────────────────────────────────
LOCATION="eastus"
BASE_NAME="flar"
RESOURCE_GROUP="rg-florida-annual-report-${ENVIRONMENT}"
ACR_NAME="${BASE_NAME}${ENVIRONMENT}acr"
BACKEND_IMAGE="${ACR_NAME}.azurecr.io/backend:latest"
FRONTEND_IMAGE="${ACR_NAME}.azurecr.io/frontend:latest"
PARAM_FILE="infra/parameters/${ENVIRONMENT}.bicepparam"

echo "======================================================"
echo "  Florida Annual Report - Deploy"
echo "  Environment : $ENVIRONMENT"
echo "  Command     : $COMMAND"
echo "  Resource Grp: $RESOURCE_GROUP"
echo "======================================================"

# ── Helper: check prerequisites ───────────────────────────────
check_prereqs() {
  echo "🔍 Checking prerequisites..."
  command -v az >/dev/null 2>&1 || { echo "❌ Azure CLI not found. Install: https://aka.ms/installazurecli"; exit 1; }
  command -v docker >/dev/null 2>&1 || { echo "❌ Docker not found."; exit 1; }
  az account show >/dev/null 2>&1 || { echo "❌ Not logged in to Azure. Run: az login"; exit 1; }
  echo "✅ Prerequisites OK"
}

# ── Step 1: Provision Azure infrastructure ────────────────────
deploy_infra() {
  echo ""
  echo "📦 Step 1: Deploying Azure infrastructure ($ENVIRONMENT)..."

  az group create \
    --name "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --output none

  echo "   Resource group '$RESOURCE_GROUP' ready."

  # Generate SQL password if not provided
  if [[ -z "${SQL_ADMIN_PASSWORD:-}" ]]; then
    SQL_ADMIN_PASSWORD=$(openssl rand -base64 32)
    echo "   ⚠️  Generated SQL password. Save this securely:"
    echo "      SQL_ADMIN_PASSWORD=$SQL_ADMIN_PASSWORD"
  fi

  az deployment group create \
    --resource-group "$RESOURCE_GROUP" \
    --template-file infra/main.bicep \
    --parameters "$PARAM_FILE" \
    --parameters sqlAdminPassword="$SQL_ADMIN_PASSWORD" \
    --output table

  echo "✅ Infrastructure deployed."

  echo ""
  echo "📋 Deployment outputs:"
  az deployment group show \
    --resource-group "$RESOURCE_GROUP" \
    --name main \
    --query "properties.outputs" \
    --output table
}

# ── Step 2: Build and push container images ───────────────────
deploy_images() {
  echo ""
  echo "🐳 Step 2: Building and pushing container images..."

  # Create ACR if it doesn't exist
  az acr create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$ACR_NAME" \
    --sku Basic \
    --output none 2>/dev/null || true

  az acr login --name "$ACR_NAME"

  echo "   Building backend image..."
  az acr build \
    --registry "$ACR_NAME" \
    --image "backend:latest" \
    --file Dockerfile \
    .

  echo "   Building frontend image..."
  az acr build \
    --registry "$ACR_NAME" \
    --image "frontend:latest" \
    --file Dockerfile.frontend \
    .

  echo "✅ Images pushed to $ACR_NAME.azurecr.io"

  echo ""
  echo "🔄 Updating Container Apps with new images..."
  az containerapp update \
    --name "${BASE_NAME}-${ENVIRONMENT}-backend" \
    --resource-group "$RESOURCE_GROUP" \
    --image "$BACKEND_IMAGE" \
    --output none

  az containerapp update \
    --name "${BASE_NAME}-${ENVIRONMENT}-frontend" \
    --resource-group "$RESOURCE_GROUP" \
    --image "$FRONTEND_IMAGE" \
    --output none

  echo "✅ Container Apps updated."
}

# ── Step 3: Run database migrations ───────────────────────────
run_migrations() {
  echo ""
  echo "🗄️  Step 3: Running database migrations..."

  # Get connection string from Key Vault
  VAULT_NAME=$(az keyvault list --resource-group "$RESOURCE_GROUP" --query "[0].name" --output tsv)

  if [[ -z "$VAULT_NAME" ]]; then
    echo "❌ No Key Vault found in $RESOURCE_GROUP. Run 'infra' step first."
    exit 1
  fi

  DB_CONN=$(az keyvault secret show \
    --vault-name "$VAULT_NAME" \
    --name "sql-connection-string" \
    --query "value" \
    --output tsv)

  echo "   Applying migrations from src/db/migrations/..."
  for f in src/db/migrations/*.sql; do
    echo "   → $f"
    # Using sqlcmd if available, otherwise print instructions
    if command -v sqlcmd >/dev/null 2>&1; then
      # Parse host/db from connection string
      DB_HOST=$(echo "$DB_CONN" | grep -oP 'Server=\K[^;]+')
      DB_NAME=$(echo "$DB_CONN" | grep -oP 'Database=\K[^;]+')
      DB_USER=$(echo "$DB_CONN" | grep -oP 'User ID=\K[^;]+')
      DB_PASS=$(echo "$DB_CONN" | grep -oP 'Password=\K[^;]+')
      sqlcmd -S "$DB_HOST" -d "$DB_NAME" -U "$DB_USER" -P "$DB_PASS" -i "$f"
    else
      echo "   ⚠️  sqlcmd not found. Install mssql-tools or run migrations via Azure Portal."
      echo "      Migration file: $f"
    fi
  done

  echo "✅ Migrations complete."
}

# ── Step 4: Show deployment summary ───────────────────────────
show_summary() {
  echo ""
  echo "======================================================"
  echo "  ✅ Deployment Complete: $ENVIRONMENT"
  echo "======================================================"

  FRONTEND_URL=$(az containerapp show \
    --name "${BASE_NAME}-${ENVIRONMENT}-frontend" \
    --resource-group "$RESOURCE_GROUP" \
    --query "properties.configuration.ingress.fqdn" \
    --output tsv 2>/dev/null || echo "N/A")

  BACKEND_URL=$(az containerapp show \
    --name "${BASE_NAME}-${ENVIRONMENT}-backend" \
    --resource-group "$RESOURCE_GROUP" \
    --query "properties.configuration.ingress.fqdn" \
    --output tsv 2>/dev/null || echo "N/A")

  echo ""
  echo "  Frontend : https://$FRONTEND_URL"
  echo "  Backend  : https://$BACKEND_URL/health"
  echo ""
  echo "  Next steps:"
  echo "  1. Add ANTHROPIC_API_KEY to Key Vault:"
  echo "     az keyvault secret set --vault-name <vault> --name anthropic-api-key --value <key>"
  echo "  2. Configure OAuth provider redirect URIs to: https://$FRONTEND_URL"
  echo "  3. Set NEXTAUTH_URL env var on frontend container to: https://$FRONTEND_URL"
  echo "======================================================"
}

# ── Main ──────────────────────────────────────────────────────
check_prereqs

case "$COMMAND" in
  infra)
    deploy_infra
    ;;
  images)
    deploy_images
    ;;
  migrate)
    run_migrations
    ;;
  all)
    deploy_infra
    deploy_images
    run_migrations
    show_summary
    ;;
  summary)
    show_summary
    ;;
  *)
    echo "❌ Unknown command: '$COMMAND'. Use: infra | images | migrate | all | summary"
    exit 1
    ;;
esac
