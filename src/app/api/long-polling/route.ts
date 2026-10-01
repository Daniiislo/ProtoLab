import { z } from "zod";
import { SessionSchema } from "@/lib/protocol-contracts";
import {
  getSession,
  notificationBatch,
  publishNotification,
  waitForNotification,
} from "@/server/event-store";
import { errorResponse, json, readBody, sessionFrom } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const InputSchema = z.discriminatedUnion("action", [
  z.object({
    session: SessionSchema,
    action: z.literal("publish"),
    text: z.string().trim().min(1).max(240),
  }),
  z.object({ session: SessionSchema, action: z.literal("reset") }),
]);

export async function GET(request: Request) {
  try {
    const session = sessionFrom(request);
    const after = z.coerce
      .number()
      .int()
      .nonnegative()
      .safeParse(new URL(request.url).searchParams.get("after") ?? 0);
    if (!after.success) return json({ error: "Cursor không hợp lệ." }, 400);
    const state = getSession(session);
    if (after.data > state.cursor) return json({ error: "Cursor đã cũ. Hãy làm lại demo." }, 409);
    return json(await waitForNotification(state, after.data, request.signal));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = await readBody(request, InputSchema);
    const state = getSession(input.session);
    publishNotification(state, input.action === "publish" ? input.text : undefined);
    return json(notificationBatch(state, 0));
  } catch (error) {
    return errorResponse(error);
  }
}
