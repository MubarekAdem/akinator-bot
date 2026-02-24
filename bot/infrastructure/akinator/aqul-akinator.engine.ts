import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { request } from "undici";
import type { AnswerId, GameState, ThemeId } from "@/bot/domain/game";
import type { GameEngine } from "@/bot/application/ports/game-engine";
import type { GameSessionStore, PersistedGameSession } from "@/bot/application/ports/game-session-store";

const answerMap: Record<AnswerId, string> = {
  yes: "yes",
  no: "no",
  dont_know: "i don't know",
  probably: "probably",
  probably_not: "probably not",
};

const themeMap: Record<ThemeId, "c" | "a" | "o"> = {
  characters: "c",
  animals: "a",
  objects: "o",
};

type EngineOptions = {
  region: string;
  childMode: boolean;
  sessionStore: GameSessionStore;
  pythonBin?: string;
  bridgeUrl?: string;
};

type PythonCommand = {
  command: string;
  argsPrefix: string[];
};

type PythonBridgeResponse = {
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
  state?: {
    isWin: boolean;
    question?: {
      text: string;
      progress: number;
    };
    guess?: {
      name: string;
      description: string;
      photoUrl: string;
    };
  };
  engineState?: Record<string, unknown>;
};

export class AqulAkinatorEngine implements GameEngine {
  private readonly pythonCommands: PythonCommand[];
  private readonly bridgeUrl?: string;

  constructor(private readonly options: EngineOptions) {
    this.pythonCommands = this.resolvePythonCommands();
    this.bridgeUrl = this.resolveBridgeUrl();
  }

  async hasSession(chatId: number): Promise<boolean> {
    const persisted = await this.options.sessionStore.findByChatId(chatId);
    return persisted !== null;
  }

  async reset(chatId: number): Promise<void> {
    await this.options.sessionStore.deleteByChatId(chatId);
  }

  async start(chatId: number, theme: ThemeId = "characters"): Promise<GameState> {
    const result = await this.runBridge("start", {
      region: this.options.region,
      childMode: this.options.childMode,
      theme: themeMap[theme],
    });

    if (!result.state || !result.engineState) {
      throw new Error("AKINATOR_BRIDGE_INVALID_RESPONSE");
    }

    await this.options.sessionStore.save({
      chatId,
      region: this.options.region,
      childMode: this.options.childMode,
      theme,
      engineState: result.engineState,
      progress: result.state.isWin ? 100 : (result.state.question?.progress ?? 0),
      question: result.state.question?.text ?? "",
      isWin: result.state.isWin,
      guessName: result.state.guess?.name ?? "",
      guessDescription: result.state.guess?.description ?? "",
      guessPhoto: result.state.guess?.photoUrl ?? "",
      updatedAt: new Date(),
    });

    return this.toState(result);
  }

  async answer(chatId: number, answer: AnswerId): Promise<GameState> {
    const persisted = await this.requireSession(chatId);
    const result = await this.runBridge("answer", {
      engineState: persisted.engineState,
      answer: answerMap[answer],
    });

    if (!result.state || !result.engineState) {
      throw new Error("AKINATOR_BRIDGE_INVALID_RESPONSE");
    }

    await this.options.sessionStore.save({
      ...persisted,
      engineState: result.engineState,
      progress: result.state.isWin ? 100 : (result.state.question?.progress ?? 0),
      question: result.state.question?.text ?? persisted.question,
      isWin: result.state.isWin,
      guessName: result.state.guess?.name ?? "",
      guessDescription: result.state.guess?.description ?? "",
      guessPhoto: result.state.guess?.photoUrl ?? "",
      updatedAt: new Date(),
    });

    return this.toState(result);
  }

  async back(chatId: number): Promise<GameState> {
    const persisted = await this.requireSession(chatId);
    const result = await this.runBridge("back", {
      engineState: persisted.engineState,
    });

    if (!result.state || !result.engineState) {
      throw new Error("AKINATOR_BRIDGE_INVALID_RESPONSE");
    }

    await this.options.sessionStore.save({
      ...persisted,
      engineState: result.engineState,
      progress: result.state.isWin ? 100 : (result.state.question?.progress ?? 0),
      question: result.state.question?.text ?? persisted.question,
      isWin: result.state.isWin,
      guessName: result.state.guess?.name ?? "",
      guessDescription: result.state.guess?.description ?? "",
      guessPhoto: result.state.guess?.photoUrl ?? "",
      updatedAt: new Date(),
    });

    return this.toState(result);
  }

  private async requireSession(chatId: number): Promise<PersistedGameSession> {
    const persisted = await this.options.sessionStore.findByChatId(chatId);
    if (!persisted) {
      throw new Error("Game session not found.");
    }

    return persisted;
  }

