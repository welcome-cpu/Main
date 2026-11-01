import { z } from "zod";
import { json, readJsonBody, validationError } from "@/lib/booking/api";
import { isDatabaseConfigured } from "@/lib/db/client";
import { enterPrizeDraw, prizeDrawEntrySchema } from "@/lib/prize-draw";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { passesTurnstile } from "@/lib/turnstile";

const bodySchema = prizeDrawEntrySchema.extend({ turnstileToken: z.string().max(4096).nullish() });

/** Enters the annual free-night draw from a welcome guide. */
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return json({ error: "Not found" }, 404);
  const ip = clientIp(request);
  if (!(await rateLimit(`prize-draw:${ip}`, 5, 3600))) {
    return json({ error: "Too many requests. Please wait a while and try again." }, 429);
  }

  const read = await readJsonBody(request);
  if (!read.ok) return read.response;
  const parsed = bodySchema.safeParse(read.body);
  if (!parsed.success) return validationError(parsed.error);

  if (!(await passesTurnstile(parsed.data.turnstileToken, ip))) {
    return json({ error: "Please complete the verification check and try again." }, 400);
  }

  await enterPrizeDraw(parsed.data);
  return json({ ok: true });
}
