import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFeed, FeedFetchError } from "@/lib/calendar/fetch-feed";

const SECRET_URL = "https://calendar.example.com/export/secret-token-123.ics";

function mockFetch(...responses: (Response | Error)[]) {
  const fn = vi.fn();
  for (const r of responses) {
    if (r instanceof Error) fn.mockRejectedValueOnce(r);
    else fn.mockResolvedValueOnce(r);
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchFeed", () => {
  it("returns the calendar text", async () => {
    mockFetch(new Response("BEGIN:VCALENDAR\r\nEND:VCALENDAR", { status: 200 }));
    await expect(fetchFeed(SECRET_URL)).resolves.toMatchObject({ httpStatus: 200 });
  });

  it("follows a redirect (Lodgify redirects once)", async () => {
    const fn = mockFetch(
      new Response(null, { status: 301, headers: { location: "/oh/secret-token-123.ics" } }),
      new Response("BEGIN:VCALENDAR\r\nEND:VCALENDAR", { status: 200 })
    );
    await fetchFeed(SECRET_URL);
    expect(fn.mock.calls[1][0]).toBe("https://calendar.example.com/oh/secret-token-123.ics");
  });

  it("refuses to follow a redirect to plain http", async () => {
    mockFetch(new Response(null, { status: 302, headers: { location: "http://evil.example.com/" } }));
    await expect(fetchFeed(SECRET_URL)).rejects.toThrow("must use https");
  });

  it("refuses non-https URLs without fetching", async () => {
    const fn = mockFetch();
    await expect(fetchFeed("http://calendar.example.com/x.ics")).rejects.toBeInstanceOf(FeedFetchError);
    expect(fn).not.toHaveBeenCalled();
  });

  it("reports an HTTP error status", async () => {
    mockFetch(new Response("gone", { status: 404 }));
    await expect(fetchFeed(SECRET_URL)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it("reports a network failure", async () => {
    mockFetch(new TypeError("fetch failed"));
    await expect(fetchFeed(SECRET_URL)).rejects.toThrow("Couldn't connect");
  });

  it("rejects an oversized response", async () => {
    mockFetch(new Response("x".repeat(3 * 1024 * 1024), { status: 200 }));
    await expect(fetchFeed(SECRET_URL)).rejects.toThrow("too large");
  });

  it("stops after too many redirects", async () => {
    const hop = () => new Response(null, { status: 302, headers: { location: SECRET_URL } });
    mockFetch(hop(), hop(), hop(), hop(), hop());
    await expect(fetchFeed(SECRET_URL)).rejects.toThrow("too many times");
  });

  it("never puts the secret URL in error messages", async () => {
    mockFetch(new Response("err", { status: 500 }));
    const error = await fetchFeed(SECRET_URL).catch((e: Error) => e);
    expect(String((error as Error).message)).not.toContain("secret-token");
  });
});
