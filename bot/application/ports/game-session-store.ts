import type { ThemeId } from "@/bot/domain/game";

export type PersistedGameSession = {
  chatId: number;
  region: string;
  childMode: boolean;
  theme: ThemeId;
  engineState: Record<string, unknown>;
  progress: number;
  question: string;
  isWin: boolean;
  guessName: string;
  guessDescription: string;
  guessPhoto: string;
  updatedAt: Date;
};

export interface GameSessionStore {
  findByChatId(chatId: number): Promise<PersistedGameSession | null>;
  save(session: PersistedGameSession): Promise<void>;
  deleteByChatId(chatId: number): Promise<void>;
}
