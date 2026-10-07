# AWS Amplify App for Next.js
# ============================

# IAM Role for Amplify
resource "aws_iam_role" "amplify" {
  name_prefix = "${local.app_name}-amplify-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "amplify.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      },
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name = "${local.app_name}-amplify-role"
  }
}

# Allow Amplify to assume the cross-account SES sending role
resource "aws_iam_role_policy" "amplify_ses" {
  name = "assume-ses-sending-role"
  role = aws_iam_role.amplify.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "sts:AssumeRole"
      Resource = "arn:aws:iam::346871995105:role/OrganizationSESSendingRole"
    }]
  })
}

# Amplify App
resource "aws_amplify_app" "main" {
  name       = local.app_name
  repository = "https://github.com/${var.github_repository}"

  access_token = var.github_access_token

  build_spec = <<-EOT
    version: 1
    frontend:
      phases:
        preBuild:
          commands:
            - npm ci
            - npx prisma generate
            - env | grep -E '^(DATABASE_URL|AUTH_SECRET|AUTH_TRUST_HOST|AUTH_URL|NEXTAUTH_URL|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|EMAIL_SENDER_|STRIPE_|NEXT_PUBLIC_)' > .env.production
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

  environment_variables = {
    NEXT_PUBLIC_APP_NAME = "SchedulSign"
    NEXT_PUBLIC_APP_URL  = var.domain_name != null ? "https://${var.domain_name}" : "https://temp-placeholder.amplifyapp.com"
  }

  enable_auto_branch_creation = false
  enable_branch_auto_build    = true
  enable_branch_auto_deletion = false

  platform = "WEB_COMPUTE"

  iam_service_role_arn = aws_iam_role.amplify.arn

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

  environment_variables = {
    # Database (Neon)
    DATABASE_URL = var.database_url

    # App URL
    NEXT_PUBLIC_APP_URL = var.domain_name != null ? "https://${var.domain_name}" : "https://main.${aws_amplify_app.main.default_domain}"

    # Auth.js
    AUTH_SECRET          = var.auth_secret
    AUTH_TRUST_HOST      = "true"
    AUTH_URL             = var.domain_name != null ? "https://${var.domain_name}" : "https://main.${aws_amplify_app.main.default_domain}"
    NEXTAUTH_URL         = var.domain_name != null ? "https://${var.domain_name}" : "https://main.${aws_amplify_app.main.default_domain}"
    GOOGLE_CLIENT_ID     = var.google_oauth_client_id
    GOOGLE_CLIENT_SECRET = var.google_oauth_client_secret

    # Stripe
    STRIPE_SECRET_KEY           = "_PLACEHOLDER_MANAGED_IN_AMPLIFY_CONSOLE_"
    STRIPE_PUBLISHABLE_KEY      = "_PLACEHOLDER_MANAGED_IN_AMPLIFY_CONSOLE_"
    STRIPE_WEBHOOK_SECRET       = "_PLACEHOLDER_MANAGED_IN_AMPLIFY_CONSOLE_"
    STRIPE_PRO_MONTHLY_PRICE_ID = "_PLACEHOLDER_MANAGED_IN_AMPLIFY_CONSOLE_"
    STRIPE_PRO_YEARLY_PRICE_ID  = "_PLACEHOLDER_MANAGED_IN_AMPLIFY_CONSOLE_"

    # Email sender Lambda (via API Gateway)
    EMAIL_SENDER_URL     = aws_apigatewayv2_stage.email_sender.invoke_url
    EMAIL_SENDER_API_KEY = random_password.email_api_key.result

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
