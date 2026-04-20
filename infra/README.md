# Florida Annual Report - Azure Infrastructure

This directory contains Bicep templates for deploying all required Azure resources for the Florida Annual Report platform.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Azure Resource Group                            │
│                                                                              │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐       │
│  │   Key Vault      │    │   SQL Database   │    │  BLOB Storage    │       │
│  │  (Secrets)       │    │  (Primary Data)  │    │  (Documents)     │       │
│  └────────┬─────────┘    └──────────────────┘    └──────────────────┘       │
│           │                                                                  │
│           │              ┌──────────────────┐                                │
│           │              │    CosmosDB      │                                │
│           │              │  (Processed Docs)│                                │
│           │              └──────────────────┘                                │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Container Apps Environment                        │    │
│  │  ┌─────────────────────────┐    ┌─────────────────────────┐         │    │
│  │  │   Backend Container     │    │   Frontend Container    │         │    │
│  │  │   (API + Playwright)    │◄───│   (Next.js)             │         │    │
│  │  └─────────────────────────┘    └─────────────────────────┘         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Resources Provisioned

| Resource | Purpose | Security |
|----------|---------|----------|
| **Azure Key Vault** | Store all secrets (DB passwords, API keys, connection strings) | RBAC, soft delete |
| **Azure SQL Database** | Primary data store (companies, filings, officers, submissions, audit_logs) | TLS 1.2+, TDE (AES-256) |
| **Azure BLOB Storage** | Raw documents, receipts, screenshots | Private containers, SAS tokens |
| **Azure CosmosDB** | Processed Markdown documents | TLS 1.2+, encryption at rest |
| **Azure Container Apps** | Backend API + Frontend (Next.js) | Managed identity, auto-scaling |
| **Log Analytics** | Centralized logging for Container Apps | 90-day retention (prod) |

## Prerequisites

1. **Azure CLI** (v2.50+) installed and configured
   ```bash
   az --version
   az login
   ```

2. **Bicep CLI** (included with Azure CLI 2.20+)
   ```bash
   az bicep version
   az bicep upgrade  # If needed
   ```

3. **Azure Subscription** with appropriate permissions
   - Contributor role on the resource group
   - Key Vault Administrator role (for secrets management)

## Directory Structure

```
infra/
├── main.bicep              # Main orchestration template
├── modules/
│   ├── keyvault.bicep      # Key Vault for secrets
│   ├── sql.bicep           # Azure SQL Database
│   ├── storage.bicep       # BLOB Storage
│   ├── cosmos.bicep        # CosmosDB
│   └── container-apps.bicep # Container Apps Environment + Apps
├── parameters/
│   ├── dev.bicepparam      # Development environment
│   ├── staging.bicepparam  # Staging environment
│   └── prod.bicepparam     # Production environment
└── README.md               # This file
```

## Deployment

### Step 1: Create Resource Group

```bash
# Set variables
ENVIRONMENT="dev"  # or "staging" or "prod"
LOCATION="eastus"
RESOURCE_GROUP="rg-florida-annual-report-${ENVIRONMENT}"

# Create resource group
az group create --name $RESOURCE_GROUP --location $LOCATION
```

### Step 2: Generate Secure Password

```bash
# Generate a secure SQL admin password (store this securely!)
SQL_PASSWORD=$(openssl rand -base64 32)
echo "Save this password securely: $SQL_PASSWORD"
```

### Step 3: Deploy Infrastructure

```bash
# Deploy using the appropriate parameter file
az deployment group create \
  --resource-group $RESOURCE_GROUP \
  --template-file infra/main.bicep \
  --parameters infra/parameters/${ENVIRONMENT}.bicepparam \
  --parameters sqlAdminPassword="$SQL_PASSWORD"
```

### Step 4: Verify Deployment

```bash
# List deployed resources
az resource list --resource-group $RESOURCE_GROUP --output table

# Get deployment outputs
az deployment group show \
  --resource-group $RESOURCE_GROUP \
  --name main \
  --query properties.outputs
```

## Environment Configuration

