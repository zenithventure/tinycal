# AWS Amplify App for Next.js
# ============================

# IAM Role for Amplify
resource "aws_iam_role" "amplify" {
  name_prefix = "${local.app_name}-amplify-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "amplify.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = {
    Name = "${local.app_name}-amplify-role"
  }
}

# Policy for Amplify to access Secrets Manager
resource "aws_iam_role_policy" "amplify_secrets" {
  name_prefix = "${local.app_name}-amplify-secrets-"
  role        = aws_iam_role.amplify.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
        ]
        Resource = [
          aws_secretsmanager_secret.db_password.arn,
          aws_secretsmanager_secret.app_secrets.arn,
        ]
      }
    ]
  })
}

# Store application secrets in Secrets Manager
resource "aws_secretsmanager_secret" "app_secrets" {
  name_prefix             = "${local.app_name}-app-secrets-"
  recovery_window_in_days = 7

  tags = {
    Name = "${local.app_name}-app-secrets"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Amplify App
resource "aws_amplify_app" "main" {
  name       = local.app_name
  repository = "https://github.com/${var.github_repository}"

  access_token = var.github_access_token

  # Build settings for Next.js with Prisma migrations
  build_spec = <<-EOT
    version: 1
    frontend:
      phases:
        preBuild:
          commands:
            - npm ci
            - npx prisma generate
            - npx prisma migrate deploy
        build:
          commands:
            - npm run build
      artifacts:
        baseDirectory: .next
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
          - .next/cache/**/*
  EOT

  # Environment variables (non-sensitive)
  # Note: NEXT_PUBLIC_APP_URL is set after app creation to avoid circular dependency
  environment_variables = {
    NEXT_PUBLIC_APP_NAME = "SchedulSign"
    NEXT_PUBLIC_APP_URL  = var.domain_name != null ? "https://${var.domain_name}" : "https://temp-placeholder.amplifyapp.com"
  }

  # Enable auto branch creation
  enable_auto_branch_creation = false
  enable_branch_auto_build    = true
  enable_branch_auto_deletion = false

  # Platform
  platform = "WEB_COMPUTE" # Required for SSR

  # IAM role
  iam_service_role_arn = aws_iam_role.amplify.arn

  # Custom rules for Next.js
  custom_rule {
    source = "/<*>"
    status = "404-200"
    target = "/index.html"
  }

  tags = {
    Name = local.app_name
  }
}

# Amplify Branch
resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.main.id
  branch_name = var.github_branch

  framework = "Next.js - SSR"
  stage     = var.environment == "prod" ? "PRODUCTION" : "DEVELOPMENT"

  enable_auto_build = true

  # Environment variables (sensitive - from Secrets Manager)
  environment_variables = {
    # Database
    DATABASE_URL = "postgresql://${local.db_username}:${random_password.db_password.result}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${local.db_name}"

    # App URL
    NEXT_PUBLIC_APP_URL = var.domain_name != null ? "https://${var.domain_name}" : "https://main.${aws_amplify_app.main.default_domain}"

    # Auth.js
    AUTH_SECRET           = "_PLACEHOLDER_MANAGED_IN_AMPLIFY_CONSOLE_"
    NEXTAUTH_URL          = var.domain_name != null ? "https://${var.domain_name}" : "https://main.${aws_amplify_app.main.default_domain}"
    GOOGLE_CLIENT_ID      = "_PLACEHOLDER_MANAGED_IN_AMPLIFY_CONSOLE_"
    GOOGLE_CLIENT_SECRET  = "_PLACEHOLDER_MANAGED_IN_AMPLIFY_CONSOLE_"

    # Stripe
    STRIPE_SECRET_KEY              = "_PLACEHOLDER_MANAGED_IN_AMPLIFY_CONSOLE_"
    STRIPE_PUBLISHABLE_KEY         = "_PLACEHOLDER_MANAGED_IN_AMPLIFY_CONSOLE_"
    STRIPE_WEBHOOK_SECRET          = "_PLACEHOLDER_MANAGED_IN_AMPLIFY_CONSOLE_"
    STRIPE_PRO_MONTHLY_PRICE_ID    = "_PLACEHOLDER_MANAGED_IN_AMPLIFY_CONSOLE_"
    STRIPE_PRO_YEARLY_PRICE_ID     = "_PLACEHOLDER_MANAGED_IN_AMPLIFY_CONSOLE_"

    # SES (Note: Cannot use AWS_ prefix in Amplify)
    SES_REGION     = var.aws_region
    SES_ACCESS_KEY = "_PLACEHOLDER_MANAGED_IN_AMPLIFY_CONSOLE_"
    SES_SECRET_KEY = "_PLACEHOLDER_MANAGED_IN_AMPLIFY_CONSOLE_"
    EMAIL_FROM     = "noreply@schedulsign.com"

    # Twilio
    TWILIO_ACCOUNT_SID  = "_PLACEHOLDER_MANAGED_IN_AMPLIFY_CONSOLE_"
    TWILIO_AUTH_TOKEN   = "_PLACEHOLDER_MANAGED_IN_AMPLIFY_CONSOLE_"
    TWILIO_PHONE_NUMBER = "_PLACEHOLDER_MANAGED_IN_AMPLIFY_CONSOLE_"

    # Zoom
    ZOOM_CLIENT_ID     = "_PLACEHOLDER_MANAGED_IN_AMPLIFY_CONSOLE_"
    ZOOM_CLIENT_SECRET = "_PLACEHOLDER_MANAGED_IN_AMPLIFY_CONSOLE_"
    ZOOM_ACCOUNT_ID    = "_PLACEHOLDER_MANAGED_IN_AMPLIFY_CONSOLE_"
  }
}

# Custom Domain (optional)
resource "aws_amplify_domain_association" "main" {
  count = var.domain_name != null ? 1 : 0

  app_id      = aws_amplify_app.main.id
  domain_name = var.domain_name

  sub_domain {
    branch_name = aws_amplify_branch.main.branch_name
    prefix      = ""
  }

  sub_domain {
    branch_name = aws_amplify_branch.main.branch_name
    prefix      = "www"
  }
}

# Outputs
output "amplify_app_id" {
  description = "Amplify App ID"
  value       = aws_amplify_app.main.id
}

output "amplify_default_domain" {
  description = "Amplify default domain"
  value       = "https://main.${aws_amplify_app.main.default_domain}"
}

output "amplify_app_url" {
  description = "Application URL"
  value       = var.domain_name != null ? "https://${var.domain_name}" : "https://main.${aws_amplify_app.main.default_domain}"
}
