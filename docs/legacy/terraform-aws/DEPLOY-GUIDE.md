# SchedulSign AWS Infrastructure

Infrastructure-as-Code for deploying SchedulSign to AWS using Amplify + RDS.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ AWS Account (Dev/QA/Prod)                                   │
│                                                              │
│  ┌──────────────────┐          ┌──────────────────┐        │
│  │  AWS Amplify     │          │   RDS PostgreSQL │        │
│  │  (Next.js SSR)   │──────────│   (Private VPC)  │        │
│  │  - SSR + API     │          │   - Multi-AZ      │        │
│  │  - Auto-scaling  │          │   - Encrypted     │        │
│  └──────────────────┘          └──────────────────┘        │
│           │                                                  │
│           │                                                  │
│  ┌────────▼────────────────────────────────────────┐        │
│  │  Secrets Manager                                │        │
│  │  - DB credentials                               │        │
│  │  - API keys (Stripe, Google, etc.)             │        │
│  └─────────────────────────────────────────────────┘        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

1. **AWS Accounts** - Create SchedulSign accounts in aws-organization:
   ```bash
   # In aws-organization repo, create:
   # - SchedulSign-Dev   (create account via Control Tower)
   # - SchedulSign-QA    (create account via Control Tower)
   # - SchedulSign-Prod  (create account via Control Tower)
   ```

2. **GitHub Personal Access Token**:
   - Go to https://github.com/settings/tokens
   - Create token with scopes: `repo`, `admin:repo_hook`
   - Save securely for terraform.tfvars

3. **Terraform** - Install from https://www.terraform.io/downloads

4. **AWS CLI** - Configured with SSO to access accounts

## Deployment

### 1. Deploy Infrastructure (Per Environment)

```bash
cd infrastructure/terraform

# Copy variables file
cp terraform.tfvars.example terraform.tfvars

# Edit terraform.tfvars with your values
# - environment: dev/qa/prod
# - github_access_token: from GitHub
# - domain_name: (optional, for prod)

# Login to target AWS account
aws sso login --profile schedulsign-dev   # or -qa, -prod

# Initialize Terraform
terraform init

# Review changes
terraform plan

# Deploy
terraform apply
```

### 2. Configure Secrets in Amplify Console

Terraform sets placeholder values for sensitive secrets. Update them in the Amplify Console:

1. Go to AWS Console → Amplify → schedulsign
2. Click "Environment variables"
3. Update these with real values:
   - `NEXTAUTH_SECRET` - Generate with: `openssl rand -base64 32`
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
   - `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`
   - `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_PRO_MONTHLY_PRICE_ID` / `STRIPE_PRO_YEARLY_PRICE_ID`
   - `AWS_SES_ACCESS_KEY` / `AWS_SES_SECRET_KEY`
   - `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER`
   - `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` / `ZOOM_ACCOUNT_ID`

4. Trigger a new build to apply changes

### 3. Run Database Migrations

After first deployment:

```bash
# Get the database URL from Terraform output
DATABASE_URL=$(terraform output -raw database_url)

# Run Prisma migrations locally against the RDS instance
# (Ensure you're connected to VPN/Bastion if RDS is private)
export DATABASE_URL
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate
```

### 4. Set Up Custom Domain (Prod Only)

If using a custom domain:

1. Create ACM certificate in us-east-1 for your domain
2. Update `terraform.tfvars`:
   ```hcl
   domain_name = "app.schedulsign.com"
   ```
3. Run `terraform apply`
4. Add DNS records from Amplify console to your DNS provider

## Account IDs

Update these in the GitHub Actions workflow after creating accounts:

| Environment | Account ID | Email |
|-------------|------------|-------|
| SchedulSign-Dev  | TBD | szewong+aws-ss-dev@zenithstudio.io |
| SchedulSign-QA   | TBD | szewong+aws-ss-qa@zenithstudio.io |
| SchedulSign-Prod | TBD | szewong+aws-ss-prod@zenithstudio.io |

## Environment-Specific Configuration

### Dev
- Small RDS instance (db.t4g.micro)
- Short backup retention (1 day)
- No deletion protection
- Auto-deploy on push to main

### QA
- Medium RDS instance (db.t4g.small)
- Moderate backup retention (3 days)
- Deploy on tag: v1.2.3-qa

### Prod
- Larger RDS instance (db.t4g.medium)
- Long backup retention (7 days)
- Deletion protection enabled
- Multi-AZ for RDS
- Deploy on tag: v1.2.3 (requires approval)
- Custom domain

## Monitoring

### Amplify Monitoring
- Go to Amplify Console → schedulsign → Monitoring
- View build/deployment logs
- Track response times, errors

### RDS Monitoring
- CloudWatch metrics for CPU, memory, connections
- Enhanced monitoring for detailed instance metrics
- Performance Insights for query analysis

### Costs

Estimated monthly costs per environment:

| Resource | Dev | QA | Prod |
|----------|-----|-----|------|
| Amplify (build + hosting) | ~$5-10 | ~$10-20 | ~$20-50 |
| RDS (db.t4g.micro/small) | ~$15 | ~$30 | ~$60+ |
| NAT Gateway (2 AZs) | ~$65 | ~$65 | ~$65 |
| **Total** | **~$85** | **~$105** | **~$145+** |

## Troubleshooting

### Amplify Build Fails
```bash
# Check build logs in Amplify Console
# Common issues:
# - Missing environment variables
# - Prisma client generation fails → ensure DATABASE_URL is set
# - Next.js build errors → test locally first
```

### Database Connection Issues
```bash
# Verify RDS security group allows connections from Amplify
# Check if DATABASE_URL format is correct:
# postgresql://username:password@host:5432/dbname

# Test connection from local machine (if using bastion/VPN):
psql "$DATABASE_URL"
```

### Secrets Not Applied
```bash
# After updating secrets in Amplify Console, trigger new deployment:
aws amplify start-job \
  --app-id $(terraform output -raw amplify_app_id) \
  --branch-name main \
  --job-type RELEASE
```

## Cleanup

To destroy infrastructure (be careful in prod!):

```bash
cd infrastructure/terraform

# Destroy all resources
terraform destroy

# Note: RDS final snapshot will be created in prod (deletion_protection)
```

## Next Steps

1. Create SchedulSign OU in aws-organization
2. Provision Dev/QA/Prod accounts via Control Tower
3. Set up GitHub OIDC role (for future CI/CD improvements)
4. Deploy infrastructure to Dev account first
5. Test thoroughly before QA/Prod
6. Set up monitoring alerts (CloudWatch + SNS)
7. Configure backup policies
8. Set up WAF rules for Amplify (prod)
