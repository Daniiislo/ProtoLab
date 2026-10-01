"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, CreditCard, Store } from "lucide-react";
import type { z } from "zod";
import { DeliverySchema, PaymentSchema } from "@/lib/protocol-contracts";
import { ActivityLog, useActivity } from "@/components/activity-log";
import { Status } from "@/components/demo-status";
import { Button } from "@/components/ui/button";

type Payment = z.infer<typeof PaymentSchema>;
type Delivery = z.infer<typeof DeliverySchema>;

export function WebhookDemo({ session }: { session: string }) {
  const { entries, log } = useActivity();
  const [payment, setPayment] = useState<Payment>({
    status: "pending",
    eventId: null,
    updatedAt: null,
  });
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      request.current?.abort();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function pay() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");

    function fail(cause: unknown) {
      if (controller.signal.aborted) return;
      const message = cause instanceof Error ? cause.message : "Thanh toán giả lập bị gián đoạn.";
      setError(message);
      setBusy(false);
      request.current = null;
      log("error", "Chưa xác nhận được thanh toán", message);
    }

    async function readStatus(attempt: number, receipt: Delivery) {
      if (controller.signal.aborted) return;
      try {
        log("send", "Trình duyệt đọc trạng thái đơn", "GET /api/webhook/status · HTTP polling riêng", [
          { from: "client", to: "receiver", label: "Hỏi trạng thái cửa hàng", detail: "GET /api/webhook/status · request riêng với webhook" },
        ]);
        const response = await fetch(`/api/webhook/status?session=${session}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok)
          throw new Error(`Không đọc được trạng thái đơn (HTTP ${response.status}).`);
        const updated = PaymentSchema.parse(await response.json());
        if (controller.signal.aborted) return;
        setPayment(updated);
        if (updated.status === "paid") {
          setBusy(false);
          request.current = null;
          log("receive", "Cửa hàng xác nhận đã thanh toán", JSON.stringify(updated), [
            { from: "client", to: "provider", label: "Yêu cầu thanh toán giả lập", detail: 'POST /api/webhook/provider · {"action":"pay"}' },
            { from: "provider", to: "receiver", label: "Gửi webhook bằng HTTP POST", detail: JSON.stringify({ eventId: receipt.eventId, type: "payment.succeeded" }) },
            { from: "receiver", to: "receiver", label: "Kiểm tra webhook · cập nhật đơn", detail: "Receiver kiểm tra secret, validate payload và lưu trạng thái paid." },
            { from: "receiver", to: "provider", label: `HTTP ${receipt.deliveryStatus} · xác nhận đã nhận`, detail: "Phản hồi này là giữa hai backend." },
            { from: "provider", to: "client", label: "Trả biên nhận gửi webhook", detail: JSON.stringify(receipt) },
            { from: "client", to: "receiver", label: "Đọc trạng thái bằng request riêng", detail: "GET /api/webhook/status" },
            { from: "receiver", to: "client", label: "200 OK · đã thanh toán", detail: JSON.stringify(updated) },
          ]);
        } else if (attempt >= 10) {
          throw new Error("Chưa nhận được xác nhận sau 5 giây. Bấm thử lại.");
        } else {
          timer.current = setTimeout(() => {
            void readStatus(attempt + 1, receipt);
          }, 500);
        }
      } catch (cause) {
        fail(cause);
      }
    }

    try {
      log("send", "Yêu cầu thanh toán giả lập", "POST /api/webhook/provider", [
        { from: "client", to: "provider", label: "Yêu cầu thanh toán giả lập", detail: 'POST /api/webhook/provider · {"action":"pay"}' },
      ]);
      const response = await fetch("/api/webhook/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, action: "pay" }),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(`Provider chưa gửi được webhook (HTTP ${response.status}).`);
      const result = DeliverySchema.parse(await response.json());
      if (controller.signal.aborted) return;
      setDelivery(result);
      log(
        "receive",
        "Provider đã gửi webhook tới cửa hàng",
        `POST /api/webhook/receiver → HTTP ${result.deliveryStatus} · ${result.eventId}`,
        [
          { from: "client", to: "provider", label: "Yêu cầu thanh toán", detail: "POST /api/webhook/provider" },
          { from: "provider", to: "receiver", label: "Gửi webhook đến cửa hàng", detail: `POST /api/webhook/receiver · eventId: ${result.eventId}` },
          { from: "receiver", to: "provider", label: `HTTP ${result.deliveryStatus} · đã nhận`, detail: "Biên nhận do provider trả về xác nhận bước này." },
          { from: "provider", to: "client", label: "Trả kết quả gửi webhook", detail: JSON.stringify(result) },
        ],
      );
      await readStatus(1, result);
    } catch (cause) {
      fail(cause);
    }
  }

  const paid = payment.status === "paid";
  return (
    <div className="demo-grid">
      <section className="experiment-panel" aria-label="Demo webhook">
        <div className="panel-topline">
          <span className="section-label">THANH TOÁN GIẢ LẬP</span>
          <CreditCard size={19} aria-hidden="true" />
        </div>
        <div className="status-row">
          <h3 className="panel-title">Hai hệ thống, một sự kiện.</h3>
          <Status tone={error ? "error" : paid ? "done" : busy ? "live" : "idle"}>
            {error ? "Có lỗi" : paid ? "Hoàn thành" : busy ? "Đang xử lý" : "Chờ thanh toán"}
          </Status>
        </div>
        <p className="muted">
          Nhà cung cấp nhận thanh toán rồi gửi webhook cho cửa hàng để xác nhận đơn.
        </p>
        <div className="payment-columns">
          <section className="payment-side" aria-labelledby="provider-heading">
            <CreditCard size={22} aria-hidden="true" />
            <span className="section-label">BÊN GỬI</span>
            <h4 id="provider-heading">Nhà cung cấp</h4>
            <p className="muted">Cổng thanh toán demo</p>
            <div className="payment-state">
              <span className="hint">Tổng thanh toán</span>
              <strong className="metric-value">
                249.000 <span className="hint">₫</span>
              </strong>
            </div>
            <Button type="button" onClick={pay} disabled={busy || paid} aria-busy={busy}>
              {paid ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <CreditCard size={16} aria-hidden="true" />
              )}
              {paid
                ? "Đã thanh toán"
                : busy
                  ? "Đang thanh toán…"
                  : error
                    ? "Thử lại"
                    : "Thanh toán giả lập"}
            </Button>
            <p className="hint">
              {delivery ? `Đã gửi webhook · HTTP ${delivery.deliveryStatus}` : "Chưa gửi webhook"}
            </p>
          </section>
          <section className="payment-side" aria-labelledby="store-heading">
            <Store size={22} aria-hidden="true" />
            <span className="section-label">BÊN NHẬN</span>
            <h4 id="store-heading">Cửa hàng</h4>
            <p className="muted">Đơn hàng #PL-2048</p>
            <div className="payment-state">
              <span className="hint">Trạng thái đơn</span>
              <strong>{paid ? "Đã thanh toán" : "Chờ thanh toán"}</strong>
            </div>
            <p className="hint">
              {paid
                ? "Webhook đã được tiếp nhận và đơn hàng đã được cập nhật."
                : "Đơn được cập nhật sau khi backend nhận webhook."}
            </p>
            {payment.updatedAt && (
              <time className="mono hint" dateTime={payment.updatedAt}>
                {new Date(payment.updatedAt).toLocaleTimeString("vi-VN")}
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
        {delivery && (
          <div className="callout">
            <span className="section-label">MÃ SỰ KIỆN</span>
            <p className="mono">{delivery.eventId}</p>
          </div>
        )}
        <p className="hint">
          Webhook truyền giữa hai backend. Trình duyệt đọc trạng thái cửa hàng qua HTTP riêng sau
          khi nhà cung cấp gửi xong.
        </p>
        <p className="error-text" role="alert">
          {error}
        </p>
      </section>
      <ActivityLog
        entries={entries}
        actors={[
          { id: "client", label: "Trình duyệt", role: "Client", state: busy ? "Đang chờ xác nhận" : paid ? "Đã thấy đơn thanh toán" : "Chưa thanh toán" },
          { id: "provider", label: "Nhà cung cấp", role: "Server gửi", state: delivery ? "Đã gửi webhook" : "Chờ yêu cầu" },
          { id: "receiver", label: "Cửa hàng", role: "Server nhận", state: paid ? "Đã lưu paid" : "Chờ webhook" },
        ]}
        note="Webhook là HTTP giữa hai backend. Trình duyệt đọc trạng thái qua request riêng. Luồng được dựng từ biên nhận và phản hồi thực tế; animation minh họa thứ tự, không phải thời gian truyền."
      />
    </div>
  );
}
