import { request } from "undici";

export async function checkAkinatorConnectivity(): Promise<void> {
  const body = new URLSearchParams({ cm: "false", sid: "1" }).toString();

  const requestOptions: Record<string, unknown> = {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "x-requested-with": "XMLHttpRequest",
      "accept-language": "en-US,en;q=0.9",
      origin: "https://en.akinator.com",
      referer: "https://en.akinator.com/",
    },
    body,
  };

  try {
    const response = await request("https://en.akinator.com/game", requestOptions);
    if (response.statusCode === 403) {
      console.warn("Akinator preflight: HTTP 403 (Cloudflare block). Your server IP/proxy is blocked.");
      return;
    }

    if (response.statusCode >= 400) {
      console.warn(`Akinator preflight: HTTP ${response.statusCode}.`);
      return;
    }

    console.log(`Akinator preflight: reachable (HTTP ${response.statusCode}).`);
  } catch (error) {
    const message = formatError(error);
    console.warn(`Akinator preflight failed: ${message}`);
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    const details: string[] = [];
    const maybeCode = (error as Error & { code?: string }).code;
    if (maybeCode) {
      details.push(`code=${maybeCode}`);
    }

    if (error.message) {
      details.push(error.message);
    }

    const withErrors = error as Error & { errors?: unknown[] };
    if (Array.isArray(withErrors.errors) && withErrors.errors.length > 0) {
      const nested = withErrors.errors
        .map((entry) => {
          if (entry instanceof Error) {
            const code = (entry as Error & { code?: string }).code;
            return code ? `${code}:${entry.message}` : entry.message;
          }

          return String(entry);
        })
        .join(" | ");

      details.push(`nested=${nested}`);
    }

    if (details.length > 0) {
      return details.join("; ");
    }
  }

  return String(error);
}
