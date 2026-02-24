import { Telegraf } from "telegraf";
import { getBotEnv } from "@/bot/config/env";
import { AqulAkinatorEngine } from "@/bot/infrastructure/akinator/aqul-akinator.engine";
import { MongoGameSessionStore } from "@/bot/infrastructure/persistence/mongo-game-session.store";
import { AkinatorGameService } from "@/bot/application/services/akinator-game.service";
import { registerHandlers } from "@/bot/interfaces/telegram/handlers";

export function createBot() {
  const env = getBotEnv();
  const bot = new Telegraf(env.token);

  const sessionStore = new MongoGameSessionStore({
    uri: env.mongoUri,
    dbName: env.mongoDbName,
  });

  const engine = new AqulAkinatorEngine({
    region: env.region,
    childMode: env.childMode,
    sessionStore,
    pythonBin: env.pythonBin,
    bridgeUrl: env.bridgeUrl,
  });

  const gameService = new AkinatorGameService(engine);
  registerHandlers(bot, gameService, {
    translateToAmharic: env.translateToAmharic,
  });

  bot.catch((error, ctx) => {
    console.error("Unhandled bot error", {
      updateId: ctx.update.update_id,
      error,
    });
  });

  return { bot, env };
}
