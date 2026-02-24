import { request } from "undici";
import { getBotEnv } from "@/bot/config/env";

async function run(): Promise<void> {
  const env = getBotEnv();

  if (!env.webhookUrl) {
    throw new Error("Missing TELEGRAM_WEBHOOK_URL in environment.");
  }

  const endpoint = `https://api.telegram.org/bot${env.token}/setWebhook`;
  const payload: Record<string, unknown> = {
    url: env.webhookUrl,
    allowed_updates: ["message", "callback_query"],
  };

  if (env.webhookSecret) {
    payload.secret_token = env.webhookSecret;
  }

  const response = await request(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.body.json()) as {
    ok: boolean;
    description?: string;
  };

  if (!data.ok) {
    throw new Error(data.description ?? "Failed to set Telegram webhook.");
  }

  console.log(`Webhook registered: ${env.webhookUrl}`);
}

void run();
