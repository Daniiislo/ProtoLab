"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, CreditCard, Store } from "lucide-react";
import { PaymentAcceptedSchema, PaymentSchema, WebhookLogSchema } from "@/lib/protocol-contracts";
import { ActivityLog, useActivity, type FlowStep } from "@/components/activity-log";
import { Status } from "@/components/demo-status";
import { Button } from "@/components/ui/button";
import { readError } from "@/lib/read-error";

// Vị trí các mốc trong entry thanh toán, để giao diện hiển thị theo bước đang mô phỏng.
type Milestones = {
  story: string;
  eventId?: string;
  accepted?: number;
  sent?: number;
  stored?: number;
  seen?: number;
  deliveryStatus?: number;
  updatedAt?: string | null;
};

const pollInterval = 500;
const pollLimit = 20;

export function WebhookDemo({ session }: { session: string }) {
  const { entries, log, extend } = useActivity();
  const [marks, setMarks] = useState<Milestones | null>(null);
  const [view, setView] = useState<{ id: string | null; step: number }>({ id: null, step: 0 });
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  // eventId của lần thanh toán trước: "Thử lại" gửi lại đúng sự kiện này, không phát sinh sự kiện mới.
  const lastEvent = useRef<string | null>(null);
  const follow = useCallback((id: string | null, step: number) => setView({ id, step }), []);

  useEffect(() => () => request.current?.abort(), []);

  // Giao diện đi theo bước đang mô phỏng; khi sơ đồ không hiển thị lần thanh toán này thì dùng trạng thái thật.
  const simulated = marks !== null && view.id === marks.story;
  const reached = (index?: number) => index !== undefined && (!simulated || index <= view.step);
  const accepted = reached(marks?.accepted);
  const sent = reached(marks?.sent);
  const stored = reached(marks?.stored);
  const seen = reached(marks?.seen);
  const phase = error ? "error" : seen ? "done" : busy || (simulated && accepted) ? "running" : "idle";

  async function pay() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    const story = log("info", "Thanh toán mô phỏng", "POST /api/webhook/provider", [
      { from: "client", to: "provider", label: "Gửi request thanh toán", detail: 'POST /api/webhook/provider\n{"action":"pay"}' },
    ]);
    const mark = (patch: Partial<Milestones>) =>
      setMarks((current) => ({ ...(current?.story === story ? current : { story }), ...patch }));
    mark({});
    // Chỉ vẽ webhook đến sau request này; lần thử lại dùng chung eventId với các lần trước.
    const startedAt = Date.now();

    try {
      const response = await fetch("/api/webhook/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, action: "pay" }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const message = await readError(response, `Nhà cung cấp từ chối request thanh toán (HTTP ${response.status}).`);
        extend(story, "error", "Thanh toán bị từ chối", message, [
          { from: "provider", to: "client", label: `${response.status} · request bị từ chối`, detail: message },
        ]);
        throw new Error(message);
      }
      const receipt = PaymentAcceptedSchema.parse(await response.json());
      if (controller.signal.aborted) return;
      const resend = lastEvent.current === receipt.eventId;
      lastEvent.current = receipt.eventId;
      // Nhà cung cấp chỉ ghi nhận thanh toán; webhook được gửi sau, tách khỏi request này.
      mark({
        eventId: receipt.eventId,
        accepted: extend(story, "receive", "Nhà cung cấp đã ghi nhận thanh toán", JSON.stringify(receipt), [
          { from: "provider", to: "client", label: "202 Accepted · đã ghi nhận thanh toán", detail: JSON.stringify(receipt) },
        ]),
      });

      let delivered = 0;
      let storedKnown = false;
      const drawn = new Set<string>();
      for (let attempt = 1; attempt <= pollLimit; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        if (controller.signal.aborted) return;
        const sentAt = Date.now();
        const statusResponse = await fetch(`/api/webhook/status?session=${session}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!statusResponse.ok)
          throw new Error(await readError(statusResponse, `Không thể truy xuất trạng thái đơn hàng (HTTP ${statusResponse.status}).`));
        const payment = PaymentSchema.parse(await statusResponse.json());
        // Chỉ dùng để vẽ phần trao đổi giữa hai backend; request này không thuộc cơ chế webhook.
        const logResponse = await fetch(`/api/webhook/log?session=${session}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!logResponse.ok)
          throw new Error(await readError(logResponse, `Không thể đọc nhật ký webhook (HTTP ${logResponse.status}).`));
        const { webhooks } = WebhookLogSchema.parse(await logResponse.json());
        if (controller.signal.aborted) return;

        // Webhook đến trước request đọc trạng thái này thì vẽ trước nó; response "paid" nghĩa là webhook đã đến trước.
        const arrived = webhooks.filter((item) => {
          const at = Date.parse(item.receivedAt);
          return item.eventId === receipt.eventId && at >= startedAt && !drawn.has(item.receivedAt)
            && (payment.status === "paid" || at <= sentAt);
        });
        for (const item of arrived) {
          drawn.add(item.receivedAt);
          delivered += 1;
          const ok = item.status >= 200 && item.status < 300;
          const flow: FlowStep[] = [];
          if (delivered === 1)
            flow.push(resend
              ? { from: "provider", to: "provider", label: "Gửi lại sự kiện payment.succeeded đã phát sinh", detail: `eventId: ${receipt.eventId}` }
              : { from: "provider", to: "provider", label: "Thanh toán thành công · phát sinh sự kiện payment.succeeded", detail: `eventId: ${receipt.eventId}` });
          flow.push({
            from: "provider", to: "receiver",
            label: delivered === 1 ? "Gửi webhook (HTTP POST)" : `Gửi lại webhook · lần ${delivered}`,
            detail: `POST /api/webhook/receiver\nx-webhook-secret: ••••\n${JSON.stringify({ session: "…", eventId: receipt.eventId, type: "payment.succeeded" })}`,
          });
          if (item.outcome === "processed")
            flow.push({ from: "receiver", to: "receiver", label: "Xác thực secret · lưu trạng thái paid", detail: "So khớp header x-webhook-secret; kiểm tra payload; lưu eventId và trạng thái paid." });
          if (item.outcome === "duplicate")
            flow.push({ from: "receiver", to: "receiver", label: "eventId đã xử lý · bỏ qua", detail: `eventId: ${item.eventId}` });
          flow.push({
            from: "receiver", to: "provider",
            label: ok ? `${item.status} OK · xác nhận đã nhận` : `${item.status} · từ chối webhook`,
            detail: ok ? '{"ok":true}' : `HTTP ${item.status}`,
          });
          const index = extend(story, "receive", "Cửa hàng đã nhận webhook", `HTTP ${item.status} · ${item.eventId}`, flow);
          const first = delivered === 1 ? index + 1 : index;
          // "duplicate" nghĩa là đơn đã ở trạng thái paid từ trước, nên cửa hàng cũng đã lưu.
          const saved = item.outcome !== "rejected" && !storedKnown;
          if (saved) storedKnown = true;
          mark({
            ...(delivered === 1 ? { sent: first } : {}),
            ...(saved ? { stored: first + 1, deliveryStatus: item.status } : {}),
          });
        }

        const done = payment.status === "paid";
        const pair = extend(story, "receive", done ? "Cửa hàng xác nhận đã thanh toán" : "Đơn hàng chưa được thanh toán", JSON.stringify(payment), [
          { from: "client", to: "receiver", label: "Truy vấn trạng thái đơn hàng", detail: `GET /api/webhook/status?session=…` },
          { from: "receiver", to: "client", label: `200 OK · ${payment.status}`, detail: JSON.stringify(payment) },
        ]);
        if (done) {
          // Đơn đã paid trước lần thanh toán này (webhook từ lần trước): cửa hàng đã lưu ngay từ đầu.
          mark({ seen: pair + 1, updatedAt: payment.updatedAt, ...(storedKnown ? {} : { stored: 0 }) });
          setPaid(true);
          setBusy(false);
          request.current = null;
          return;
        }
      }
      throw new Error(`Cửa hàng chưa nhận được webhook sau ${(pollInterval * pollLimit) / 1000} giây.`);
    } catch (cause) {
      if (controller.signal.aborted) return;
      const message = cause instanceof Error ? cause.message : "Quá trình thanh toán mô phỏng bị gián đoạn.";
      setError(message);
      setBusy(false);
      request.current = null;
      log("error", "Không xác nhận được thanh toán", message);
    }
  }

  return (
    <div className="demo-grid">
      <section className="experiment-panel" aria-label="Thí nghiệm webhook">
        <div className="panel-topline">
          <span className="section-label">THANH TOÁN MÔ PHỎNG</span>
          <CreditCard size={19} aria-hidden="true" />
        </div>
        <div className="status-row">
          <h3 className="panel-title">Xác nhận thanh toán qua webhook</h3>
          <Status tone={phase === "error" ? "error" : phase === "done" ? "done" : phase === "running" ? "live" : "idle"}>
            {{ error: "Lỗi", done: "Hoàn thành", running: "Đang xử lý", idle: "Chờ thanh toán" }[phase]}
          </Status>
        </div>
        <div className="payment-columns">
          <section className="payment-side" aria-labelledby="provider-heading">
            <CreditCard size={22} aria-hidden="true" />
            <span className="section-label">BÊN GỬI</span>
            <h4 id="provider-heading">Nhà cung cấp</h4>
            <p className="muted">Cổng thanh toán mô phỏng</p>
            <div className="payment-state">
              <span className="hint">Tổng thanh toán</span>
              <strong className="metric-value">
                249.000 <span className="hint">₫</span>
              </strong>
            </div>
            <Button type="button" onClick={pay} disabled={busy || paid} aria-busy={busy}>
              {accepted ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <CreditCard size={16} aria-hidden="true" />
              )}
              {error
                ? "Thử lại"
                : accepted
                  ? "Đã thanh toán"
                  : busy
                    ? "Đang thanh toán…"
                    : "Thanh toán mô phỏng"}
            </Button>
            <p className="hint">
              {sent ? `Đã gửi webhook${stored && marks?.deliveryStatus ? ` · HTTP ${marks.deliveryStatus}` : ""}` : "Chưa gửi webhook"}
            </p>
          </section>
          <section className="payment-side" aria-labelledby="store-heading">
            <Store size={22} aria-hidden="true" />
            <span className="section-label">BÊN NHẬN</span>
            <h4 id="store-heading">Cửa hàng</h4>
            <p className="muted">Đơn hàng #PL-2048</p>
            <div className="payment-state">
              <span className="hint">Trạng thái đơn hàng</span>
              <strong>{stored ? "Đã thanh toán" : "Chờ thanh toán"}</strong>
            </div>
            {stored && marks?.updatedAt && (
              <time className="mono hint" dateTime={marks.updatedAt}>
                {new Date(marks.updatedAt).toLocaleTimeString("vi-VN")}
              </time>
            )}
          </section>
        </div>
        <div className="flow-strip">
          <span>Nhà cung cấp</span>
          <ArrowRight size={15} aria-hidden="true" />
          <span className="mono">HTTP POST</span>
          <ArrowRight size={15} aria-hidden="true" />
          <span>Cửa hàng</span>
        </div>
        {accepted && marks?.eventId && (
          <div className="callout">
            <span className="section-label">MÃ SỰ KIỆN</span>
            <p className="mono">{marks.eventId}</p>
          </div>
        )}
        <p className="error-text" role="alert">
          {error}
        </p>
      </section>
      <ActivityLog
        entries={entries}
        actors={[
          { id: "client", label: "Trình duyệt", role: "Client", state: seen ? "Đã nhận trạng thái paid" : phase === "running" ? "Chờ xác nhận" : "Chưa thanh toán" },
          { id: "provider", label: "Nhà cung cấp", role: "Server gửi webhook", state: sent ? "Đã gửi webhook" : accepted ? "Đã ghi nhận thanh toán" : "Chờ request" },
          { id: "receiver", label: "Cửa hàng", role: "Server nhận webhook", state: stored ? "Đã lưu trạng thái paid" : "Chờ webhook" },
        ]}
        note="Webhook được gửi giữa hai backend, tách khỏi request thanh toán; trình duyệt truy vấn trạng thái đơn hàng bằng request độc lập."
        onStep={follow}
      />
    </div>
  );
}
