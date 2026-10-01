import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { ChatInputSchema, ChatNameSchema, SessionSchema, type ChatParticipant } from "../lib/protocol-contracts";
import { isLocalOrigin } from "./http";

export function createChatServer() {
  const server = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const rooms = new Map<string, Map<WebSocket, ChatParticipant>>();

  function upgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
    const query = new URL(request.url ?? "/", "http://localhost").searchParams;
    const room = SessionSchema.safeParse(query.get("room"));
    const name = ChatNameSchema.safeParse(query.get("name") ?? "Khách");
    if (!room.success || !name.success || !request.headers.origin || !isLocalOrigin(request.headers.origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    server.handleUpgrade(request, socket, head, (client) => {
      const members = rooms.get(room.data) ?? new Map<WebSocket, ChatParticipant>();
      rooms.set(room.data, members);
      const participant = { id: randomUUID(), name: name.data };
      members.set(client, participant);
      function broadcastPresence(except?: WebSocket) {
        const frame = JSON.stringify({ type: "presence", participants: [...members.values()] });
        for (const member of members.keys()) {
          if (member !== except && member.readyState === WebSocket.OPEN) member.send(frame);
        }
      }
      client.send(JSON.stringify({ type: "welcome", clientId: participant.id, participants: [...members.values()] }));
      broadcastPresence(client);
      client.on("error", (error) => console.error("WebSocket:", error.message));
      client.on("message", (raw, binary) => {
        let input: unknown;
        try {
          input = binary ? null : JSON.parse(raw.toString());
        } catch {
          input = null;
        }
        const parsed = ChatInputSchema.safeParse(input);
        if (!parsed.success) {
          client.send(
            JSON.stringify({ error: "Tên tối đa 32 ký tự; tin nhắn từ 1 đến 500 ký tự." }),
          );
          return;
        }
        const message = JSON.stringify({
          type: "chat",
          id: randomUUID(),
          name: participant.name,
          text: parsed.data.text,
          senderId: participant.id,
          recipients: [...members].filter(([member]) => member.readyState === WebSocket.OPEN).map(([, person]) => person),
          createdAt: new Date().toISOString(),
        });
        // Mỗi client trong phòng nhận cùng một message trên kết nối đã mở.
        for (const member of members.keys()) {
          if (member.readyState === WebSocket.OPEN) member.send(message);
        }
      });
      client.on("close", () => {
        members.delete(client);
        if (!members.size) rooms.delete(room.data);
        else broadcastPresence();
      });
    });
  }

  return {
    upgrade,
    close: () => {
      for (const client of server.clients) client.terminate();
      server.close();
    },
  };
}
