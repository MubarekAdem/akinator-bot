const regions = [
  "en",
  "ar",
  "cn",
  "de",
  "es",
  "fr",
  "il",
  "it",
  "jp",
  "kr",
  "nl",
  "pl",
  "pt",
  "ru",
  "tr",
  "id",
] as const;

type region = (typeof regions)[number];

type BotEnv = {
  token: string;
  region: region;
  childMode: boolean;
  mongoUri: string;
  mongoDbName: string;
  pythonBin?: string;
};

const SUPPORTED_REGIONS = new Set<string>(regions);

export function getBotEnv(): BotEnv {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN in environment.");
  }

  const requestedRegion = process.env.AKINATOR_REGION?.trim() ?? "en";
  const region = SUPPORTED_REGIONS.has(requestedRegion)
    ? (requestedRegion as region)
    : "en";

  const childMode = process.env.AKINATOR_CHILD_MODE === "true";
  const mongoUri = process.env.MONGODB_URI?.trim() || "mongodb://127.0.0.1:27017";
  const mongoDbName = process.env.MONGODB_DB_NAME?.trim() || "akinator_bot";
  const pythonBin = process.env.PYTHON_BIN?.trim() || undefined;

  return {
    token,
    region,
    childMode,
    mongoUri,
    mongoDbName,
    pythonBin,
  };
}