  private toState(result: PythonBridgeResponse): GameState {
    if (!result.state) {
      throw new Error("AKINATOR_BRIDGE_INVALID_RESPONSE");
    }

    if (result.state.isWin && result.state.guess) {
      return {
        isWin: true,
        guess: {
          name: result.state.guess.name,
          description: result.state.guess.description,
          photoUrl: result.state.guess.photoUrl,
        },
      };
    }

    return {
      isWin: false,
      question: {
        text: result.state.question?.text ?? "",
        progress: result.state.question?.progress ?? 0,
      },
    };
  }

  private async runBridge(
    action: "start" | "answer" | "back",
    payload: Record<string, unknown>
  ): Promise<PythonBridgeResponse> {
    if (this.bridgeUrl) {
      return this.runBridgeHttp(action, payload, this.bridgeUrl);
    }

    return this.runBridgeLocal(action, payload);
  }

  private async runBridgeHttp(
    action: "start" | "answer" | "back",
    payload: Record<string, unknown>,
    bridgeUrl: string,
  ): Promise<PythonBridgeResponse> {
    try {
      const response = await request(bridgeUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ action, payload }),
      });

      const body = (await response.body.json()) as PythonBridgeResponse;
      if (response.statusCode >= 400) {
        const message = body.errorMessage?.trim() || `HTTP ${response.statusCode}`;
        throw new Error(`AKINATOR_PYTHON_RUNTIME_ERROR:${message}`);
      }

      if (!body.ok) {
        const code = body.errorCode ?? "AKINATOR_PYTHON_ERROR";
        const message = body.errorMessage?.trim();
        throw new Error(message ? `${code}:${message}` : code);
      }

      return body;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }

      throw new Error(`AKINATOR_PYTHON_RUNTIME_ERROR:${String(error)}`);
    }
  }

  private runBridgeLocal(action: "start" | "answer" | "back", payload: Record<string, unknown>): PythonBridgeResponse {
    const scriptPath = resolve(process.cwd(), "bot/infrastructure/akinator/python_client.py");
    const payloadJson = JSON.stringify(payload);
    let lastRuntimeError = "Python bridge failed";

    for (const pythonCommand of this.pythonCommands) {
      const result = spawnSync(
        pythonCommand.command,
        [...pythonCommand.argsPrefix, scriptPath, action],
        {
          input: payloadJson,
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
        }
      );

      if (result.error) {
        lastRuntimeError = result.error.message;
        if (this.shouldTryNextPythonCommand(lastRuntimeError)) {
          continue;
        }

        throw new Error(`AKINATOR_PYTHON_EXEC_ERROR:${result.error.message}`);
      }

      if (result.status !== 0) {
        const stderr = result.stderr?.trim() || "Python bridge failed";
        lastRuntimeError = stderr;
        if (this.shouldTryNextPythonCommand(stderr)) {
          continue;
        }

        throw new Error(`AKINATOR_PYTHON_RUNTIME_ERROR:${stderr}`);
      }

      const output = (result.stdout ?? "").trim();
      if (!output) {
        throw new Error("AKINATOR_PYTHON_EMPTY_OUTPUT");
      }

      let parsed: PythonBridgeResponse;
      try {
        parsed = JSON.parse(output) as PythonBridgeResponse;
      } catch {
        throw new Error(`AKINATOR_PYTHON_INVALID_JSON:${output.slice(0, 200)}`);
      }

      if (!parsed.ok) {
        const code = parsed.errorCode ?? "AKINATOR_PYTHON_ERROR";
        const message = parsed.errorMessage?.trim();
        throw new Error(message ? `${code}:${message}` : code);
      }

      return parsed;
    }

    throw new Error(`AKINATOR_PYTHON_RUNTIME_ERROR:${lastRuntimeError}`);
  }

  private resolveBridgeUrl(): string | undefined {
    const configured = this.options.bridgeUrl ?? process.env.AKINATOR_BRIDGE_URL;
    if (!configured) {
      return undefined;
    }

    const trimmed = configured.trim();
    if (!trimmed) {
      return undefined;
    }

    return trimmed.endsWith("/bridge") ? trimmed : `${trimmed.replace(/\/$/, "")}/bridge`;
  }

  private resolvePythonCommands(): PythonCommand[] {
    const configured = this.options.pythonBin ?? process.env.PYTHON_BIN;
    if (configured) {
      return [{ command: configured, argsPrefix: [] }];
    }

    return [
      { command: "py", argsPrefix: ["-3"] },
      { command: "python3", argsPrefix: [] },
      { command: "python", argsPrefix: [] },
    ];
  }

  private shouldTryNextPythonCommand(message: string): boolean {
    const lower = message.toLowerCase();
    return (
      lower.includes("python was not found") ||
      lower.includes("is not recognized") ||
      lower.includes("enoent")
    );
  }
}
