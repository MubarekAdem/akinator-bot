import { createBot } from "@/bot/bootstrap";

async function bootstrap(): Promise<void> {
  const { bot } = createBot();

  await bot.launch();
  console.log("Akinator Telegram bot is running.");

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

void bootstrap();
