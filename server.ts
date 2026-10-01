import { createServer } from "node:http";
import next from "next";
import { createChatServer } from "./src/server/websocket";

const dev = !process.argv.includes("--production");
const hostname = "127.0.0.1";
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT không hợp lệ.");
process.env.PORT = String(port);

async function main() {
  const app = next({ dev, hostname, port });
  await app.prepare();
  const handle = app.getRequestHandler();
  const nextUpgrade = app.getUpgradeHandler();
  const chat = createChatServer();
  const allowedHosts = new Set([`${hostname}:${port}`, `localhost:${port}`]);
  const server = createServer((request, response) => {
    if (!allowedHosts.has(request.headers.host ?? "")) {
      response.writeHead(403).end("Forbidden host");
      return;
    }
    handle(request, response).catch((error: unknown) => {
      console.error("HTTP:", error);
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  server.on("upgrade", (request, socket, head) => {
    if (!allowedHosts.has(request.headers.host ?? "")) {
      socket.destroy();
      return;
    }
    if (new URL(request.url ?? "/", `http://${hostname}:${port}`).pathname === "/ws") {
      chat.upgrade(request, socket, head);
    } else {
      // Giữ HTTP Upgrade của Next để hot reload vẫn hoạt động trong development.
      void nextUpgrade(request, socket, head).catch(() => socket.destroy());
    }
  });
  server.on("error", (error) => {
    console.error(error);
    process.exit(1);
  });
  server.listen(port, hostname, () => console.log(`ProtoLab → http://${hostname}:${port}`));
  const shutdown = () => {
    chat.close();
    server.close();
    void app.close().finally(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
