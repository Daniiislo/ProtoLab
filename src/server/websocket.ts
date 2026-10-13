import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { type RawData, WebSocket, WebSocketServer } from "ws";
import { ChatInputSchema, ChatNameSchema, SessionSchema, type ChatParticipant } from "../lib/protocol-contracts";
import { isLocalOrigin } from "./http";

type Room = Map<WebSocket, ChatParticipant>;

const INVALID_INPUT = "Tên hiển thị tối đa 32 ký tự; tin nhắn phải có từ 1 đến 500 ký tự.";

// Gửi một JSON tới một kết nối, bỏ qua kết nối đã đóng.
const sendJson = (client: WebSocket, data: unknown) => {
  if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(data));
};

// Gửi cùng một JSON tới mọi thành viên trong phòng, trừ `except` nếu có.
const broadcast = (room: Room, data: unknown, except?: WebSocket) => {
  for (const member of room.keys()) if (member !== except) sendJson(member, data);
};

const presence = (room: Room) => ({ type: "presence", participants: [...room.values()] });

// Frame hợp lệ là text JSON đúng ChatInputSchema; ngược lại trả null.
function parseInput(raw: RawData, binary: boolean) {
  if (binary) return null;
  try {
    const parsed = ChatInputSchema.safeParse(JSON.parse(raw.toString()));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Tên lấy từ lúc kết nối, không tin tên trong frame.
const chatMessage = (room: Room, sender: ChatParticipant, text: string) => ({
  type: "chat",
  id: randomUUID(),
  name: sender.name,
  text,
  senderId: sender.id,
  recipients: [...room].filter(([member]) => member.readyState === WebSocket.OPEN).map(([, person]) => person),
  createdAt: new Date().toISOString(),
});

export function createChatServer() {
  const server = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const rooms = new Map<string, Room>();

  // Bước 1: kiểm tra yêu cầu nâng cấp, hợp lệ thì để `ws` bắt tay rồi cho vào phòng.
  function upgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
    const query = new URL(request.url ?? "/", "http://localhost").searchParams;
    const room = SessionSchema.safeParse(query.get("room"));
    const name = ChatNameSchema.safeParse(query.get("name") ?? "Khách");
    if (!room.success || !name.success || !request.headers.origin || !isLocalOrigin(request.headers.origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    server.handleUpgrade(request, socket, head, (client) => join(client, room.data, name.data));
  }

  // Bước 2: đăng ký thành viên, chào người mới, báo người cũ, rồi lắng nghe kết nối.
  function join(client: WebSocket, roomId: string, name: string) {
    const room = rooms.get(roomId) ?? new Map<WebSocket, ChatParticipant>();
    rooms.set(roomId, room);
    const participant = { id: randomUUID(), name };
    room.set(client, participant);

    // Người mới nhận danh sách qua welcome nên presence chỉ gửi cho người cũ.
    sendJson(client, { type: "welcome", clientId: participant.id, participants: [...room.values()] });
    broadcast(room, presence(room), client);

    client.on("error", (error) => console.error("WebSocket:", error.message));
    client.on("message", (raw, binary) => onMessage(client, room, participant, raw, binary));
    client.on("close", () => leave(client, roomId, room));
  }

  // Bước 3: nhận tin, kiểm tra, phát cho cả phòng (kể cả người gửi).
  function onMessage(client: WebSocket, room: Room, participant: ChatParticipant, raw: RawData, binary: boolean) {
    const input = parseInput(raw, binary);
    if (!input) return sendJson(client, { error: INVALID_INPUT });
    broadcast(room, chatMessage(room, participant, input.text));
  }

  // Bước 4: rời phòng, phòng trống thì xoá, còn người thì báo danh sách mới.
  function leave(client: WebSocket, roomId: string, room: Room) {
    room.delete(client);
    if (!room.size) rooms.delete(roomId);
    else broadcast(room, presence(room));
  }

  return {
    upgrade,
    close: () => {
      for (const client of server.clients) client.terminate();
      server.close();
    },
  };
}
