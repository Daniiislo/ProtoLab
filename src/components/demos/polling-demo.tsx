"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCheck,
  Package,
  Play,
  ShoppingBag,
  Square,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Status } from "@/components/demo-status";
import { ActivityLog, useActivity } from "@/components/activity-log";
import { OrderSchema, type Order } from "@/lib/protocol-contracts";

const steps = ["Đã tiếp nhận", "Đang chuẩn bị", "Đang giao hàng", "Đã giao hàng"];
const stepIcons = [ShoppingBag, Package, Truck, CheckCheck];

export function PollingDemo({ session }: { session: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [serverStep, setServerStep] = useState(0);
  const [running, setRunning] = useState(false);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState("");
  const [requests, setRequests] = useState(0);
  const [receivedAt, setReceivedAt] = useState("—");
  const mutations = useRef<AbortController | null>(null);
  // Trạng thái client nhận được ở lần truy vấn trước, để phân biệt response có thay đổi hay không.
  const seen = useRef<number | null>(null);
  const { entries, log } = useActivity();

  useEffect(() => () => mutations.current?.abort(), []);
  useEffect(() => {
    if (!running) return;
    const abort = new AbortController();
    let busy = false;
    async function poll() {
      if (busy || abort.signal.aborted) return;
      busy = true;
      log("send", "GET /api/polling", "Truy vấn trạng thái đơn hàng", [
        { from: "client", to: "server", label: "Gửi request truy vấn trạng thái", detail: "GET /api/polling · đang chờ response" },
      ]);
      setRequests((count) => count + 1);
      try {
        const response = await fetch(`/api/polling?session=${session}`, {
          cache: "no-store",
          signal: abort.signal,
        });
        if (!response.ok) throw new Error(`Không thể truy xuất đơn hàng (HTTP ${response.status}).`);
        const nextOrder = OrderSchema.parse(await response.json());
        if (abort.signal.aborted) return;
        setOrder(nextOrder);
        setReceivedAt(new Date().toLocaleTimeString("vi-VN", { hour12: false }));
        // Phần lớn chu kỳ polling trả về dữ liệu không đổi: đó là chi phí đặc trưng của cơ chế này.
        const previous = seen.current;
        seen.current = nextOrder.step;
        const unchanged = previous === nextOrder.step;
        const result = previous === null ? "trạng thái hiện tại" : unchanged ? "trạng thái không đổi" : "trạng thái mới";
        log("receive", `200 OK · ${unchanged ? "không đổi · " : ""}${steps[nextOrder.step]}`, JSON.stringify(nextOrder), [
          { from: "client", to: "server", label: "Gửi request truy vấn trạng thái", detail: "GET /api/polling" },
          { from: "server", to: "server", label: "Truy xuất trạng thái hiện tại", detail: steps[nextOrder.step] },
          { from: "server", to: "client", label: `200 OK · ${result}`, detail: JSON.stringify(nextOrder) },
          {
            from: "client", to: "client",
            label: nextOrder.step === 3 ? "Đơn hàng hoàn tất · dừng truy vấn"
              : unchanged ? "Không có dữ liệu mới · chờ chu kỳ kế tiếp" : "Cập nhật giao diện · chờ chu kỳ kế tiếp",
            detail: "Mỗi chu kỳ tương ứng với một HTTP request độc lập.",
          },
        ]);
        if (nextOrder.step === 3) {
          setRunning(false);
          log("info", "Đơn hàng hoàn tất · kết thúc theo dõi");
        }
      } catch (cause) {
        if (abort.signal.aborted) return;
        const message = cause instanceof Error ? cause.message : "Kết nối thất bại.";
        setError(message);
        setRunning(false);
        log("error", message);
      } finally {
        busy = false;
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      clearInterval(timer);
      abort.abort();
    };
  }, [running, session, log]);

  async function advance() {
    const abort = new AbortController();
    mutations.current = abort;
    setChanging(true);
    setError("");
    try {
      const response = await fetch("/api/polling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, action: "advance" }),
        signal: abort.signal,
      });
      if (!response.ok) throw new Error(`Cập nhật thất bại (HTTP ${response.status}).`);
      const result = OrderSchema.parse(await response.json());
      if (abort.signal.aborted) return;
      // Chỉ cập nhật vùng cửa hàng. Vùng khách hàng phải đợi GET kế tiếp.
      // Thao tác của cửa hàng là thay đổi nội bộ phía server, không phải trao đổi với khách hàng.
      setServerStep(result.step);
      log("info", `Server đã cập nhật: ${steps[result.step]}`, JSON.stringify(result), [
        { from: "server", to: "server", label: "Cửa hàng cập nhật trạng thái đơn hàng", detail: JSON.stringify(result) },
      ]);
    } catch (cause) {
      if (abort.signal.aborted) return;
      const message = cause instanceof Error ? cause.message : "Cập nhật thất bại.";
      setError(message);
      log("error", message);
    } finally {
      if (!abort.signal.aborted) setChanging(false);
    }
  }

  const observedStep = order?.step ?? 0;
  const tone = error ? "error" : running ? "live" : observedStep === 3 ? "done" : "idle";
  return (
    <div className="demo-grid">
      <section className="experiment-panel" aria-label="Thí nghiệm polling">
        <div className="panel-topline">
          <span className="section-label">01 / PHÍA KHÁCH HÀNG</span>
          <Status tone={tone}>
            {error
              ? "Lỗi kết nối"
              : running
                ? "Đang theo dõi"
                : observedStep === 3
                  ? "Đã hoàn thành"
                  : "Chưa kết nối"}
          </Status>
        </div>
        <div className="order-identity">
          <div className="order-icon">
            <Package size={30} strokeWidth={1.4} aria-hidden="true" />
          </div>
          <div>
            <span className="muted">ĐƠN HÀNG MẪU</span>
            <h3 className="panel-title">Đơn hàng #PL-2026</h3>
            <span className="mono order-code">02 sản phẩm</span>
          </div>
        </div>
        <div className="order-summary">
          <span>Cà phê Arabica · 250g × 2</span>
          <strong>320.000 ₫</strong>
        </div>
        <ol className="order-steps" aria-label="Tiến trình đơn hàng">
          {steps.map((step, index) => {
            const Icon = stepIcons[index]!;
            return (
              <li
                key={step}
                className={index <= observedStep ? "step-reached" : ""}
                aria-current={index === observedStep ? "step" : undefined}
              >
                <span className="step-marker">
                  {index < observedStep ? (
                    <Check size={18} aria-hidden="true" />
                  ) : (
                    <Icon size={18} aria-hidden="true" />
                  )}
                </span>
                <span>{step}</span>
                {index === observedStep && <span className="current-step">Hiện tại</span>}
              </li>
            );
          })}
        </ol>
        <div className="polling-metrics">
          <div className="metric">
            <span className="metric-label">CHU KỲ TRUY VẤN</span>
            <span className="metric-value">
              2<span>giây</span>
            </span>
          </div>
          <div className="metric">
            <span className="metric-label">SỐ REQUEST ĐÃ GỬI</span>
            <span className="metric-value mono">{requests.toString().padStart(2, "0")}</span>
          </div>
          <div className="metric">
            <span className="metric-label">RESPONSE GẦN NHẤT</span>
            <span className="metric-time mono">{receivedAt}</span>
          </div>
        </div>
        <div className="controls">
          <Button
            onClick={() => {
              setError("");
              setRunning((value) => !value);
              log("info", running ? "Dừng polling" : "Bắt đầu polling (chu kỳ 2 giây)");
            }}
            disabled={observedStep === 3}
          >
            {running ? <Square size={15} /> : <Play size={15} />}
            {running ? "Dừng theo dõi" : "Bắt đầu theo dõi"}
          </Button>
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="simulator">
          <div className="panel-topline">
            <span className="section-label">02 / MÔ PHỎNG PHÍA CỬA HÀNG</span>
            <span className="mono server-label">SERVER</span>
          </div>
          <div className="simulator-content">
            <div>
              <strong>{steps[serverStep]}</strong>
            </div>
            <Button
              variant="outline"
              onClick={() => void advance()}
              disabled={changing || serverStep === 3}
              aria-busy={changing}
            >
              {changing ? "Đang cập nhật…" : "Chuyển trạng thái"}
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </section>
      <ActivityLog
        entries={entries}
        actors={[
          { id: "client", label: "Khách hàng", role: "Client", state: running ? "Truy vấn mỗi 2 giây" : "Đã dừng truy vấn" },
          { id: "server", label: "Cửa hàng", role: "Server", state: steps[Math.max(serverStep, observedStep)] },
        ]}
        note="Chu kỳ truy vấn 2 giây. Server trả về trạng thái hiện tại kể cả khi dữ liệu không thay đổi."
      />
    </div>
  );
}
