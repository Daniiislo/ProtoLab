import { randomUUID } from "node:crypto";
import { z } from "zod";
import { SessionSchema } from "@/lib/protocol-contracts";
import { getSession, initialPayment } from "@/server/event-store";
import { errorResponse, json, localOrigin, readBody, webhookSecret } from "@/server/http";

export const runtime = "nodejs";
const InputSchema = z.object({ session: SessionSchema, action: z.enum(["pay", "reset"]) });

export async function POST(request: Request) {
  try {
    const { session, action } = await readBody(request, InputSchema);
    const state = getSession(session);
    if (state.paymentInFlight)
      return json({ error: "Webhook đang được gửi. Hãy chờ xác nhận." }, 409);
    if (action === "reset") {
      state.payment = initialPayment();
      return json({ ok: true });
    }
    const eventId = state.payment.eventId ?? randomUUID();
    state.paymentInFlight = true;
    try {
      // Request HTTP thật giữa hai vai trò server; URL cố định để demo không thành proxy.
      const response = await fetch(`${localOrigin}/api/webhook/receiver`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-webhook-secret": webhookSecret },
        body: JSON.stringify({ session, eventId, type: "payment.succeeded" }),
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
      if (!response.ok)
        return json({ error: `Bên nhận từ chối webhook (HTTP ${response.status}).` }, 502);
      const ack = z.object({ ok: z.literal(true) }).safeParse(await response.json());
      if (!ack.success) return json({ error: "Xác nhận webhook không hợp lệ." }, 502);
      return json({ ok: true, eventId, deliveryStatus: response.status });
    } catch {
      return json(
        { error: "Không nhận được xác nhận webhook. Kiểm tra trạng thái đơn trước khi thử lại." },
        502,
      );
    } finally {
      state.paymentInFlight = false;
    }
  } catch (error) {
    return errorResponse(error);
  }
}
