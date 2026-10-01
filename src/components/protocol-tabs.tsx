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
    title: "Đơn hàng đang ở đâu?",
    description:
      "Client hỏi định kỳ. Server trả lời mỗi lần. Thử đổi trạng thái đơn để thấy khoảng chờ giữa hai lần kiểm tra.",
    badge: "HTTP · ĐỊNH KỲ",
    direction: "Client hỏi",
    destination: "Server trả lời",
    component: PollingDemo,
  },
  {
    id: "long-polling",
    name: "Long polling",
    icon: Bell,
    title: "Có tin mới, báo tôi nhé.",
    description:
      "Client gửi một request và chờ. Khi có thông báo, server trả lời ngay — rồi một lượt chờ mới bắt đầu.",
    badge: "HTTP · GIỮ REQUEST",
    direction: "Client chờ",
    destination: "Server có tin mới",
    component: LongPollingDemo,
  },
  {
    id: "sse",
    name: "SSE",
    icon: Waves,
    title: "Tiến độ, từng bước một.",
    description:
      "Một kết nối mở. Server liên tục đẩy tiến độ xử lý báo cáo về trình duyệt cho đến khi hoàn thành.",
    badge: "HTTP · EVENT STREAM",
    direction: "Server phát sự kiện",
    destination: "Client nhận",
    component: SseDemo,
  },
  {
    id: "websocket",
    name: "WebSocket",
    icon: ArrowLeftRight,
    title: "Cuộc trò chuyện hai chiều.",
    description:
      "Cùng một kết nối, cả hai phía đều có thể gửi tin. Mở thêm một cửa sổ và trò chuyện trong cùng phòng.",
    badge: "WS · HAI CHIỀU",
    direction: "Client gửi & nhận",
    destination: "Server gửi & nhận",
    component: WebSocketDemo,
  },
  {
    id: "webhook",
    name: "Webhook",
    icon: Cable,
    title: "Thanh toán xong. Đã báo cửa hàng.",
    description:
      "Nhà cung cấp gửi một HTTP POST tới backend cửa hàng. Một sự kiện ở hệ thống này kích hoạt thay đổi ở hệ thống khác.",
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
              Làm lại
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
            <span className="connection-note">localhost · dữ liệu giả lập</span>
          </div>
          {session ? (
            <protocol.component key={session} session={session} />
          ) : (
            <div className="preparing" role="status">
              Đang chuẩn bị phiên demo…
            </div>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
