import type { NextRequest } from "next/server";
import { handlers, isAdminConfigured } from "@/lib/auth";

// The admin area doesn't exist on deployments without its settings
// (e.g. production until it's switched on), so neither does sign-in.
function notConfigured() {
  return new Response("Not found", { status: 404 });
}

export async function GET(request: NextRequest) {
  return isAdminConfigured() ? handlers.GET(request) : notConfigured();
}

export async function POST(request: NextRequest) {
  return isAdminConfigured() ? handlers.POST(request) : notConfigured();
}
