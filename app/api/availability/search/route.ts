import { guardPublicRequest, json, validationError } from "@/lib/booking/api";
import { searchPublicProperties } from "@/lib/booking/public";
import { queryParams, stayQuerySchema } from "@/lib/booking/public-validation";

/** Public search: which properties are free for these dates and guests. */
export async function GET(request: Request) {
  const blocked = await guardPublicRequest(request, "availability-search", 30);
  if (blocked) return blocked;

  const parsed = stayQuerySchema.safeParse(
    queryParams(request.url, ["checkIn", "checkOut", "adults", "children", "infants", "pets"])
  );
  if (!parsed.success) return validationError(parsed.error);

  return json({ results: await searchPublicProperties(parsed.data) });
}
