import { guardPublicRequest, json, validationError } from "@/lib/booking/api";
import { checkPublicStay, getPublicProperty } from "@/lib/booking/public";
import { queryParams, stayQuerySchema } from "@/lib/booking/public-validation";

/** Public check of specific dates and guests, using the server-side engine. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const blocked = await guardPublicRequest(request, "availability-check", 30);
  if (blocked) return blocked;

  const parsed = stayQuerySchema.safeParse(
    queryParams(request.url, ["checkIn", "checkOut", "adults", "children", "infants", "pets"])
  );
  if (!parsed.success) return validationError(parsed.error);

  const property = await getPublicProperty((await params).slug);
  if (!property) return json({ error: "Not found" }, 404);

  return json(await checkPublicStay(property, parsed.data));
}
