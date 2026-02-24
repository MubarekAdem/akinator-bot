export type AnswerId = "yes" | "no" | "dont_know" | "probably" | "probably_not";

export type ThemeId = "characters" | "objects" | "animals";

export type ThemeOption = {
  id: ThemeId;
  label: string;
};

export const THEME_OPTIONS: ReadonlyArray<ThemeOption> = [
  { id: "characters", label: "🧑 Characters" },
  { id: "objects", label: "📦 Objects" },
  { id: "animals", label: "🐾 Animals" },
];

export type AnswerOption = {
  id: AnswerId;
  label: string;
};

export const ANSWER_OPTIONS: ReadonlyArray<AnswerOption> = [
  { id: "yes", label: "✅ Yes" },
  { id: "no", label: "❌ No" },
  { id: "dont_know", label: "🤷 I don't know" },
  { id: "probably", label: "👍 Probably" },
  { id: "probably_not", label: "👎 Probably not" },
];

export type QuestionState = {
  text: string;
  progress: number;
};

export type GuessState = {
  name: string;
  description: string;
  photoUrl: string;
};

export type GameState =
  | {
      isWin: false;
      question: QuestionState;
    }
  | {
      isWin: true;
      guess: GuessState;
    };
