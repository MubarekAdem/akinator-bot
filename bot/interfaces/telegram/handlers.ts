import { type Context, type Telegraf } from "telegraf";
import type { CallbackQuery, Message } from "telegraf/types";
import type { AkinatorGameService } from "@/bot/application/services/akinator-game.service";
import { type BotLanguage, decodeAction } from "@/bot/interfaces/telegram/callback-data";
import { gameKeyboard, languageKeyboard, themeKeyboard, winKeyboard } from "@/bot/interfaces/telegram/keyboards";
import { translateToAmharic } from "@/bot/interfaces/telegram/translation";
import type { GameState, ThemeId } from "@/bot/domain/game";

const selectedThemeByChat = new Map<number, ThemeId>();
const selectedLanguageByChat = new Map<number, BotLanguage>();

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

type HandlerOptions = {
  translateToAmharic?: boolean;
};

function isAmharic(options?: HandlerOptions): boolean {
  return Boolean(options?.translateToAmharic);
}

function localize(en: string, am: string, options?: HandlerOptions): string {
  return isAmharic(options) ? am : en;
}

function chatOptions(chatId: number, options?: HandlerOptions): HandlerOptions {
  const selectedLanguage = selectedLanguageByChat.get(chatId);
  if (selectedLanguage === "am") {
    return { translateToAmharic: true };
  }

  if (selectedLanguage === "en") {
    return { translateToAmharic: false };
  }

  return options;
}

async function askLanguage(ctx: Context): Promise<void> {
  await ctx.reply("Choose your language / ቋንቋዎን ይምረጡ:", {
    ...languageKeyboard(),
  });
}

async function questionText(
  state: Extract<GameState, { isWin: false }>,
  options?: HandlerOptions,
): Promise<string> {
  const translatedQuestion = await translateToAmharic(
    state.question.text,
    Boolean(options?.translateToAmharic),
  );

  const progressLabel = options?.translateToAmharic ? "እድገት" : "Progress";
  return `🤔 ${translatedQuestion}\n\n${progressLabel}: ${state.question.progress.toFixed(1)}%`;
}

function guessText(state: Extract<GameState, { isWin: true }>, options?: HandlerOptions): string {
  const guessLabel = localize("I guess", "ግምቴ", options);
  return `🎯 ${guessLabel}: *${state.guess.name}*\n\n${state.guess.description}`;
}

async function askTheme(ctx: Context, options?: HandlerOptions): Promise<void> {
  await ctx.reply(localize("Choose a game theme before we start:", "ከመጀመር በፊት የጨዋታ አይነት ይምረጡ:", options), {
    ...themeKeyboard(options),
  });
}

function promptByTheme(theme: ThemeId, options?: HandlerOptions): string {
  if (theme === "animals") {
    return localize("Think of an animal. I will try to guess it.", "አንድ እንስሳ ያስቡ። ልገምተው እሞክራለሁ።", options);
  }

  if (theme === "objects") {
    return localize("Think of an object. I will try to guess it.", "አንድ እቃ ያስቡ። ልገምተው እሞክራለሁ።", options);
  }

  return localize(
    "Think of a real or fictional character. I will try to guess it.",
    "እውነተኛ ወይም ምናባዊ ባህሪ ያስቡ። ልገምተው እሞክራለሁ።",
    options,
  );
}

async function renderState(ctx: Context, state: GameState, options?: HandlerOptions) {
  if (!state.isWin) {
    await ctx.reply(await questionText(state, options), {
      ...gameKeyboard(options),
    });
    return;
  }

  if (state.guess.photoUrl) {
    await ctx.replyWithPhoto(state.guess.photoUrl, {
      caption: guessText(state, options),
      parse_mode: "Markdown",
      ...winKeyboard(options),
    });
    return;
  }

  await ctx.reply(guessText(state, options), {
    parse_mode: "Markdown",
    ...winKeyboard(options),
  });
}

