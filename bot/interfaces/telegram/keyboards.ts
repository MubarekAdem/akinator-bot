import { Markup } from "telegraf";
import { ANSWER_OPTIONS, THEME_OPTIONS } from "@/bot/domain/game";
import { encodeAnswer, encodeBack, encodeLanguage, encodeRestart, encodeTheme } from "@/bot/interfaces/telegram/callback-data";

type KeyboardOptions = {
  translateToAmharic?: boolean;
};

export function languageKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🇺🇸 English", encodeLanguage("en"))],
    [Markup.button.callback("🇪🇹 አማርኛ", encodeLanguage("am"))],
  ]);
}

const AMHARIC_THEME_LABELS = {
  characters: "🧑 ባህሪያት",
  objects: "📦 እቃዎች",
  animals: "🐾 እንስሳት",
} as const;

const AMHARIC_ANSWER_LABELS = {
  yes: "✅ አዎ",
  no: "❌ አይ",
  dont_know: "🤷 አላውቅም",
  probably: "👍 ምናልባት",
  probably_not: "👎 ምናልባት አይ",
} as const;

export function themeKeyboard(options?: KeyboardOptions) {
  const useAmharic = Boolean(options?.translateToAmharic);

  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        useAmharic ? AMHARIC_THEME_LABELS[THEME_OPTIONS[0].id] : THEME_OPTIONS[0].label,
        encodeTheme(THEME_OPTIONS[0].id),
      ),
    ],
    [
      Markup.button.callback(
        useAmharic ? AMHARIC_THEME_LABELS[THEME_OPTIONS[1].id] : THEME_OPTIONS[1].label,
        encodeTheme(THEME_OPTIONS[1].id),
      ),
    ],
    [
      Markup.button.callback(
        useAmharic ? AMHARIC_THEME_LABELS[THEME_OPTIONS[2].id] : THEME_OPTIONS[2].label,
        encodeTheme(THEME_OPTIONS[2].id),
      ),
    ],
  ]);
}

export function gameKeyboard(options?: KeyboardOptions) {
  const useAmharic = Boolean(options?.translateToAmharic);

  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        useAmharic ? AMHARIC_ANSWER_LABELS[ANSWER_OPTIONS[0].id] : ANSWER_OPTIONS[0].label,
        encodeAnswer(ANSWER_OPTIONS[0].id),
      ),
    ],
    [
      Markup.button.callback(
        useAmharic ? AMHARIC_ANSWER_LABELS[ANSWER_OPTIONS[1].id] : ANSWER_OPTIONS[1].label,
        encodeAnswer(ANSWER_OPTIONS[1].id),
      ),
    ],
    [
      Markup.button.callback(
        useAmharic ? AMHARIC_ANSWER_LABELS[ANSWER_OPTIONS[2].id] : ANSWER_OPTIONS[2].label,
        encodeAnswer(ANSWER_OPTIONS[2].id),
      ),
    ],
    [
      Markup.button.callback(
        useAmharic ? AMHARIC_ANSWER_LABELS[ANSWER_OPTIONS[3].id] : ANSWER_OPTIONS[3].label,
        encodeAnswer(ANSWER_OPTIONS[3].id),
      ),
    ],
    [
      Markup.button.callback(
        useAmharic ? AMHARIC_ANSWER_LABELS[ANSWER_OPTIONS[4].id] : ANSWER_OPTIONS[4].label,
        encodeAnswer(ANSWER_OPTIONS[4].id),
      ),
    ],
    [
      Markup.button.callback(useAmharic ? "↩️ ተመለስ" : "↩️ Back", encodeBack()),
      Markup.button.callback(useAmharic ? "🔁 እንደገና ጀምር" : "🔁 Restart", encodeRestart()),
    ],
  ]);
}

export function winKeyboard(options?: KeyboardOptions) {
  const useAmharic = Boolean(options?.translateToAmharic);
  return Markup.inlineKeyboard([
    [Markup.button.callback(useAmharic ? "🔁 ደግሞ ተጫወት" : "🔁 Play again", encodeRestart())],
  ]);
}
