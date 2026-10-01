import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { SessionSchema } from "@/lib/protocol-contracts";
import { getSession } from "@/server/event-store";
import { errorResponse, json, readBody, webhookSecret } from "@/server/http";

export const runtime = "nodejs";
const InputSchema = z.object({
  session: SessionSchema,
  eventId: z.string().uuid(),
  type: z.literal("payment.succeeded"),
});

export async function POST(request: Request) {
  try {
    const secret = Buffer.from(request.headers.get("x-webhook-secret") ?? "");
    const expected = Buffer.from(webhookSecret);
    if (secret.length !== expected.length || !timingSafeEqual(secret, expected))
      return json({ error: "Webhook không được xác thực." }, 401);
    const { session, eventId } = await readBody(request, InputSchema);
    const state = getSession(session);
    // Đơn demo chỉ thanh toán một lần. Gửi lại cùng event không đổi updatedAt.
    if (state.payment.status === "paid") {
      if (state.payment.eventId !== eventId)
        return json({ error: "Đơn đã được thanh toán bởi sự kiện khác." }, 409);
      return json({ ok: true });
    }
    state.payment = { status: "paid", eventId, updatedAt: new Date().toISOString() };
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
