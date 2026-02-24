import { NextRequest, NextResponse } from "next/server";
import { createBot } from "@/bot/bootstrap";

export const runtime = "nodejs";

type GlobalBotCache = typeof globalThis & {
  __akinatorWebhookBot?: ReturnType<typeof createBot>;
};

function getWebhookBot() {
  const globalCache = globalThis as GlobalBotCache;
  if (!globalCache.__akinatorWebhookBot) {
    globalCache.__akinatorWebhookBot = createBot();
  }

  return globalCache.__akinatorWebhookBot;
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, message: "Telegram webhook endpoint is ready." });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { bot, env } = getWebhookBot();

  if (env.webhookSecret) {
    const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token");
    if (receivedSecret !== env.webhookSecret) {
      return NextResponse.json({ ok: false, error: "Invalid webhook secret" }, { status: 401 });
    }
  }

  const update = (await request.json()) as Parameters<typeof bot.handleUpdate>[0];
  await bot.handleUpdate(update);
  return NextResponse.json({ ok: true });
}
