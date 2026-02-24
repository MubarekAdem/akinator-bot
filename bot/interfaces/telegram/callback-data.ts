import type { AnswerId, ThemeId } from "@/bot/domain/game";

const PREFIX = "aki";

export type BotLanguage = "en" | "am";

export type BotAction =
  | { type: "answer"; answer: AnswerId }
  | { type: "theme"; theme: ThemeId }
  | { type: "language"; language: BotLanguage }
  | { type: "back" }
  | { type: "restart" };

export function encodeAnswer(answer: AnswerId): string {
  return `${PREFIX}:answer:${answer}`;
}

export function encodeBack(): string {
  return `${PREFIX}:back`;
}

export function encodeRestart(): string {
  return `${PREFIX}:restart`;
}

export function encodeTheme(theme: ThemeId): string {
  return `${PREFIX}:theme:${theme}`;
}

export function encodeLanguage(language: BotLanguage): string {
  return `${PREFIX}:language:${language}`;
}

export function decodeAction(data: string | undefined): BotAction | null {
  if (!data || !data.startsWith(`${PREFIX}:`)) {
    return null;
  }

  const [, type, value] = data.split(":");

  if (type === "back") {
    return { type: "back" };
  }

  if (type === "restart") {
    return { type: "restart" };
  }

  if (type === "answer" && value) {
    return { type: "answer", answer: value as AnswerId };
  }

  if (type === "theme" && value) {
    return { type: "theme", theme: value as ThemeId };
  }

  if (type === "language" && (value === "en" || value === "am")) {
    return { type: "language", language: value };
  }

  return null;
}
