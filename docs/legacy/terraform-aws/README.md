# Legacy AWS Terraform (NOT USED)

This directory is the infrastructure-as-code for the **pre-Vercel** deployment of the product, which was then called "SchedulSign": AWS Amplify (Next.js SSR), RDS PostgreSQL, Cognito (auth) with Lambda triggers, and SES (email).

**It is not the live deployment and is not applied by any workflow.** Production runs on Vercel + Neon with Auth.js and Resend — see [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md).

It is kept only as historical reference. Do not run `terraform apply` from here. Note that paths and the original deploy guide ([`DEPLOY-GUIDE.md`](DEPLOY-GUIDE.md), formerly `infrastructure/README.md`) refer to the old `infrastructure/terraform` location and are otherwise unmodified.
