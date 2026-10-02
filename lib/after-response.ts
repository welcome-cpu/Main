import "server-only";
import { after } from "next/server";

/**
 * Runs work after the response is sent. Outside a request (e.g. in tests
 * or scripts) after() isn't available, so the work just starts in the
 * background. Never throws: follow-up work must not fail the response.
 */
export function runAfterResponse(work: () => Promise<unknown>) {
  const safe = () => work().catch((error) => console.error("Background work failed", error));
  try {
    after(safe);
  } catch {
    void safe();
  }
}
