"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bell, Play, Send, Square } from "lucide-react";
import type { z } from "zod";
import { NotificationBatchSchema } from "@/lib/protocol-contracts";
import { ActivityLog, useActivity } from "@/components/activity-log";
import { Status } from "@/components/demo-status";
import { Button } from "@/components/ui/button";

type Notification = z.infer<typeof NotificationBatchSchema>["events"][number];

export function LongPollingDemo({ session }: { session: string }) {
  const { entries, log } = useActivity();
  const [listening, setListening] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [text, setText] = useState("Đơn hàng của bạn đã sẵn sàng!");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const publishRequest = useRef<AbortController | null>(null);
  const cursor = useRef(0);

  useEffect(
    () => () => {
      request.current?.abort();
      publishRequest.current?.abort();
    },
    [],
  );

  function stop() {
    request.current?.abort();
    request.current = null;
    setListening(false);
    log("info", "Đã dừng nhận", "Request đang chờ đã được hủy.");
  }

  async function start() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setListening(true);
    setError("");
    let previousBatch: z.infer<typeof NotificationBatchSchema> | null = null;
    try {
      // Chỉ hỏi tiếp sau khi request trước đã nhận dữ liệu hoặc hết 20 giây.
      while (!controller.signal.aborted) {
        log("send", "Đang chờ thông báo", `GET /api/long-polling · after=${cursor.current}`, [
          ...(previousBatch ? [{ from: "server", to: "client", label: previousBatch.timedOut ? "Request trước đã hết 20 giây chờ" : "Đã trả thông báo qua request trước", detail: JSON.stringify(previousBatch) }] : []),
          { from: "client", to: "server", label: previousBatch ? "Mở request kế tiếp" : "Mở request nhận thông báo", detail: `GET /api/long-polling · after=${cursor.current}` },
          { from: "server", to: "server", label: "Giữ request khi chưa có tin", detail: "Cơ chế: trả lời khi có sự kiện hoặc sau tối đa 20 giây." },
        ]);
        const response = await fetch(
          `/api/long-polling?session=${session}&after=${cursor.current}`,
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );
        if (!response.ok) throw new Error(`Không nhận được thông báo (HTTP ${response.status}).`);
        const batch = NotificationBatchSchema.parse(await response.json());
        if (controller.signal.aborted) return;
        cursor.current = batch.cursor;
        previousBatch = batch;
        if (batch.events.length) {
          setNotifications((items) => [...batch.events.slice().reverse(), ...items].slice(0, 50));
          log("receive", `${batch.events.length} thông báo mới`, JSON.stringify(batch), [
            { from: "server", to: "server", label: "Có thông báo · kết thúc chờ", detail: "Server dùng request đang mở để trả sự kiện." },
            { from: "server", to: "client", label: `200 OK · ${batch.events.length} thông báo`, detail: JSON.stringify(batch) },
            { from: "client", to: "client", label: "Cập nhật hộp thư", detail: "Client sẽ mở một request mới để tiếp tục chờ." },
          ]);
        } else if (batch.timedOut) {
          log("receive", "Hết 20 giây chờ", "Chưa có sự kiện. Client sẽ mở request tiếp theo.", [
            { from: "server", to: "client", label: "200 OK · hết thời gian chờ", detail: JSON.stringify(batch) },
            { from: "client", to: "client", label: "Chuẩn bị hỏi tiếp", detail: "Timeout là một phản hồi bình thường, không phải lỗi." },
          ]);
        } else {
          log("info", "Phiên đã được đặt lại", "Client tiếp tục chờ sự kiện mới.");
        }
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        const message = cause instanceof Error ? cause.message : "Không thể kết nối. Hãy thử lại.";
        setError(message);
        log("error", "Kết nối bị gián đoạn", message);
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setListening(false);
      }
    }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim() || publishRequest.current) return;
    const controller = new AbortController();
    publishRequest.current = controller;
    setPublishing(true);
    setError("");
    try {
      log("send", "Tạo sự kiện trên server", "POST /api/long-polling", [
        { from: "client", to: "server", label: "Giả lập một sự kiện mới", detail: JSON.stringify({ action: "publish", text: text.trim() }) },
      ]);
      const response = await fetch("/api/long-polling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, action: "publish", text: text.trim() }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Không tạo được thông báo (HTTP ${response.status}).`);
      NotificationBatchSchema.parse(await response.json());
      if (!controller.signal.aborted)
        log("info", "Server đã có sự kiện", "Thông báo được chuyển qua request đang chờ.");
    } catch (cause) {
      if (!controller.signal.aborted) {
        const message = cause instanceof Error ? cause.message : "Không tạo được thông báo.";
        setError(message);
        log("error", "Gửi thất bại", message);
      }
    } finally {
      if (!controller.signal.aborted) setPublishing(false);
      if (publishRequest.current === controller) publishRequest.current = null;
    }
  }

  return (
    <div className="demo-grid">
      <section className="experiment-panel" aria-label="Demo long polling">
        <div className="panel-topline">
          <span className="section-label">HỘP THƯ CỦA BẠN</span>
          <Bell size={19} aria-hidden="true" />
        </div>
        <div className="status-row">
          <h3 className="panel-title">Chờ một tin mới.</h3>
          <Status tone={error ? "error" : listening ? "live" : "idle"}>
            {error ? "Có lỗi" : listening ? "Đang chờ" : "Chưa kết nối"}
          </Status>
        </div>
        <p className="muted">
          Bật nhận thông báo, rồi tạo một sự kiện ở phía dưới. Hộp thư sẽ cập nhật ngay khi server
          có tin.
        </p>
        <div className="controls">
          <Button type="button" onClick={listening ? stop : start}>
            {listening ? (
              <Square size={15} aria-hidden="true" />
            ) : (
              <Play size={15} aria-hidden="true" />
            )}
            {listening ? "Dừng nhận" : "Bắt đầu nhận"}
          </Button>
          <span className="hint">Thời gian chờ tối đa: 20 giây</span>
        </div>
        <div className="notification-list" aria-label="Thông báo đã nhận">
          {notifications.length === 0 ? (
            <div className="demo-empty">
              <Bell size={27} aria-hidden="true" />
              <p>Hộp thư đang trống</p>
              <span>Thông báo mới sẽ xuất hiện ở đây.</span>
            </div>
          ) : (
            <ul>
              {notifications.map((item) => (
                <li className="notification" key={item.id}>
                  <span className="mono">#{String(item.id).padStart(2, "0")}</span>
                  <div>
                    <p>{item.text}</p>
                    <time className="hint" dateTime={item.createdAt}>
                      {new Date(item.createdAt).toLocaleTimeString("vi-VN")}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="hint" role="status">
          {notifications.length > 0
            ? `Đã nhận ${notifications.length} thông báo trong phiên này.`
            : "Chưa có thông báo."}
        </p>
        <div className="panel-divider" />
        <form onSubmit={publish} aria-busy={publishing}>
          <label className="section-label" htmlFor="notification-text">
            GIẢ LẬP PHÍA SERVER
          </label>
          <div className="form-field">
            <input
              className="input"
              id="notification-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={200}
              required
              aria-describedby="notification-help"
            />
            <Button type="submit" variant="outline" disabled={publishing || !text.trim()}>
              <Send size={15} aria-hidden="true" />
              {publishing ? "Đang tạo…" : "Tạo thông báo"}
            </Button>
          </div>
          <p className="hint" id="notification-help">
            Mỗi lần tạo sẽ đánh thức request đang chờ của client.
          </p>
        </form>
        <p className="error-text" role="alert">
          {error}
        </p>
      </section>
      <ActivityLog
        entries={entries}
        actors={[
          { id: "client", label: "Hộp thư", role: "Client", state: listening ? "Một request đang mở" : "Đã dừng nhận" },
          { id: "server", label: "Thông báo", role: "Server", state: listening ? "Chờ sự kiện hoặc timeout" : "Sẵn sàng" },
        ]}
        note="Client chỉ hỏi tiếp sau khi request trước kết thúc. Server giữ request tối đa 20 giây; bước chờ mô tả cơ chế, không phải dữ liệu giám sát nội bộ server."
      />
    </div>
  );
}
