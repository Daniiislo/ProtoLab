"use client";

import { useEffect, useState } from "react";
import { ArrowRight, RotateCcw, ArrowLeftRight, Bell, Cable, RefreshCw, Waves } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { SessionSchema } from "@/lib/protocol-contracts";
import { PollingDemo } from "@/components/demos/polling-demo";
import { LongPollingDemo } from "@/components/demos/long-polling-demo";
import { SseDemo } from "@/components/demos/sse-demo";
import { WebSocketDemo } from "@/components/demos/websocket-demo";
import { WebhookDemo } from "@/components/demos/webhook-demo";

const protocols = [
  {
    id: "polling",
    name: "Polling",
    icon: RefreshCw,
    title: "Truy vấn định kỳ trạng thái đơn hàng",
    description:
      "Client gửi request theo chu kỳ cố định; server trả response chứa trạng thái hiện tại cho từng request.",
    badge: "HTTP · ĐỊNH KỲ",
    direction: "Client gửi request",
    destination: "Server trả response",
    component: PollingDemo,
  },
  {
    id: "long-polling",
    name: "Long polling",
    icon: Bell,
    title: "Giữ request chờ thông báo",
    description:
      "Nếu chưa có thông báo mới, server giữ request cho đến khi phát sinh thông báo hoặc timeout; client gửi request kế tiếp ngay sau mỗi response.",
    badge: "HTTP · GIỮ REQUEST",
    direction: "Client gửi request chờ",
    destination: "Server trả response khi có sự kiện hoặc timeout",
    component: LongPollingDemo,
  },
  {
    id: "sse",
    name: "SSE",
    icon: Waves,
    title: "Truyền tiến độ qua luồng sự kiện",
    description:
      "Client gửi một GET request; server giữ response mở và ghi lần lượt từng event tiến độ vào response đó cho đến khi tác vụ hoàn tất.",
    badge: "HTTP · EVENT STREAM",
    direction: "Server đẩy sự kiện",
    destination: "Client tiếp nhận",
    component: SseDemo,
  },
  {
    id: "websocket",
    name: "WebSocket",
    icon: ArrowLeftRight,
    title: "Giao tiếp hai chiều trên một kết nối",
    description:
      "Client và server trao đổi thông điệp theo cả hai chiều trên một kết nối được duy trì liên tục.",
    badge: "WS · HAI CHIỀU",
    direction: "Client gửi & nhận",
    destination: "Server gửi & nhận",
    component: WebSocketDemo,
  },
  {
    id: "webhook",
    name: "Webhook",
    icon: Cable,
    title: "Thông báo sự kiện giữa hai hệ thống",
    description:
      "Khi phát sinh sự kiện, hệ thống nguồn gửi HTTP POST request tới endpoint đã đăng ký của hệ thống đích.",
    badge: "HTTP POST · SERVER → SERVER",
    direction: "Nhà cung cấp",
    destination: "Backend cửa hàng",
    component: WebhookDemo,
  },
];

export function ProtocolTabs() {
  const [active, setActive] = useState("polling");
  const [session, setSession] = useState("");
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requested = query.get("tab");
    if (requested && protocols.some((p) => p.id === requested)) setActive(requested);
    const room = SessionSchema.safeParse(query.get("room"));
    setSession(room.success ? room.data : crypto.randomUUID());
  }, []);
  function changeTab(value: string) {
    setActive(value);
    setSession(crypto.randomUUID());
    window.history.replaceState(null, "", `/?tab=${value}`);
  }
  function reset() {
    setSession(crypto.randomUUID());
    window.history.replaceState(null, "", `/?tab=${active}`);
  }
  return (
    <Tabs value={active} onValueChange={changeTab} activationMode="manual">
      <TabsList aria-label="Chọn giao thức">
        {protocols.map((protocol, index) => (
          <TabsTrigger key={protocol.id} value={protocol.id}>
            <span className="tab-index mono" aria-hidden="true">0{index + 1}</span>
            <protocol.icon size={17} aria-hidden="true" />
            <span>{protocol.name}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {protocols.map((protocol, index) => (
        <TabsContent key={protocol.id} value={protocol.id}>
          <div className="experiment-heading">
            <div>
              <div className="eyebrow">
                <span className="experiment-number mono">THÍ NGHIỆM 0{index + 1}</span>
                <span className="eyebrow-divider" />
                <span>{protocol.badge}</span>
              </div>
              <h2>{protocol.title}</h2>
              <p className="experiment-description">{protocol.description}</p>
            </div>
            <Button variant="outline" onClick={reset} disabled={!session}>
              <RotateCcw size={15} />
              Đặt lại
            </Button>
          </div>
          <div className="connection-strip">
            <span className="connection-label">LUỒNG KẾT NỐI</span>
            <span>{protocol.direction}</span>
            {protocol.id === "websocket" ? (
              <ArrowLeftRight size={18} aria-hidden="true" />
            ) : (
              <ArrowRight size={18} aria-hidden="true" />
            )}
            <span>{protocol.destination}</span>
            <span className="connection-note">localhost · dữ liệu mô phỏng</span>
          </div>
          {session ? (
            <protocol.component key={session} session={session} />
          ) : (
            <div className="preparing" role="status">
              Đang khởi tạo phiên…
            </div>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