### Development (`dev`)
- Cost-optimized with minimal resources
- Basic SQL tier, LRS storage
- CosmosDB free tier enabled
- Container Apps scale to zero
- 7-day soft delete retention

### Staging (`staging`)
- Similar to production but lower capacity
- Standard SQL tier, LRS storage
- Moderate auto-scaling limits
- Used for pre-production testing

### Production (`prod`)
- High availability configuration
- Standard S2 SQL tier with zone redundancy
- GRS storage for geo-redundancy
- CosmosDB with zone redundancy
- Minimum 2 replicas for Container Apps
- 90-day soft delete and backup retention
- Purge protection enabled on Key Vault

## Secrets Management

All secrets are stored in Azure Key Vault. The following secrets are automatically created:

| Secret Name | Description |
|-------------|-------------|
| `sql-connection-string` | Full SQL Server connection string |
| `sql-admin-password` | SQL administrator password |
| `storage-connection-string` | BLOB Storage connection string |
| `cosmos-connection-string` | CosmosDB connection string |

### Accessing Secrets in Applications

Container Apps are configured with managed identity. Use the Azure SDK to retrieve secrets:

```typescript
import { SecretClient } from "@azure/keyvault-secrets";
import { DefaultAzureCredential } from "@azure/identity";

const credential = new DefaultAzureCredential();
const client = new SecretClient(process.env.AZURE_KEYVAULT_URI, credential);

const secret = await client.getSecret("sql-connection-string");
```

## Updating Container Images

After building and pushing your container images to Azure Container Registry:

```bash
# Update backend image
az containerapp update \
  --name ca-backend-flar-${ENVIRONMENT} \
  --resource-group $RESOURCE_GROUP \
  --image your-acr.azurecr.io/backend:latest

# Update frontend image
az containerapp update \
  --name ca-frontend-flar-${ENVIRONMENT} \
  --resource-group $RESOURCE_GROUP \
  --image your-acr.azurecr.io/frontend:latest
```

## Monitoring & Troubleshooting

### View Container App Logs

```bash
# Backend logs
az containerapp logs show \
  --name ca-backend-flar-${ENVIRONMENT} \
  --resource-group $RESOURCE_GROUP \
  --follow

# Frontend logs
az containerapp logs show \
  --name ca-frontend-flar-${ENVIRONMENT} \
  --resource-group $RESOURCE_GROUP \
  --follow
```

### Check Resource Health

```bash
# SQL Database
az sql db show \
  --resource-group $RESOURCE_GROUP \
  --server sql-flar-${ENVIRONMENT} \
  --name sqldb-flar-${ENVIRONMENT}

# Storage Account
az storage account show \
  --resource-group $RESOURCE_GROUP \
  --name stflar${ENVIRONMENT}
```

## Cleanup

⚠️ **Warning:** This will delete all resources and data!

```bash
# Delete resource group (includes all resources)
az group delete --name $RESOURCE_GROUP --yes --no-wait
```

## Security Compliance

This infrastructure follows security requirements from `docs/reference/risk-compliance.md`:

- ✅ **AES-256 encryption at rest** - SQL TDE, Storage encryption, CosmosDB encryption
- ✅ **TLS 1.2+ in transit** - Enforced on all services
- ✅ **Private BLOB containers** - No public access, SAS tokens for access
- ✅ **RBAC access control** - Key Vault uses RBAC authorization
- ✅ **Secrets in Key Vault** - No hardcoded secrets in templates
- ✅ **Audit logging** - SQL auditing enabled in production
- ✅ **Backup and recovery** - Soft delete, geo-redundant backups in production

## CI/CD Integration

For GitHub Actions or Azure DevOps integration, use a service principal:

```bash
# Create service principal for CI/CD
az ad sp create-for-rbac \
  --name "sp-florida-annual-report-cicd" \
  --role contributor \
  --scopes /subscriptions/{subscription-id}/resourceGroups/$RESOURCE_GROUP \
  --sdk-auth
```

Store the output JSON as a GitHub secret (`AZURE_CREDENTIALS`) for use in workflows.
