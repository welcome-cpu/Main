import { guardPublicRequest, json } from "@/lib/booking/api";
import { getHoldForGuest, releaseHold } from "@/lib/booking/holds";

// A guest's own hold or booking. Access needs the token handed out when the
// hold was created, sent in a header (so it doesn't end up in URLs or logs).
const token = (request: Request) => request.headers.get("x-access-token") ?? "";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardPublicRequest(request, "reservation-view", 60);
  if (blocked) return blocked;

  const view = await getHoldForGuest((await params).id, token(request));
  if (!view) return json({ error: "Not found" }, 404);
  return json(view);
}

/** Releases the guest's hold, e.g. to change dates. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardPublicRequest(request, "reservation-release", 20);
  if (blocked) return blocked;

  const released = await releaseHold((await params).id, token(request));
  return released ? json({ released: true }) : json({ error: "Not found" }, 404);
}
