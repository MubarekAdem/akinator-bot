import { type Context, type Telegraf } from "telegraf";
import type { CallbackQuery, Message } from "telegraf/types";
import type { AkinatorGameService } from "@/bot/application/services/akinator-game.service";
import { decodeAction } from "@/bot/interfaces/telegram/callback-data";
import { gameKeyboard, themeKeyboard, winKeyboard } from "@/bot/interfaces/telegram/keyboards";
import type { GameState, ThemeId } from "@/bot/domain/game";

const selectedThemeByChat = new Map<number, ThemeId>();

function getChatIdFromCallback(callbackQuery: CallbackQuery): number | null {
  if (!("message" in callbackQuery) || !callbackQuery.message) {
    return null;
  }

  const callbackMessage = callbackQuery.message;
  if (!("chat" in callbackMessage) || !callbackMessage.chat) {
    return null;
  }

  return callbackMessage.chat.id;
}

function questionText(state: Extract<GameState, { isWin: false }>): string {
  return `🤔 ${state.question.text}\n\nProgress: ${state.question.progress.toFixed(1)}%`;
}

function guessText(state: Extract<GameState, { isWin: true }>): string {
  return `🎯 I guess: *${state.guess.name}*\n\n${state.guess.description}`;
}

async function askTheme(ctx: Context): Promise<void> {
  await ctx.reply("Choose a game theme before we start:", {
    ...themeKeyboard(),
  });
}

function promptByTheme(theme: ThemeId): string {
  if (theme === "animals") {
    return "Think of an animal. I will try to guess it.";
  }

  if (theme === "objects") {
    return "Think of an object. I will try to guess it.";
  }

  return "Think of a real or fictional character. I will try to guess it.";
}

async function renderState(ctx: Context, state: GameState) {
  if (!state.isWin) {
    await ctx.reply(questionText(state), {
      ...gameKeyboard(),
    });
    return;
  }

  if (state.guess.photoUrl) {
    await ctx.replyWithPhoto(state.guess.photoUrl, {
      caption: guessText(state),
      parse_mode: "Markdown",
      ...winKeyboard(),
    });
    return;
  }

  await ctx.reply(guessText(state), {
    parse_mode: "Markdown",
    ...winKeyboard(),
  });
}

async function renderStateInCallback(
  ctx: Context,
  state: GameState,
) {
  if (!state.isWin) {
    await ctx.editMessageText(questionText(state), {
      ...gameKeyboard(),
    });
    return;
  }

  const message = guessText(state);
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...winKeyboard(),
  });

  if (state.guess.photoUrl) {
    await ctx.replyWithPhoto(state.guess.photoUrl, {
      caption: message,
      parse_mode: "Markdown",
      ...winKeyboard(),
    });
  }
}

function isTextMessage(msg: unknown): msg is Message.TextMessage {
  return typeof msg === "object" && msg !== null && "text" in msg;
}

function isCloudflareBlockError(error: unknown): boolean {
  return error instanceof Error && error.message === "AKINATOR_CLOUDFLARE_BLOCK";
}

function conciseError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function registerHandlers(bot: Telegraf, gameService: AkinatorGameService): void {
  bot.start(async (ctx) => {
    try {
      selectedThemeByChat.delete(ctx.chat.id);
      await askTheme(ctx);
    } catch (error) {
      console.error("Failed to handle /start", conciseError(error));
      if (isCloudflareBlockError(error)) {
        await ctx.reply("Akinator blocked this server IP (Cloudflare 403). Run the bot from a different server/network.");
        return;
      }

      await ctx.reply(
        "Akinator service is unavailable right now (blocked or unreachable). Please try again later or run from another network/server.",
      );
    }
  });

  bot.command("new", async (ctx) => {
    try {
      selectedThemeByChat.delete(ctx.chat.id);
      await askTheme(ctx);
    } catch (error) {
      console.error("Failed to handle /new", conciseError(error));
      if (isCloudflareBlockError(error)) {
        await ctx.reply("Akinator blocked this server IP (Cloudflare 403). Run the bot from a different server/network.");
        return;
      }

      await ctx.reply(
        "Cannot start a new game right now because Akinator is blocked or unreachable.",
      );
    }
  });

  bot.on("callback_query", async (ctx) => {
    const callbackData = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;
    const action = decodeAction(callbackData);

    if (!action) {
      await ctx.answerCbQuery("Unknown action.");
      return;
    }

    const chatId = getChatIdFromCallback(ctx.callbackQuery);
    if (!chatId) {
      await ctx.answerCbQuery("Unable to detect chat.");
      return;
    }

    try {
      if (action.type === "theme") {
        selectedThemeByChat.set(chatId, action.theme);
        const state = await gameService.start(chatId, action.theme);
        await ctx.editMessageText(promptByTheme(action.theme));
        await renderState(ctx, state);
        await ctx.answerCbQuery(`Theme selected: ${action.theme}`);
        return;
      }

      if (!selectedThemeByChat.has(chatId)) {
        await ctx.answerCbQuery("Pick a theme first.");
        await ctx.reply("Choose a game theme to start:", {
          ...themeKeyboard(),
        });
        return;
      }

      const state =
        action.type === "answer"
          ? await gameService.answer(chatId, action.answer)
          : action.type === "back"
            ? await gameService.back(chatId)
            : await gameService.restartWithTheme(chatId, selectedThemeByChat.get(chatId) ?? "characters");

      await renderStateInCallback(ctx, state);
      await ctx.answerCbQuery();
    } catch (error) {
      console.error("Failed to handle callback query", conciseError(error));

      if (isCloudflareBlockError(error)) {
        await ctx.answerCbQuery("Akinator blocked this server IP.");
        await ctx.reply("Akinator blocked this server IP (Cloudflare 403). Run the bot from a different server/network.");
        return;
      }

      await ctx.answerCbQuery("Something went wrong. Use /new to try again.");
    }
  });

  bot.on("text", async (ctx) => {
    if (!isTextMessage(ctx.message)) {
      return;
    }

    if (!selectedThemeByChat.has(ctx.chat.id)) {
      await ctx.reply("Use /start and choose a theme first.");
      return;
    }

    if (ctx.message.text.startsWith("/")) {
      return;
    }

    await ctx.reply("Use /start to begin, then answer using the buttons.");
  });
}
