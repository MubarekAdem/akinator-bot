import type { AnswerId, GameState, ThemeId } from "@/bot/domain/game";
import type { GameEngine } from "@/bot/application/ports/game-engine";

export class AkinatorGameService {
  constructor(private readonly engine: GameEngine) {}

  async start(chatId: number, theme?: ThemeId): Promise<GameState> {
    await this.engine.reset(chatId);
    return this.engine.start(chatId, theme);
  }

  async answer(chatId: number, answer: AnswerId): Promise<GameState> {
    if (!(await this.engine.hasSession(chatId))) {
      return this.start(chatId);
    }

    return this.engine.answer(chatId, answer);
  }

  async back(chatId: number): Promise<GameState> {
    if (!(await this.engine.hasSession(chatId))) {
      return this.start(chatId);
    }

    return this.engine.back(chatId);
  }

  async restart(chatId: number): Promise<GameState> {
    return this.start(chatId);
  }

  async restartWithTheme(chatId: number, theme: ThemeId): Promise<GameState> {
    return this.start(chatId, theme);
  }
}
