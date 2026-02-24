import type { AnswerId, GameState, ThemeId } from "@/bot/domain/game";

export interface GameEngine {
  start(chatId: number, theme?: ThemeId): Promise<GameState>;
  answer(chatId: number, answer: AnswerId): Promise<GameState>;
  back(chatId: number): Promise<GameState>;
  hasSession(chatId: number): Promise<boolean>;
  reset(chatId: number): Promise<void>;
}
