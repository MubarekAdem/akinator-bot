import { request } from "undici";

const amharicCache = new Map<string, string>();

export async function translateToAmharic(text: string, enabled: boolean): Promise<string> {
  const source = text.trim();

  if (!enabled || !source) {
    return text;
  }

  const cached = amharicCache.get(source);
  if (cached) {
    return cached;
  }

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(source)}&langpair=en|am`;
    const response = await request(url, {
      method: "GET",
      headers: {
        "accept": "application/json",
      },
    });

    if (response.statusCode >= 400) {
      return text;
    }

    const body = (await response.body.json()) as {
      responseData?: { translatedText?: string };
    };

    const translated = body.responseData?.translatedText?.trim();
    if (!translated) {
      return text;
    }

    amharicCache.set(source, translated);
    return translated;
  } catch {
    return text;
  }
}