"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bell, Play, Send, Square } from "lucide-react";
import type { z } from "zod";
import { NotificationBatchSchema } from "@/lib/protocol-contracts";
import { ActivityLog, useActivity, type FlowStep } from "@/components/activity-log";
import { readError } from "@/lib/read-error";
import { Status } from "@/components/demo-status";
import { Button } from "@/components/ui/button";

type Notification = z.infer<typeof NotificationBatchSchema>["events"][number];

export function LongPollingDemo({ session }: { session: string }) {
  const { entries, log, extend } = useActivity();
  const [listening, setListening] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [text, setText] = useState("Đơn hàng #PL-2026 đã được xác nhận.");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const publishRequest = useRef<AbortController | null>(null);
  const cursor = useRef(0);
  // Entry của request GET đang được server giữ; phản hồi sẽ ghi tiếp vào đúng entry này.
  const waiting = useRef<string | null>(null);

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
    if (waiting.current) extend(waiting.current, "info", "Dừng nhận thông báo", "Request đang chờ đã bị hủy.", [
      { from: "client", to: "server", label: "Hủy request đang chờ · đóng kết nối", detail: "AbortController.abort()" },
      { from: "server", to: "server", label: "Giải phóng request đang giữ", detail: "request.signal: abort → hủy timeout 20 giây, xóa request khỏi danh sách chờ" },
    ]);
    waiting.current = null;
  }

  async function start() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setListening(true);
    setError("");
    try {
      // Chỉ hỏi tiếp sau khi request trước đã nhận dữ liệu hoặc hết 20 giây.
      for (let first = true; !controller.signal.aborted; first = false) {
        const query = `GET /api/long-polling?after=${cursor.current}`;
        // Entry "info" (không phải "send") để bảng luồng hiện cả lúc request đang được giữ.
        const id = log("info", "Đang chờ thông báo", query, [
          { from: "client", to: "server", label: first ? "Gửi request nhận thông báo" : "Gửi request kế tiếp", detail: query },
        ]);
        waiting.current = id;
        const holdStep: FlowStep = { from: "server", to: "server", label: "Chưa có thông báo sau cursor · giữ request", detail: "Server trả response khi phát sinh thông báo mới hoặc khi timeout sau 20 giây." };
        // Server chỉ giữ request khi chưa có dữ liệu; response chưa về sau 300 ms nghĩa là request đang được giữ.
        let holding = false;
        const hold = setTimeout(() => {
          holding = true;
          extend(id, "info", "Đang chờ thông báo", query, [holdStep]);
        }, 300);
        let response: Response;
        try {
          response = await fetch(`/api/long-polling?session=${session}&after=${cursor.current}`, {
            signal: controller.signal,
            cache: "no-store",
          });
        } finally {
          clearTimeout(hold);
        }
        if (!response.ok) {
          const message = await readError(response, `Server từ chối request (HTTP ${response.status}).`);
          if (controller.signal.aborted) return;
          // Cursor vượt trạng thái server (server khởi động lại): lần nhận sau bắt đầu lại từ 0.
          if (response.status === 409) {
            cursor.current = 0;
            // ID thông báo phía server bắt đầu lại từ 1; bỏ danh sách cũ để không trùng.
            setNotifications([]);
          }
          waiting.current = null;
          setError(message);
          extend(id, "error", `HTTP ${response.status} · dừng nhận thông báo`, message, [
            { from: "server", to: "client", label: `${response.status} · request bị từ chối`, detail: message },
            { from: "client", to: "client", label: "Dừng nhận thông báo", detail: message },
          ]);
          return;
        }
        const batch = NotificationBatchSchema.parse(await response.json());
        if (controller.signal.aborted) return;
        waiting.current = null;
        cursor.current = batch.cursor;
        const held = batch.held && !holding ? [holdStep] : [];
        if (batch.events.length) {
          setNotifications((items) => [...batch.events.slice().reverse(), ...items].slice(0, 50));
          const texts = batch.events.map((item) => item.text).join("\n");
          extend(id, "receive", `${batch.events.length} thông báo mới`, JSON.stringify(batch), [
            ...held,
            batch.held
              ? { from: "server", to: "server", label: "Phát sinh thông báo mới · kết thúc giữ request", detail: texts }
              : { from: "server", to: "server", label: "Đã có thông báo sau cursor · trả response ngay", detail: texts },
            { from: "server", to: "client", label: `200 OK · ${batch.events.length} thông báo`, detail: JSON.stringify(batch) },
            { from: "client", to: "client", label: "Hiển thị thông báo · gửi request kế tiếp", detail: "Response kết thúc request hiện tại; client lập tức gửi request mới." },
          ]);
        } else if (batch.timedOut) {
          extend(id, "receive", "Timeout", "Không có thông báo mới trong 20 giây.", [
            ...held,
            { from: "server", to: "client", label: "200 OK · timeout, không có thông báo mới", detail: JSON.stringify(batch) },
            { from: "client", to: "client", label: "Gửi request kế tiếp", detail: "Timeout là response hợp lệ, không phải lỗi." },
          ]);
        } else {
          extend(id, "receive", "Không có thông báo mới", JSON.stringify(batch), [
            ...held,
            { from: "server", to: "client", label: "200 OK · không có thông báo mới", detail: JSON.stringify(batch) },
          ]);
        }
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        const message = cause instanceof Error ? cause.message : "Không thể kết nối tới server.";
        setError(message);
        if (waiting.current) extend(waiting.current, "error", "Kết nối bị gián đoạn", message, [
          { from: "client", to: "client", label: "Request thất bại · dừng nhận thông báo", detail: message },
        ]);
        else log("error", "Kết nối bị gián đoạn", message);
        waiting.current = null;
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
      // Phần giả lập phía server: không vẽ thành luồng riêng, thông báo đi về qua request GET đang được giữ.
      const response = await fetch("/api/long-polling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, action: "publish", text: text.trim() }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await readError(response, `Không thể tạo thông báo (HTTP ${response.status}).`));
      NotificationBatchSchema.parse(await response.json());
      if (!controller.signal.aborted)
        log("info", "Server phát sinh thông báo mới", text.trim());
    } catch (cause) {
      if (!controller.signal.aborted) {
        const message = cause instanceof Error ? cause.message : "Không thể tạo thông báo.";
        setError(message);
        log("error", "Tạo thông báo thất bại", message);
      }
    } finally {
      if (!controller.signal.aborted) setPublishing(false);
      if (publishRequest.current === controller) publishRequest.current = null;
    }
  }

  return (
    <div className="demo-grid">
      <section className="experiment-panel" aria-label="Thí nghiệm long polling">
        <div className="panel-topline">
          <span className="section-label">HỘP THƯ THÔNG BÁO</span>
          <Bell size={19} aria-hidden="true" />
        </div>
        <div className="status-row">
          <h3 className="panel-title">Thông báo đã nhận</h3>
          <Status tone={error ? "error" : listening ? "live" : "idle"}>
            {error ? "Lỗi" : listening ? "Đang chờ" : "Chưa kết nối"}
          </Status>
        </div>
        <div className="controls">
          <Button type="button" onClick={listening ? stop : start}>
            {listening ? (
              <Square size={15} aria-hidden="true" />
            ) : (
              <Play size={15} aria-hidden="true" />
            )}
            {listening ? "Dừng nhận thông báo" : "Bắt đầu nhận thông báo"}
          </Button>
        </div>
        <div className="notification-list" aria-label="Thông báo đã nhận">
          {notifications.length === 0 ? (
            <div className="demo-empty">
              <Bell size={27} aria-hidden="true" />
              <p>Chưa có thông báo</p>
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
        <div className="panel-divider" />
        <form onSubmit={publish} aria-busy={publishing}>
          <label className="section-label" htmlFor="notification-text">
            MÔ PHỎNG PHÍA SERVER
          </label>
          <div className="form-field">
            <input
              className="input"
              id="notification-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={200}
              required
            />
            <Button type="submit" variant="outline" disabled={publishing || !text.trim()}>
              <Send size={15} aria-hidden="true" />
              {publishing ? "Đang tạo…" : "Tạo thông báo"}
            </Button>
          </div>
        </form>
        <p className="error-text" role="alert">
          {error}
        </p>
      </section>
      <ActivityLog
        entries={entries}
        actors={[
          { id: "client", label: "Hộp thư", role: "Client", state: listening ? "Một request đang chờ" : "Đã dừng nhận" },
          { id: "server", label: "Dịch vụ thông báo", role: "Server", state: listening ? "Chờ sự kiện hoặc timeout" : "Sẵn sàng" },
        ]}
        note="Timeout tối đa 20 giây. Tại mỗi thời điểm chỉ tồn tại một request đang chờ."
        sequential
      />
    </div>
  );
}
