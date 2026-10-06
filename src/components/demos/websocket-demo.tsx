"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ExternalLink, MessageSquare, Plug, Send, Unplug } from "lucide-react";
import { z } from "zod";
import { ChatMessageSchema, ChatPresenceSchema, ChatWelcomeSchema, type ChatParticipant } from "@/lib/protocol-contracts";
import { ActivityLog, useActivity, type Actor, type FlowStep } from "@/components/activity-log";
import { Status } from "@/components/demo-status";
import { Button } from "@/components/ui/button";

type ChatMessage = z.infer<typeof ChatMessageSchema>;
const ErrorSchema = z.object({ error: z.string() });

export function WebSocketDemo({ session }: { session: string }) {
  const { entries, log, extend } = useActivity();
  const [state, setState] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [name, setName] = useState("Khách 01");
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [clientId, setClientId] = useState("client");
  const [participants, setParticipants] = useState<ChatParticipant[]>([]);
  const [error, setError] = useState("");
  const socket = useRef<WebSocket | null>(null);
  const chat = useRef<HTMLDivElement | null>(null);

  function closeSocket() {
    const current = socket.current;
    if (!current) return;
    current.onopen = current.onmessage = current.onclose = current.onerror = null;
    current.close();
    socket.current = null;
  }

  useEffect(() => () => closeSocket(), []);
  useEffect(() => {
    if (chat.current) chat.current.scrollTop = chat.current.scrollHeight;
  }, [messages]);

  function connect() {
    if (socket.current || !name.trim()) return;
    setError("");
    setState("connecting");
    setClientId("client");
    setParticipants([]);
    try {
      let ownId = "client";
      // Trình duyệt này luôn là actor "client" trong sơ đồ, kể cả trước khi server cấp ID.
      const actor = (id: string) => (id === ownId ? "client" : id);
      const connection = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws?room=${session}&name=${encodeURIComponent(name.trim())}`,
      );
      socket.current = connection;
      // Bắt tay WebSocket là một entry: request Upgrade, 101, rồi message chào từ server.
      const handshake = log("info", "Mở kết nối WebSocket", "GET /ws · Upgrade: websocket", [
        {
          from: "client", to: "server", label: "Gửi HTTP request nâng cấp lên WebSocket",
          detail: `GET /ws?room=…&name=${name.trim()}\nHost: ${location.host}\nOrigin: ${location.origin}\nUpgrade: websocket\nConnection: Upgrade\nSec-WebSocket-Version: 13\nSec-WebSocket-Key: <16 byte ngẫu nhiên, mã hóa base64>`,
        },
      ]);
      let opened = false;
      connection.onopen = () => {
        opened = true;
        extend(handshake, "receive", "Kết nối WebSocket đã mở", "101 Switching Protocols", [
          {
            from: "server", to: "client", label: "101 Switching Protocols · nâng cấp thành công",
            detail: 'HTTP/1.1 101 Switching Protocols\nUpgrade: websocket\nConnection: Upgrade\nSec-WebSocket-Accept: base64(SHA-1(Sec-WebSocket-Key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))',
          },
        ]);
      };
      connection.onmessage = (event: MessageEvent<string>) => {
        try {
          const data: unknown = JSON.parse(event.data);
          const failure = ErrorSchema.safeParse(data);
          if (failure.success) throw new Error(failure.data.error);
          const welcome = ChatWelcomeSchema.safeParse(data);
          if (welcome.success) {
            ownId = welcome.data.clientId;
            setClientId(ownId);
            setParticipants(welcome.data.participants);
            setState("connected");
            // welcome là message tầng ứng dụng; kết nối đã được chấp nhận từ bước 101.
            extend(handshake, "receive", "Nhận message welcome", `${name.trim()} · #${ownId.slice(0, 6)}`, [
              { from: "server", to: "client", label: "Message welcome · cấp ID và danh sách thành viên", detail: event.data },
            ]);
            return;
          }
          const presence = ChatPresenceSchema.safeParse(data);
          if (presence.success) {
            setParticipants(presence.data.participants);
            log("receive", "Danh sách thành viên thay đổi", `${presence.data.participants.length} kết nối đang mở`, [
              { from: "server", to: "client", label: "Message presence · thành viên tham gia / rời phòng", detail: event.data },
            ]);
            return;
          }
          const message = ChatMessageSchema.parse(data);
          setMessages((items) => [...items, message].slice(-100));
          const steps: FlowStep[] = [
            { from: actor(message.senderId), to: "server", label: "Gửi tin nhắn (text frame)", detail: `Text frame (masked)\ntext: ${message.text}` },
            { from: "server", to: "server", label: "Kiểm tra tin nhắn · dùng tên đã đăng ký", detail: "Kiểm tra độ dài name/text; tên hiển thị lấy từ lúc kết nối." },
            ...message.recipients.map((person) => ({
              from: "server", to: actor(person.id),
              label: person.id === ownId
                ? message.senderId === ownId ? "Nhận lại tin nhắn của chính mình (echo)" : "Trình duyệt này nhận tin nhắn"
                : person.id === message.senderId ? "Phát lại cho bên gửi (echo, không có ack)" : "Phát tới kết nối của bên nhận (không có ack)",
              detail: `Text frame\n${event.data}`,
            })),
          ];
          log("receive", message.senderId === ownId ? "Nhận lại tin nhắn đã gửi từ server" : `Nhận tin nhắn từ ${message.name}`, message.text, steps);
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "Tin nhắn không hợp lệ.";
          setError(message);
          log("error", "Không xử lý được tin nhắn", message);
        }
      };
      connection.onerror = () => {
        closeSocket();
        setState("error");
        setParticipants([]);
        setError(opened ? "Kết nối tới server bị ngắt." : "Không thể kết nối tới server.");
        if (opened) log("error", "Kết nối WebSocket bị ngắt");
        else extend(handshake, "error", "Bắt tay WebSocket thất bại", undefined, [
          { from: "client", to: "client", label: "Bắt tay thất bại · onerror", detail: "Không nhận được 101 Switching Protocols hợp lệ." },
        ]);
      };
      // Chỉ chạy khi server đóng hoặc kết nối mất; client chủ động đóng được xử lý trong disconnect().
      connection.onclose = (event: CloseEvent) => {
        if (socket.current === connection) socket.current = null;
        setState("idle");
        setParticipants([]);
        log("info", event.wasClean ? "Server đóng kết nối" : "Kết nối bị ngắt đột ngột", `Close code ${event.code}`, [
          event.wasClean
            ? { from: "server", to: "client", label: "Close frame từ server", detail: `Opcode 0x8 · close code ${event.code}` }
            : { from: "client", to: "client", label: "Mất kết nối · không có close handshake", detail: `Close code ${event.code} · wasClean: false` },
        ]);
      };
    } catch {
      closeSocket();
      setState("error");
      setError("Không thể mở kết nối WebSocket.");
    }
  }

  function disconnect() {
    const current = socket.current;
    if (!current) return;
    socket.current = null;
    setState("idle");
    setParticipants([]);
    if (current.readyState === WebSocket.CONNECTING) {
      // Chưa bắt tay xong: close() hủy kết nối, không có Close frame nào được gửi.
      current.onopen = current.onmessage = current.onclose = current.onerror = null;
      current.close();
      log("info", "Hủy kết nối WebSocket", undefined, [
        { from: "client", to: "client", label: "Hủy bắt tay", detail: "WebSocket.close() khi readyState: CONNECTING" },
      ]);
      return;
    }
    // Close handshake: client gửi Close frame, server gửi lại Close frame rồi đóng kết nối.
    current.onmessage = current.onerror = null;
    const story = log("info", "Client đóng kết nối", "Close handshake", [
      { from: "client", to: "server", label: "Gửi Close frame", detail: "Opcode 0x8 · không kèm status code" },
    ]);
    current.onclose = (event: CloseEvent) => {
      extend(story, "info", "Đã đóng kết nối", `Close code ${event.code}`, [
        event.wasClean
          ? { from: "server", to: "client", label: "Close frame từ server · đóng kết nối", detail: `Opcode 0x8 · close code ${event.code} · wasClean: true` }
          : { from: "client", to: "client", label: "Kết nối đóng không qua close handshake", detail: `Close code ${event.code} · wasClean: false` },
      ]);
    };
    current.close();
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim() || socket.current?.readyState !== WebSocket.OPEN) return;
    try {
      const frame = JSON.stringify({ name: name.trim(), text: text.trim() });
      socket.current.send(frame);
      log("send", "Gửi tin nhắn tới server", text.trim(), [
        { from: "client", to: "server", label: "Gửi tin nhắn (text frame)", detail: `Text frame (masked)\n${frame}` },
      ]);
      setText("");
      setError("");
    } catch {
      setError("Không thể gửi tin nhắn.");
      log("error", "Gửi tin nhắn thất bại");
    }
  }

  const active = state === "connecting" || state === "connected";
  const actors: Actor[] = [
    ...(participants.length ? participants.map((person) => ({
      id: person.id === clientId ? "client" : person.id,
      label: `${person.name} · #${person.id.slice(0, 6)}`,
      role: person.id === clientId ? "Client · trình duyệt này" : "Client · thành viên khác",
      state: "Đã kết nối",
    })) : [{ id: "client", label: name.trim() || "Trình duyệt này", role: "Client · trình duyệt này", state: state === "connecting" ? "Đang kết nối" : "Chưa kết nối" }]),
    { id: "server", label: "Chat server", role: "Server", state: `${participants.length} kết nối trong phòng` },
  ];
  return (
    <div className="demo-grid">
      <section className="experiment-panel" aria-label="Thí nghiệm WebSocket">
        <div className="panel-topline">
          <span className="section-label">PHÒNG TRÒ CHUYỆN / {session.slice(0, 8)}</span>
          <MessageSquare size={19} aria-hidden="true" />
        </div>
        <div className="status-row">
          <h3 className="panel-title">Trò chuyện thời gian thực</h3>
          <Status tone={state === "error" ? "error" : active ? "live" : "idle"}>
            {
              {
                idle: "Chưa kết nối",
                connecting: "Đang kết nối",
                connected: "Đã kết nối",
                error: "Lỗi",
              }[state]
            }
          </Status>
        </div>
        <div className="form-field">
          <label htmlFor="chat-name" className="section-label">
            TÊN HIỂN THỊ
          </label>
          <input
            className="input"
            id="chat-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={active}
            maxLength={32}
            autoComplete="nickname"
          />
        </div>
        <div className="controls">
          <Button
            type="button"
            onClick={active ? disconnect : connect}
            disabled={!name.trim()}
            aria-busy={state === "connecting"}
          >
            {active ? (
              <Unplug size={15} aria-hidden="true" />
            ) : (
              <Plug size={15} aria-hidden="true" />
            )}
            {active ? "Ngắt kết nối" : "Kết nối"}
          </Button>
          <Button variant="outline" asChild>
            <a
              href={`/?tab=websocket&room=${encodeURIComponent(session)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={15} aria-hidden="true" />
              Mở thêm một phiên client
            </a>
          </Button>
        </div>
        <div className="chat-messages" ref={chat} tabIndex={0} aria-label="Lịch sử trò chuyện">
          {messages.length === 0 ? (
            <div className="demo-empty">
              <MessageSquare size={28} aria-hidden="true" />
              <p>Chưa có tin nhắn</p>
            </div>
          ) : (
            <ul>
              {messages.map((message) => (
                <li className="chat-message" key={message.id}>
                  <div className="chat-meta">
                    <strong>{message.name} · #{message.senderId.slice(0, 6)}{message.senderId === clientId ? " (bạn)" : ""}</strong>
                    <time dateTime={message.createdAt}>
                      {new Date(message.createdAt).toLocaleTimeString("vi-VN")}
                    </time>
                  </div>
                  <p>{message.text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="hint" role="status">
          {state === "connected" ? `${participants.length} thành viên đang kết nối: ${participants.map((person) => `${person.name} #${person.id.slice(0, 6)}${person.id === clientId ? " (bạn)" : ""}`).join(", ")}.` : ""}
        </p>
        <form className="chat-compose" onSubmit={send}>
          <label className="sr-only" htmlFor="chat-text">
            Nội dung tin nhắn
          </label>
          <input
            className="input"
            id="chat-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              state === "connected" ? "Nhập tin nhắn…" : "Chưa kết nối"
            }
            disabled={state !== "connected"}
            maxLength={500}
            required
          />
          <Button type="submit" disabled={state !== "connected" || !text.trim()}>
            <Send size={15} aria-hidden="true" />
            Gửi
          </Button>
        </form>
        <p className="error-text" role="alert">
          {error}
        </p>
      </section>
      <ActivityLog entries={entries} actors={actors} note="Server phát quảng bá mỗi tin nhắn tới mọi kết nối trong phòng, bao gồm cả bên gửi." />
    </div>
  );
}
