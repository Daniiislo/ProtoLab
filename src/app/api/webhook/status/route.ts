import { getSession } from "@/server/event-store";
import { errorResponse, json, sessionFrom } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  try {
    return json(getSession(sessionFrom(request)).payment);
  } catch (error) {
    return errorResponse(error);
  }
}
