import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const SES_ROLE_ARN = process.env.SES_ROLE_ARN;
const SES_REGION = process.env.SES_REGION || "us-east-1";
const EMAIL_FROM = process.env.EMAIL_FROM || "noreply@schedulsign.com";
const APP_NAME = process.env.APP_NAME || "SchedulSign";
const API_KEY = process.env.API_KEY;

async function getSESClient() {
  const sts = new STSClient({ region: SES_REGION });
  const { Credentials } = await sts.send(
    new AssumeRoleCommand({
      RoleArn: SES_ROLE_ARN,
      RoleSessionName: "schedulsign-email-sender",
    })
  );

  return new SESClient({
    region: SES_REGION,
    credentials: {
      accessKeyId: Credentials.AccessKeyId,
      secretAccessKey: Credentials.SecretAccessKey,
      sessionToken: Credentials.SessionToken,
    },
  });
}

export const handler = async (event) => {
  // Verify API key
  const authHeader = event.headers?.["x-api-key"] || event.headers?.["X-Api-Key"];
  if (API_KEY && authHeader !== API_KEY) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }

  let rawBody = event.body || "{}";
  if (event.isBase64Encoded && typeof rawBody === "string") {
    rawBody = Buffer.from(rawBody, "base64").toString("utf-8");
  }
  let body;
  try {
    body = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }
  const { to, subject, html } = body;

  if (!to || !subject || !html) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing to, subject, or html" }) };
  }

  try {
    const ses = await getSESClient();
    await ses.send(
      new SendEmailCommand({
        Source: `${APP_NAME} <${EMAIL_FROM}>`,
        Destination: { ToAddresses: Array.isArray(to) ? to : [to] },
        Message: {
          Subject: { Data: subject },
          Body: { Html: { Data: html } },
        },
      })
    );

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (error) {
    console.error("Email send error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
