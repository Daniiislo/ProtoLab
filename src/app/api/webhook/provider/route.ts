import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { after } from "next/server";
import { z } from "zod";
import { SessionSchema } from "@/lib/protocol-contracts";
import { getSession, initialPayment } from "@/server/event-store";
import { errorResponse, json, localOrigin, readBody, webhookSecret } from "@/server/http";

export const runtime = "nodejs";
const InputSchema = z.object({ session: SessionSchema, action: z.enum(["pay", "reset"]) });
const AckSchema = z.object({ ok: z.literal(true) });
const attempts = 3;

// Gửi webhook tách khỏi request thanh toán: retry khi không nhận được 2xx, giữ nguyên eventId.
async function deliver(session: string, eventId: string) {
  const state = getSession(session);
  // Thời gian xử lý thanh toán trước khi sự kiện payment.succeeded phát sinh.
  await delay(1_000);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      // Request HTTP thật giữa hai vai trò server; URL cố định để demo không thành proxy.
      const response = await fetch(`${localOrigin}/api/webhook/receiver`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-webhook-secret": webhookSecret },
        body: JSON.stringify({ session, eventId, type: "payment.succeeded" }),
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
      if (response.ok && AckSchema.safeParse(await response.json()).success) {
        state.delivery = { eventId, status: "delivered" };
        return;
      }
    } catch {
      // Không có response hợp lệ: tính là một lần gửi thất bại.
    }
    if (attempt < attempts) await delay(attempt * 1_000);
  }
  state.delivery = { eventId, status: "failed" };
}

export async function POST(request: Request) {
  try {
    const { session, action } = await readBody(request, InputSchema);
    const state = getSession(session);
    if (state.delivery?.status === "sending")
      return json({ error: "Webhook đang được gửi; vui lòng chờ xác nhận." }, 409);
    if (action === "reset") {
      state.payment = initialPayment();
      state.webhooks = [];
      state.delivery = null;
      return json({ ok: true });
    }
    // Một thanh toán chỉ có một sự kiện; gửi lại luôn dùng eventId đã phát sinh.
    const eventId = state.delivery?.eventId ?? randomUUID();
    state.delivery = { eventId, status: "sending" };
    after(() => deliver(session, eventId));
    return json({ ok: true, eventId }, 202);
  } catch (error) {
    return errorResponse(error);
  }
}
