import { Markup } from "telegraf";
import { ANSWER_OPTIONS, THEME_OPTIONS } from "@/bot/domain/game";
import { encodeAnswer, encodeBack, encodeRestart, encodeTheme } from "@/bot/interfaces/telegram/callback-data";

export function themeKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(THEME_OPTIONS[0].label, encodeTheme(THEME_OPTIONS[0].id))],
    [Markup.button.callback(THEME_OPTIONS[1].label, encodeTheme(THEME_OPTIONS[1].id))],
    [Markup.button.callback(THEME_OPTIONS[2].label, encodeTheme(THEME_OPTIONS[2].id))],
  ]);
}

export function gameKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(ANSWER_OPTIONS[0].label, encodeAnswer(ANSWER_OPTIONS[0].id))],
    [Markup.button.callback(ANSWER_OPTIONS[1].label, encodeAnswer(ANSWER_OPTIONS[1].id))],
    [Markup.button.callback(ANSWER_OPTIONS[2].label, encodeAnswer(ANSWER_OPTIONS[2].id))],
    [Markup.button.callback(ANSWER_OPTIONS[3].label, encodeAnswer(ANSWER_OPTIONS[3].id))],
    [Markup.button.callback(ANSWER_OPTIONS[4].label, encodeAnswer(ANSWER_OPTIONS[4].id))],
    [
      Markup.button.callback("↩️ Back", encodeBack()),
      Markup.button.callback("🔁 Restart", encodeRestart()),
    ],
  ]);
}

export function winKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback("🔁 Play again", encodeRestart())]]);
}
