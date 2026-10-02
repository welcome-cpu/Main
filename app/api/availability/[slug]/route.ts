import { guardPublicRequest, json, validationError } from "@/lib/booking/api";
import { getPublicCalendar, getPublicProperty } from "@/lib/booking/public";
import { calendarQuerySchema, queryParams } from "@/lib/booking/public-validation";

/** Public availability calendar: which nights are free, nothing about who booked. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const blocked = await guardPublicRequest(request, "availability-calendar", 120);
  if (blocked) return blocked;

  const parsed = calendarQuerySchema.safeParse(queryParams(request.url, ["from", "to"]));
  if (!parsed.success) return validationError(parsed.error);

  const property = await getPublicProperty((await params).slug);
  if (!property) return json({ error: "Not found" }, 404);

  const calendar = await getPublicCalendar(property, { start: parsed.data.from, end: parsed.data.to });
  return json(calendar);
}
