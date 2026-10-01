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
  const { entries, log } = useActivity();
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
      const connection = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws?room=${session}&name=${encodeURIComponent(name.trim())}`,
      );
      socket.current = connection;
      log("send", "Mở kết nối hai chiều", "WebSocket /ws", [
        { from: "client", to: "server", label: "Yêu cầu mở WebSocket", detail: name.trim() },
      ]);
      connection.onopen = () => {
        log("info", "Socket đã mở", "Đang chờ server cấp ID và danh sách người tham gia.");
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
            log("receive", "Server xác nhận kết nối", `${name.trim()} · #${ownId.slice(0, 6)}`, [
              { from: "server", to: ownId, label: "Cấp ID và gửi danh sách phòng", detail: `${welcome.data.participants.length} kết nối đang mở` },
            ]);
            return;
          }
          const presence = ChatPresenceSchema.safeParse(data);
          if (presence.success) {
            setParticipants(presence.data.participants);
            log("receive", "Danh sách người tham gia thay đổi", `${presence.data.participants.length} kết nối đang mở`, [
              { from: "server", to: ownId, label: "Cập nhật người vào / rời phòng", detail: presence.data.participants.map((person) => `${person.name} #${person.id.slice(0, 6)}`).join(", ") },
            ]);
            return;
          }
          const message = ChatMessageSchema.parse(data);
          setMessages((items) => [...items, message].slice(-100));
          const steps: FlowStep[] = [
            { from: message.senderId, to: "server", label: "Server nhận và kiểm tra tin", detail: message.text },
            ...message.recipients.map((person) => ({
              from: "server", to: person.id,
              label: person.id === ownId
                ? message.senderId === ownId ? "Bạn nhận lại tin của mình (echo)" : "Trình duyệt này nhận tin"
                : person.id === message.senderId ? "Phát lại cho người gửi (echo)" : "Phát tới socket người nhận",
              detail: person.id === ownId ? "Đã nhận qua sự kiện onmessage" : "Server phát tin; chưa có xác nhận từ trình duyệt kia",
            })),
          ];
          log("receive", message.senderId === ownId ? "Nhận lại tin của bạn từ server" : `Nhận tin từ ${message.name}`, message.text, steps);
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "Tin nhắn không hợp lệ.";
          setError(message);
          log("error", "Không nhận được tin nhắn", message);
        }
      };
      connection.onerror = () => {
        closeSocket();
        setState("error");
        setParticipants([]);
        setError("Không thể kết nối tới server. Bấm kết nối để thử lại.");
        log("error", "Kết nối WebSocket thất bại");
      };
      connection.onclose = () => {
        socket.current = null;
        setState("idle");
        setParticipants([]);
        log("info", "Server đã đóng kết nối", "Bạn có thể kết nối lại để tiếp tục.");
      };
    } catch {
      closeSocket();
      setState("error");
      setError("Không mở được kết nối WebSocket.");
    }
  }

  function disconnect() {
    closeSocket();
    setState("idle");
    setParticipants([]);
    log("info", "Đã ngắt kết nối", "Tin nhắn đã nhận vẫn được giữ trên màn hình.", [
      { from: clientId, to: "server", label: "Đóng kết nối WebSocket" },
    ]);
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim() || socket.current?.readyState !== WebSocket.OPEN) return;
    try {
      socket.current.send(JSON.stringify({ name: name.trim(), text: text.trim() }));
      log("send", "Bạn gửi tin lên server", text.trim(), [
        { from: clientId, to: "server", label: "Gửi tin qua WebSocket", detail: text.trim() },
      ]);
      setText("");
      setError("");
    } catch {
      setError("Không gửi được tin nhắn. Hãy kết nối lại.");
      log("error", "Gửi tin nhắn thất bại");
    }
  }

  const active = state === "connecting" || state === "connected";
  const actors: Actor[] = [
    ...(participants.length ? participants.map((person) => ({
      id: person.id,
      label: `${person.name} · #${person.id.slice(0, 6)}`,
      role: person.id === clientId ? "Client · bạn" : "Client · người khác",
      state: "Đã kết nối",
    })) : [{ id: clientId, label: name.trim() || "Trình duyệt này", role: "Client · bạn", state: state === "connecting" ? "Đang kết nối" : "Chưa kết nối" }]),
    { id: "server", label: "Chat server", role: "Server", state: `${participants.length} kết nối trong phòng` },
  ];
  return (
    <div className="demo-grid">
      <section className="experiment-panel" aria-label="Demo WebSocket">
        <div className="panel-topline">
          <span className="section-label">PHÒNG CHAT / {session.slice(0, 8)}</span>
          <MessageSquare size={19} aria-hidden="true" />
        </div>
        <div className="status-row">
          <h3 className="panel-title">Cuộc trò chuyện hai chiều.</h3>
          <Status tone={state === "error" ? "error" : active ? "live" : "idle"}>
            {
              {
                idle: "Chưa kết nối",
                connecting: "Đang kết nối",
                connected: "Đã kết nối",
                error: "Có lỗi",
              }[state]
            }
          </Status>
        </div>
        <p className="muted">
          Mở người tham gia thứ hai, kết nối ở cả hai cửa sổ và gửi tin qua lại.
        </p>
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
              Mở người tham gia thứ hai
            </a>
          </Button>
        </div>
        <div className="chat-messages" ref={chat} tabIndex={0} aria-label="Lịch sử trò chuyện">
          {messages.length === 0 ? (
            <div className="demo-empty">
              <MessageSquare size={28} aria-hidden="true" />
              <p>Hãy gửi lời chào đầu tiên</p>
              <span>Tin nhắn sẽ đến mọi người trong cùng phòng.</span>
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
          {state === "connected" ? `${participants.length} người đang kết nối: ${participants.map((person) => `${person.name} #${person.id.slice(0, 6)}${person.id === clientId ? " (bạn)" : ""}`).join(", ")}.` : "Trình duyệt này chưa vào phòng. Kết nối để xem người tham gia thực tế."}
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
              state === "connected" ? "Viết một tin nhắn…" : "Kết nối để bắt đầu trò chuyện"
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
      <ActivityLog entries={entries} actors={actors} note="Server phát mỗi tin cho mọi socket trong phòng, kể cả người gửi. Chỉ trình duyệt này xác nhận đã nhận qua onmessage; không suy đoán trình duyệt khác đã đọc tin." />
    </div>
  );
}
