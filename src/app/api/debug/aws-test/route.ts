import { NextResponse } from "next/server"
import { STSClient, GetCallerIdentityCommand, AssumeRoleCommand } from "@aws-sdk/client-sts"

export const dynamic = "force-dynamic"

export async function GET() {
  const results: Record<string, any> = {}
  const region = process.env.SES_REGION || "us-east-1"

  // 1. Check what AWS credentials are available
  results.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID ? "SET" : "NOT SET"
  results.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY ? "SET" : "NOT SET"
  results.AWS_SESSION_TOKEN = process.env.AWS_SESSION_TOKEN ? "SET" : "NOT SET"
  results.AWS_REGION = process.env.AWS_REGION ?? "NOT SET"
  results.AWS_EXECUTION_ENV = process.env.AWS_EXECUTION_ENV ?? "NOT SET"
  results.AWS_LAMBDA_FUNCTION_NAME = process.env.AWS_LAMBDA_FUNCTION_NAME ?? "NOT SET"

  // 2. Try GetCallerIdentity to see who we are
  try {
    const sts = new STSClient({ region })
    const identity = await sts.send(new GetCallerIdentityCommand({}))
    results.callerIdentity = {
      account: identity.Account,
      arn: identity.Arn,
      userId: identity.UserId,
    }
  } catch (error: any) {
    results.callerIdentity = `ERROR: ${error.message}`
  }

  // 3. Try assuming the SES role
  try {
    const sts = new STSClient({ region })
    const assumed = await sts.send(new AssumeRoleCommand({
      RoleArn: "arn:aws:iam::346871995105:role/OrganizationSESSendingRole",
      RoleSessionName: "schedulsign-ses-test",
    }))
    results.assumeRole = assumed.Credentials?.AccessKeyId ? "SUCCESS" : "FAILED: no credentials"
  } catch (error: any) {
    results.assumeRole = `ERROR: ${error.message}`
  }

  return NextResponse.json(results)
}