async function renderStateInCallback(
  ctx: Context,
  state: GameState,
  options?: HandlerOptions,
) {
  if (!state.isWin) {
    await ctx.editMessageText(await questionText(state, options), {
      ...gameKeyboard(options),
    });
    return;
  }

  const message = guessText(state, options);
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...winKeyboard(options),
  });

  if (state.guess.photoUrl) {
    await ctx.replyWithPhoto(state.guess.photoUrl, {
      caption: message,
      parse_mode: "Markdown",
      ...winKeyboard(options),
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

export function registerHandlers(
  bot: Telegraf,
  gameService: AkinatorGameService,
  options?: HandlerOptions,
): void {
  bot.start(async (ctx) => {
    try {
      selectedThemeByChat.delete(ctx.chat.id);
      selectedLanguageByChat.delete(ctx.chat.id);
      await askLanguage(ctx);
    } catch (error) {
      console.error("Failed to handle /start", conciseError(error));
      if (isCloudflareBlockError(error)) {
        await ctx.reply(localize(
          "Akinator blocked this server IP (Cloudflare 403). Run the bot from a different server/network.",
          "Akinator ይህን የሰርቨር IP አግዷል (Cloudflare 403)። ቦቱን ከሌላ ኔትወርክ/ሰርቨር ያስኪዱ።",
          options,
        ));
        return;
      }

      await ctx.reply(localize(
        "Akinator service is unavailable right now (blocked or unreachable). Please try again later or run from another network/server.",
        "የAkinator አገልግሎት አሁን አይገኝም (ታግዷል ወይም መድረስ አይቻልም)። እባክዎ በኋላ ይሞክሩ ወይም ከሌላ ኔትወርክ/ሰርቨር ያስኪዱ።",
        options,
      ));
    }
  });

  bot.command("new", async (ctx) => {
    try {
      selectedThemeByChat.delete(ctx.chat.id);
      selectedLanguageByChat.delete(ctx.chat.id);
      await askLanguage(ctx);
    } catch (error) {
      console.error("Failed to handle /new", conciseError(error));
      if (isCloudflareBlockError(error)) {
        await ctx.reply(localize(
          "Akinator blocked this server IP (Cloudflare 403). Run the bot from a different server/network.",
          "Akinator ይህን የሰርቨር IP አግዷል (Cloudflare 403)። ቦቱን ከሌላ ኔትወርክ/ሰርቨር ያስኪዱ።",
          options,
        ));
        return;
      }

      await ctx.reply(localize(
        "Cannot start a new game right now because Akinator is blocked or unreachable.",
        "Akinator ታግዷል ወይም መድረስ ስለማይቻል አዲስ ጨዋታ አሁን መጀመር አይቻልም።",
        options,
      ));
    }
  });

  bot.on("callback_query", async (ctx) => {
    const callbackData = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;
    const action = decodeAction(callbackData);

    if (!action) {
      await ctx.answerCbQuery(localize("Unknown action.", "ያልታወቀ እርምጃ።", options));
      return;
    }

    const chatId = getChatIdFromCallback(ctx.callbackQuery);
    if (!chatId) {
      await ctx.answerCbQuery(localize("Unable to detect chat.", "ቻት መለየት አልተቻለም።", options));
      return;
    }

    try {
      const currentOptions = chatOptions(chatId, options);

      if (action.type === "language") {
        selectedLanguageByChat.set(chatId, action.language);
        const nextOptions = chatOptions(chatId, options);
        await ctx.editMessageText(localize("Language selected.", "ቋንቋ ተመርጧል።", nextOptions));
        await askTheme(ctx, nextOptions);
        await ctx.answerCbQuery(localize("Language selected", "ቋንቋ ተመርጧል", nextOptions));
        return;
      }

      if (!selectedLanguageByChat.has(chatId)) {
        await ctx.answerCbQuery("Choose language first.");
        await askLanguage(ctx);
        return;
      }

      if (action.type === "theme") {
        selectedThemeByChat.set(chatId, action.theme);
        const state = await gameService.start(chatId, action.theme);
        await ctx.editMessageText(promptByTheme(action.theme, currentOptions));
        await renderStateInCallback(ctx, state, currentOptions);
        await ctx.answerCbQuery(
          localize(`Theme selected: ${action.theme}`, `አይነት ተመርጧል: ${action.theme}`, currentOptions),
        );
        return;
      }

      if (!selectedThemeByChat.has(chatId)) {
        await ctx.answerCbQuery(localize("Pick a theme first.", "መጀመሪያ አንድ አይነት ይምረጡ።", currentOptions));
        await ctx.reply(localize("Choose a game theme to start:", "ለመጀመር የጨዋታ አይነት ይምረጡ:", currentOptions), {
          ...themeKeyboard(currentOptions),
        });
        return;
      }

      const state =
        action.type === "answer"
          ? await gameService.answer(chatId, action.answer)
          : action.type === "back"
            ? await gameService.back(chatId)
            : await gameService.restartWithTheme(chatId, selectedThemeByChat.get(chatId) ?? "characters");

      await renderStateInCallback(ctx, state, currentOptions);
      await ctx.answerCbQuery();
    } catch (error) {
      console.error("Failed to handle callback query", conciseError(error));

      const currentOptions = chatOptions(chatId, options);

      if (isCloudflareBlockError(error)) {
        await ctx.answerCbQuery(localize("Akinator blocked this server IP.", "Akinator ይህን የሰርቨር IP አግዷል።", currentOptions));
        await ctx.reply(localize(
          "Akinator blocked this server IP (Cloudflare 403). Run the bot from a different server/network.",
          "Akinator ይህን የሰርቨር IP አግዷል (Cloudflare 403)። ቦቱን ከሌላ ኔትወርክ/ሰርቨር ያስኪዱ።",
          currentOptions,
        ));
        return;
      }

      await ctx.answerCbQuery(localize(
        "Something went wrong. Use /new to try again.",
        "ችግኝ ተፈጥሯል። እባክዎ /new በመጠቀም ደግመው ይሞክሩ።",
        currentOptions,
      ));
    }
  });

  bot.on("text", async (ctx) => {
    if (!isTextMessage(ctx.message)) {
      return;
    }

    const currentOptions = chatOptions(ctx.chat.id, options);

    if (!selectedLanguageByChat.has(ctx.chat.id)) {
      await ctx.reply(localize("Use /start and choose a language first.", " /start ይጠቀሙ እና መጀመሪያ ቋንቋ ይምረጡ።", currentOptions));
      return;
    }

    if (!selectedThemeByChat.has(ctx.chat.id)) {
      await ctx.reply(localize("Use /start and choose a theme first.", " /start ይጠቀሙ እና መጀመሪያ አይነት ይምረጡ።", currentOptions));
      return;
    }

    if (ctx.message.text.startsWith("/")) {
      return;
    }

    await ctx.reply(localize(
      "Use /start to begin, then answer using the buttons.",
      "ለመጀመር /start ይጠቀሙ፣ ከዚያ በአዝራሮቹ ይመልሱ።",
      currentOptions,
    ));
  });
}
