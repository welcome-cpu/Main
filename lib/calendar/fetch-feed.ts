import "server-only";

export class FeedFetchError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null = null
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

/**
 * Downloads a calendar feed server-side: HTTPS only (including every
 * redirect hop), with a timeout and a size cap. Error messages never include
 * the URL, because feed URLs contain access tokens.
 */
export async function fetchFeed(url: string): Promise<{ text: string; httpStatus: number }> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!current.startsWith("https://")) {
      throw new FeedFetchError("Calendar URLs must use https.");
    }

    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1" },
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      throw new FeedFetchError(timedOut ? "The calendar didn't respond within 15 seconds." : "Couldn't connect to the calendar.");
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new FeedFetchError("The calendar redirected without a destination.", res.status);
      current = new URL(location, current).toString();
      continue;
    }
    if (!res.ok) {
      throw new FeedFetchError(`The calendar returned HTTP ${res.status}.`, res.status);
    }

    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) throw new FeedFetchError("The calendar file is too large.", res.status);

    const buffer = await readCapped(res);
    return { text: new TextDecoder("utf-8").decode(buffer), httpStatus: res.status };
  }
  throw new FeedFetchError("The calendar redirected too many times.");
}

async function readCapped(res: Response) {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new FeedFetchError("The calendar file is too large.", res.status);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
