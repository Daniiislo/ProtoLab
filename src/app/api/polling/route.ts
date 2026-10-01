import { z } from "zod";
import { SessionSchema } from "@/lib/protocol-contracts";
import { getSession } from "@/server/event-store";
import { errorResponse, json, readBody, sessionFrom } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const InputSchema = z.object({ session: SessionSchema, action: z.enum(["advance", "reset"]) });

export function GET(request: Request) {
  try {
    return json(getSession(sessionFrom(request)).order);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { session, action } = await readBody(request, InputSchema);
    const state = getSession(session);
    state.order = {
      step: action === "reset" ? 0 : Math.min(state.order.step + 1, 3),
      updatedAt: new Date().toISOString(),
    };
    return json(state.order);
  } catch (error) {
    return errorResponse(error);
  }
}
