"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, FileText, Play, Square } from "lucide-react";
import { z } from "zod";
import { ProgressSchema } from "@/lib/protocol-contracts";
import { ActivityLog, useActivity, type FlowStep } from "@/components/activity-log";
import { readError } from "@/lib/read-error";
import { Status } from "@/components/demo-status";
import { Button } from "@/components/ui/button";

type Progress = z.infer<typeof ProgressSchema>;
// Event progress đã nhận, kèm vị trí bước tương ứng trong entry của response SSE.
type Received = { story: string; index: number; update: Progress };
const OkSchema = z.object({ ok: z.literal(true) });

export function SseDemo({ session }: { session: string }) {
  const { entries, log, extend } = useActivity();
  const [state, setState] = useState<"idle" | "connecting" | "running" | "done" | "error">("idle");
  const [received, setReceived] = useState<Received[]>([]);
  // Vị trí bước đóng kết nối trong từng entry SSE, để trạng thái client đi cùng sơ đồ.
  const [closedAt, setClosedAt] = useState<Record<string, number>>({});
  const [view, setView] = useState<{ id: string | null; step: number }>({ id: null, step: 0 });
  // Entry của lần chạy gần nhất; khi sơ đồ không hiển thị entry này, giao diện dùng trạng thái thật.
  const [latestStory, setLatestStory] = useState<string | null>(null);
  const [error, setError] = useState("");
  const stream = useRef<EventSource | null>(null);
  const request = useRef<AbortController | null>(null);
  // Entry của response SSE đang mở; mỗi event nhận được ghi tiếp vào entry này.
  const connection = useRef<string | null>(null);
  const list = useRef<HTMLOListElement | null>(null);
  const busy = state === "connecting" || state === "running";
  const follow = useCallback((id: string | null, step: number) => setView({ id, step }), []);

  // Tiến độ chỉ phản ánh các event mà sơ đồ đã phát tới, không chạy trước phần mô phỏng.
  const simulated = latestStory !== null && view.id === latestStory;
  const reached = (index: number | undefined) => index !== undefined && (!simulated || index <= view.step);
  const steps = received
    .filter((item) => item.story === latestStory && reached(item.index))
    .map((item) => item.update);
  const shown = steps[steps.length - 1];
  const progress = shown?.progress ?? 0;
  const phase = state === "error" ? "error"
    : shown?.done ? "done"
    : state === "connecting" ? "connecting"
    : state === "idle" ? "idle" : "running";
  const connectionState = latestStory === null ? "Chưa kết nối"
    : reached(closedAt[latestStory]) ? "Kết nối đã đóng"
    : !simulated || view.step >= 1 ? "Kết nối SSE đang mở" : "Đang mở kết nối";
  const markClosed = (story: string, index: number) => setClosedAt((items) => ({ ...items, [story]: index }));

  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [steps.length]);

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
    const story = connection.current;
    if (story) markClosed(story, extend(story, "info", "Đã đóng kết nối SSE", "Client chủ động đóng kết nối.", [
      { from: "client", to: "server", label: "Đóng EventSource · đóng kết nối", detail: "EventSource.close()" },
      { from: "server", to: "server", label: "Phát hiện client ngắt kết nối · hủy subscriber", detail: "request.signal: abort → hủy subscriber; không còn subscriber thì dừng tác vụ (clearInterval)" },
    ]));
    connection.current = null;
  }

  async function start() {
    if (request.current) return;
    setState("connecting");
    setError("");
    const controller = new AbortController();
    request.current = controller;
    try {
      const reset = await fetch("/api/sse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, action: "reset" }),
        signal: controller.signal,
      });
      if (!reset.ok) throw new Error(await readError(reset, `Không thể khởi tạo tác vụ (HTTP ${reset.status}).`));
      OkSchema.parse(await reset.json());
      if (controller.signal.aborted) return;
    } catch (cause) {
      if (!controller.signal.aborted) {
        const message = cause instanceof Error ? cause.message : "Không thể khởi tạo tác vụ.";
        setState("error");
        setError(message);
        request.current = null;
        log("error", "Khởi tạo tác vụ thất bại", message);
      }
      return;
    }
    const source = new EventSource(`/api/sse?session=${session}`);
    stream.current = source;
    // Cả response SSE là một entry: mỗi event là một phần server ghi thêm vào cùng response.
    const story = log("info", "Đang mở kết nối SSE", "GET /api/sse", [
      { from: "client", to: "server", label: "Mở kết nối SSE", detail: "GET /api/sse?session=…\nAccept: text/event-stream" },
    ]);
    connection.current = story;
    setLatestStory(story);
    let count = 0;
    // Trả về vị trí bước đầu tiên vừa thêm để tiến độ biết event nằm ở bước nào của sơ đồ.
    const append = (title: string, detail: string, flow: FlowStep[]) => extend(story, "receive", title, detail, flow);
    function receive(title: string, label: string, frame: string) {
      count += 1;
      return append(title, frame, [
        { from: "server", to: "client", label: `Event ${count} · ${label}`, detail: frame },
      ]);
    }

    function fail(message: string) {
      if (stream.current !== source) return;
      source.close();
      stream.current = null;
      controller.abort();
      request.current = null;
      connection.current = null;
      setState("error");
      setError(message);
      // Sau lỗi, EventSource mặc định tự kết nối lại; close() chấm dứt việc đó.
      markClosed(story, extend(story, "error", "Tác vụ bị gián đoạn", message, [
        { from: "client", to: "client", label: "Đóng EventSource · không tự kết nối lại", detail: `${message}\nEventSource.close()` },
      ]));
    }

    source.onopen = () => {
      if (stream.current !== source) return;
      append("Kết nối SSE đang mở", "200 OK · text/event-stream", [
        { from: "server", to: "client", label: "200 OK · response được giữ mở", detail: "HTTP/1.1 200 OK\nContent-Type: text/event-stream; charset=utf-8\nCache-Control: no-cache, no-transform\nConnection: keep-alive\nX-Accel-Buffering: no" },
      ]);
    };

    // Chờ server đăng ký subscriber trước khi gửi request khởi chạy tác vụ.
    source.addEventListener(
      "ready",
      async (event: MessageEvent<string>) => {
        if (stream.current !== source) return;
        receive("Kết nối SSE đang mở", "ready", `event: ready\ndata: ${event.data}`);
        try {
          append("Kết nối SSE đang mở", 'POST /api/sse · {"action":"start"}', [
            { from: "client", to: "server", label: "Gửi POST request riêng để khởi chạy tác vụ", detail: 'POST /api/sse\n{"action":"start"}' },
          ]);
          const response = await fetch("/api/sse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session, action: "start" }),
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(await readError(response, `Không thể khởi chạy tác vụ (HTTP ${response.status}).`));
          OkSchema.parse(await response.json());
          if (stream.current === source) {
            setState("running");
            append("Kết nối SSE đang mở", '{"ok":true}', [
              { from: "server", to: "client", label: "200 OK · POST request kết thúc", detail: '{"ok":true}' },
            ]);
          }
        } catch (cause) {
          if (!controller.signal.aborted)
            fail(cause instanceof Error ? cause.message : "Không thể khởi chạy tác vụ.");
        }
      },
      { once: true },
    );

    source.addEventListener("progress", (event: MessageEvent<string>) => {
      if (stream.current !== source) return;
      try {
        const update = ProgressSchema.parse(JSON.parse(event.data));
        const index = receive(`Luồng SSE · ${update.progress}%`, `progress ${update.progress}% · ${update.step}`, `event: progress\ndata: ${event.data}`);
        setReceived((items) => [...items, { story, index, update }].slice(-100));
        if (update.done) {
          source.close();
          stream.current = null;
          request.current = null;
          connection.current = null;
          controller.abort();
          setState("done");
          // Server kết thúc response sau event cuối; client đóng EventSource để không tự kết nối lại.
          markClosed(story, append("Báo cáo hoàn tất", `Đã nhận ${count} event qua một response duy nhất.`, [
            { from: "server", to: "client", label: "Server kết thúc response", detail: "Response body kết thúc ngay sau event cuối." },
            { from: "client", to: "client", label: "Đóng EventSource · không tự kết nối lại", detail: "EventSource.close()\nreadyState: CLOSED" },
          ]));
        }
      } catch {
        fail("Dữ liệu tiến độ từ server không hợp lệ.");
      }
    });
    source.onerror = () => fail("Mất kết nối tới server.");
  }

  return (
    <div className="demo-grid">
      <section className="experiment-panel" aria-label="Thí nghiệm Server-Sent Events">
        <div className="panel-topline">
          <span className="section-label">TÁC VỤ PHÍA SERVER</span>
          <FileText size={19} aria-hidden="true" />
        </div>
        <div className="status-row">
          <h3 className="panel-title">Tạo báo cáo tổng hợp</h3>
          <Status
            tone={phase === "error" ? "error" : phase === "done" ? "done" : phase === "idle" ? "idle" : "live"}
          >
            {
              {
                idle: "Sẵn sàng",
                connecting: "Đang kết nối",
                running: "Đang xử lý",
                done: "Hoàn thành",
                error: "Lỗi",
              }[phase]
            }
          </Status>
        </div>
        <div className="controls">
          <Button type="button" onClick={busy ? stop : start} aria-busy={state === "connecting"}>
            {busy ? <Square size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
            {busy ? "Dừng tác vụ" : state === "done" ? "Chạy lại tác vụ" : "Khởi chạy tác vụ"}
          </Button>
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
        <ol ref={list} className="task-steps" aria-label="Các bước xử lý">
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
            <p>Chưa có dữ liệu tiến độ</p>
          </div>
        )}
        <p className="error-text" role="alert">
          {error}
        </p>
      </section>
      <ActivityLog
        entries={entries}
        actors={[
          { id: "client", label: "Trình duyệt", role: "Client", state: connectionState },
          { id: "server", label: "Dịch vụ báo cáo", role: "Server", state: `${progress}% hoàn tất` },
        ]}
        note="Server ghi từng event vào cùng một response đang mở; POST request khởi chạy tác vụ là request độc lập."
        onStep={follow}
      />
    </div>
  );
}
