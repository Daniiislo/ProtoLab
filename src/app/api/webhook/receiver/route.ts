import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { SessionSchema, type WebhookReceipt } from "@/lib/protocol-contracts";
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
      return json({ error: "Webhook không vượt qua bước xác thực." }, 401);
    const { session, eventId } = await readBody(request, InputSchema);
    const state = getSession(session);
    const receipt = (status: number, outcome: WebhookReceipt["outcome"]) => {
      state.webhooks = [
        ...state.webhooks,
        { eventId, status, outcome, receivedAt: new Date().toISOString() },
      ].slice(-20);
    };
    // Đơn demo chỉ thanh toán một lần. Gửi lại cùng event không đổi updatedAt.
    if (state.payment.status === "paid") {
      if (state.payment.eventId !== eventId) {
        receipt(409, "rejected");
        return json({ error: "Đơn hàng đã được thanh toán bởi một sự kiện khác." }, 409);
      }
      receipt(200, "duplicate");
      return json({ ok: true });
    }
    state.payment = { status: "paid", eventId, updatedAt: new Date().toISOString() };
    receipt(200, "processed");
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
