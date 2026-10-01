"use client";

import { useEffect, useRef, useState } from "react";
import { Check, FileText, Play, Square } from "lucide-react";
import { z } from "zod";
import { ProgressSchema } from "@/lib/protocol-contracts";
import { ActivityLog, useActivity } from "@/components/activity-log";
import { Status } from "@/components/demo-status";
import { Button } from "@/components/ui/button";

type Progress = z.infer<typeof ProgressSchema>;
const OkSchema = z.object({ ok: z.literal(true) });

export function SseDemo({ session }: { session: string }) {
  const { entries, log } = useActivity();
  const [state, setState] = useState<"idle" | "connecting" | "running" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [steps, setSteps] = useState<Progress[]>([]);
  const [error, setError] = useState("");
  const stream = useRef<EventSource | null>(null);
  const request = useRef<AbortController | null>(null);
  const busy = state === "connecting" || state === "running";

  useEffect(
    () => () => {
      stream.current?.close();
      request.current?.abort();
    },
    [],
  );

  function stop() {
    stream.current?.close();
    stream.current = null;
    request.current?.abort();
    request.current = null;
    setState("idle");
    log("info", "Đã đóng luồng", "Client ngừng nhận tiến độ.");
  }

  async function start() {
    if (request.current) return;
    setState("connecting");
    setError("");
    setProgress(0);
    setSteps([]);
    const controller = new AbortController();
    request.current = controller;
    try {
      log("send", "Chuẩn bị tác vụ mới", "POST /api/sse · reset", [
        { from: "client", to: "server", label: "Đặt lại tác vụ", detail: 'POST /api/sse · {"action":"reset"}' },
      ]);
      const reset = await fetch("/api/sse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, action: "reset" }),
        signal: controller.signal,
      });
      if (!reset.ok) throw new Error(`Không chuẩn bị được tác vụ (HTTP ${reset.status}).`);
      OkSchema.parse(await reset.json());
      if (controller.signal.aborted) return;
    } catch (cause) {
      if (!controller.signal.aborted) {
        const message = cause instanceof Error ? cause.message : "Không chuẩn bị được tác vụ.";
        setState("error");
        setError(message);
        request.current = null;
        log("error", "Tác vụ chưa sẵn sàng", message);
      }
      return;
    }
    const source = new EventSource(`/api/sse?session=${session}`);
    stream.current = source;
    log("send", "Mở luồng tiến độ", "GET /api/sse · text/event-stream", [
      { from: "client", to: "server", label: "Mở một kết nối SSE", detail: "GET /api/sse · EventSource" },
    ]);

    function fail(message: string) {
      if (stream.current !== source) return;
      source.close();
      stream.current = null;
      controller.abort();
      request.current = null;
      setState("error");
      setError(message);
      log("error", "Tác vụ bị gián đoạn", message);
    }

    // Chờ server đăng ký subscriber trước khi yêu cầu chạy tác vụ.
    source.addEventListener(
      "ready",
      async () => {
        if (stream.current !== source) return;
        try {
          log("receive", "Luồng đã sẵn sàng", "Giữ một kết nối để nhận nhiều sự kiện.", [
            { from: "client", to: "server", label: "Đã mở luồng", detail: "GET /api/sse" },
            { from: "server", to: "client", label: "event: ready", detail: "Kết nối text/event-stream đã sẵn sàng." },
          ]);
          log("send", "Bắt đầu tạo báo cáo", "POST /api/sse", [
            { from: "server", to: "client", label: "Luồng SSE đã sẵn sàng", detail: "Kết nối GET vẫn mở." },
            { from: "client", to: "server", label: "Yêu cầu chạy bằng HTTP riêng", detail: 'POST /api/sse · {"action":"start"}' },
          ]);
          const response = await fetch("/api/sse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session, action: "start" }),
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`Không chạy được tác vụ (HTTP ${response.status}).`);
          OkSchema.parse(await response.json());
          if (stream.current === source) {
            setState("running");
            log("receive", "Server đã nhận yêu cầu chạy", "HTTP POST đã hoàn tất; SSE vẫn mở.", [
              { from: "client", to: "server", label: "Bắt đầu tạo báo cáo", detail: 'POST /api/sse · {"action":"start"}' },
              { from: "server", to: "client", label: "200 OK · chấp nhận tác vụ", detail: '{"ok":true}' },
              { from: "server", to: "server", label: "Xử lý báo cáo", detail: "Tiến độ tiếp tục gửi qua kết nối SSE đã mở." },
            ]);
          }
        } catch (cause) {
          if (!controller.signal.aborted)
            fail(cause instanceof Error ? cause.message : "Không bắt đầu được tác vụ.");
        }
      },
      { once: true },
    );

    source.addEventListener("progress", (event: MessageEvent<string>) => {
      if (stream.current !== source) return;
      try {
        const update = ProgressSchema.parse(JSON.parse(event.data));
        setProgress(update.progress);
        setSteps((items) => [...items, update].slice(-12));
        log("receive", update.step, `${update.progress}% · event: progress`, [
          { from: "server", to: "server", label: update.step, detail: `Tiến độ tác vụ: ${update.progress}%` },
          { from: "server", to: "client", label: "Đẩy event: progress trên luồng đang mở", detail: JSON.stringify(update) },
          { from: "client", to: "client", label: update.done ? "Hiển thị hoàn tất · đóng SSE" : "Cập nhật tiến độ", detail: "Không tạo GET mới cho từng sự kiện." },
        ]);
        if (update.done) {
          source.close();
          stream.current = null;
          request.current = null;
          controller.abort();
          setState("done");
          log("info", "Báo cáo đã sẵn sàng", "Đã nhận hoàn tất và đóng luồng SSE.");
        }
      } catch {
        fail("Server trả dữ liệu tiến độ không hợp lệ.");
      }
    });
    source.onerror = () => fail("Mất kết nối tới server. Bấm chạy lại để thử lại.");
  }

  return (
    <div className="demo-grid">
      <section className="experiment-panel" aria-label="Demo Server-Sent Events">
        <div className="panel-topline">
          <span className="section-label">TẠO BÁO CÁO</span>
          <FileText size={19} aria-hidden="true" />
        </div>
        <div className="status-row">
          <h3 className="panel-title">Một luồng, nhiều cập nhật.</h3>
          <Status
            tone={state === "error" ? "error" : state === "done" ? "done" : busy ? "live" : "idle"}
          >
            {
              {
                idle: "Sẵn sàng",
                connecting: "Đang kết nối",
                running: "Đang xử lý",
                done: "Hoàn thành",
                error: "Có lỗi",
              }[state]
            }
          </Status>
        </div>
        <p className="muted">
          Chạy một tác vụ trên server và theo dõi từng bước được đẩy về trình duyệt.
        </p>
        <div className="controls">
          <Button type="button" onClick={busy ? stop : start} aria-busy={state === "connecting"}>
            {busy ? <Square size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
            {busy ? "Dừng tác vụ" : state === "done" ? "Chạy lại" : "Chạy tác vụ"}
          </Button>
          <span className="hint">Server → client · cập nhật mỗi giây</span>
        </div>
        <div className="panel-divider" />
        <div className="status-row">
          <span className="section-label">TIẾN ĐỘ XỬ LÝ</span>
          <span className="metric-value mono">
            {progress}
            <span className="muted">%</span>
          </span>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="Tạo báo cáo"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="progress-fill" style={{ transform: `scaleX(${progress / 100})` }} />
        </div>
        <ol className="task-steps" aria-label="Các bước xử lý">
          {steps.map((step, index) => (
            <li className="task-step" key={index}>
              <Check size={16} aria-hidden="true" />
              <span>{step.step}</span>
              <span className="mono muted">{step.progress}%</span>
            </li>
          ))}
        </ol>
        {steps.length === 0 && (
          <div className="demo-empty">
            <FileText size={28} aria-hidden="true" />
            <p>Báo cáo tổng hợp</p>
            <span>Các bước xử lý sẽ xuất hiện khi tác vụ bắt đầu.</span>
          </div>
        )}
        <p className="hint" role="status">
          {state === "done"
            ? "Đã tạo xong báo cáo. Bạn có thể chạy lại tác vụ."
            : state === "running"
              ? "Server đang gửi tiến độ qua luồng SSE."
              : "Bấm chạy tác vụ để bắt đầu."}
        </p>
        <p className="error-text" role="alert">
          {error}
        </p>
      </section>
      <ActivityLog
        entries={entries}
        actors={[
          { id: "client", label: "Trình duyệt", role: "Client", state: busy ? "Một luồng SSE đang mở" : "Luồng đã đóng" },
          { id: "server", label: "Tạo báo cáo", role: "Server", state: `${progress}% hoàn tất` },
        ]}
        note="Client mở một GET để nghe; server đẩy nhiều event qua cùng kết nối. POST bắt đầu tác vụ là request riêng. Animation minh họa từng sự kiện, không phải thời gian truyền thực tế."
      />
    </div>
  );
}
