import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { WebSocket } from "ws";
import {
  ChatMessageSchema,
  ChatPresenceSchema,
  ChatWelcomeSchema,
  DeliverySchema,
  NotificationBatchSchema,
  PaymentSchema,
  ProgressSchema,
} from "../src/lib/protocol-contracts";

const base = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test(
  "polling reads persisted steps, isolates sessions and resets",
  { timeout: 20_000 },
  async () => {
    const session = randomUUID();
    const read = () => fetch(`${base}/api/polling?session=${session}`).then((r) => r.json());
    assert.equal((await read()).step, 0);
    assert.equal((await post("/api/polling", { session, action: "advance" })).status, 200);
    assert.equal((await read()).step, 1);
    const other = await fetch(`${base}/api/polling?session=${randomUUID()}`).then((r) => r.json());
    assert.equal(other.step, 0);
    await post("/api/polling", { session, action: "reset" });
    assert.equal((await read()).step, 0);
  },
);

test(
  "long polling holds until publication and replays events after the cursor",
  { timeout: 15_000 },
  async () => {
    const session = randomUUID();
    let settled = false;
    const pending = fetch(`${base}/api/long-polling?session=${session}&after=0`, {
      signal: AbortSignal.timeout(12_000),
    }).then(async (r) => {
      settled = true;
      return NotificationBatchSchema.parse(await r.json());
    });
    await delay(250);
    assert.equal(settled, false, "GET must remain pending without an event");
    const publication = await post("/api/long-polling", {
      session,
      action: "publish",
      text: "Một thông báo mới",
    });
    assert.equal(publication.status, 200);
    const batch = await pending;
    assert.equal(batch.timedOut, false);
    assert.equal(batch.events[0]?.text, "Một thông báo mới");
    assert.equal(batch.cursor, 1);
    await post("/api/long-polling", { session, action: "publish", text: "Thông báo thứ hai" });
    const next = await fetch(
      `${base}/api/long-polling?session=${session}&after=${batch.cursor}`,
    ).then((r) => r.json());
    assert.equal(next.events.length, 1);
    assert.equal(next.events[0].text, "Thông báo thứ hai");
    const reset = await post("/api/long-polling", { session, action: "reset" }).then((r) =>
      r.json(),
    );
    assert.equal(reset.events.length, 0);
    assert.ok(reset.cursor > next.cursor);
  },
);

test(
  "long polling times out after 20 seconds, then accepts another request",
  { timeout: 30_000 },
  async () => {
    const session = randomUUID();
    const started = Date.now();
    const response = await fetch(`${base}/api/long-polling?session=${session}&after=0`, {
      signal: AbortSignal.timeout(25_000),
    });
    const batch = NotificationBatchSchema.parse(await response.json());
    assert.equal(response.status, 200);
    assert.equal(batch.timedOut, true);
    assert.deepEqual(batch.events, []);
    assert.ok(Date.now() - started >= 19_500, "timeout must represent an actual held request");
    await post("/api/long-polling", { session, action: "publish", text: "Sau timeout" });
    const next = await fetch(`${base}/api/long-polling?session=${session}&after=0`).then((r) =>
      r.json(),
    );
    assert.equal(next.events[0].text, "Sau timeout");
  },
);

test(
  "SSE streams several progress events on one connection and completes",
  { timeout: 20_000 },
  async (t) => {
    const session = randomUUID();
    const abort = new AbortController();
    t.after(() => abort.abort());
    const response = await fetch(`${base}/api/sse?session=${session}`, { signal: abort.signal });
    assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
    assert.ok(response.body);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const first = await reader.read();
    let buffer = decoder.decode(first.value, { stream: true });
    assert.match(buffer, /event: ready/);
    assert.equal((await post("/api/sse", { session, action: "start" })).status, 200);
    assert.equal((await post("/api/sse", { session, action: "start" })).status, 409);
    const progress: number[] = [];
    let completed = false;
    while (!completed) {
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (frame.startsWith("event: progress")) {
          const data = ProgressSchema.parse(JSON.parse(frame.split("\ndata: ")[1]!));
          progress.push(data.progress);
          completed = data.done;
        }
      }
      if (!completed) {
        const chunk = await reader.read();
        assert.equal(chunk.done, false, "stream must complete its task before closing");
        buffer += decoder.decode(chunk.value, { stream: true });
      }
    }
    assert.equal(progress.at(-1), 100);
    assert.ok(new Set(progress).size >= 6);
    assert.equal((await reader.read()).done, true);
  },
);

test(
  "aborting SSE cancels the task timer so a new run can start",
  { timeout: 15_000 },
  async () => {
    const session = randomUUID();
    const abort = new AbortController();
    const first = await fetch(`${base}/api/sse?session=${session}`, { signal: abort.signal });
    await first.body!.getReader().read();
    assert.equal((await post("/api/sse", { session, action: "start" })).status, 200);
    abort.abort();
    await delay(150);
    const secondAbort = new AbortController();
    try {
      const second = await fetch(`${base}/api/sse?session=${session}`, {
        signal: secondAbort.signal,
      });
      await second.body!.getReader().read();
      assert.equal((await post("/api/sse", { session, action: "start" })).status, 200);
    } finally {
      secondAbort.abort();
    }
  },
);

test(
  "webhook posts to the receiver, acknowledges, deduplicates, and resets",
  { timeout: 20_000 },
  async () => {
    const session = randomUUID();
    const status = () =>
      fetch(`${base}/api/webhook/status?session=${session}`)
        .then((r) => r.json())
        .then((data) => PaymentSchema.parse(data));
    assert.equal((await status()).status, "pending");
    const response = await post("/api/webhook/provider", { session, action: "pay" });
    assert.equal(response.status, 200);
    const delivery = DeliverySchema.parse(await response.json());
    assert.equal(delivery.deliveryStatus, 200);
    const paid = await status();
    assert.equal(paid.status, "paid");
    assert.equal(paid.eventId, delivery.eventId);
    const repeated = await post("/api/webhook/provider", { session, action: "pay" });
    assert.equal(repeated.status, 200);
    assert.deepEqual(await status(), paid, "duplicate event must not apply the payment twice");
    await post("/api/webhook/provider", { session, action: "reset" });
    assert.equal((await status()).status, "pending");
  },
);

test(
  "WebSocket identifies participants, broadcasts including sender, and announces departures",
  { timeout: 15_000 },
  async (t) => {
    const room = randomUUID();
    const endpoint = base.replace(/^http/, "ws");
    function frame(client: WebSocket, type: string) {
      return new Promise<unknown>((resolve) => {
        const receive = (raw: Buffer) => {
          const data: unknown = JSON.parse(raw.toString());
          if (typeof data !== "object" || data === null || !(type === "error" ? "error" in data : "type" in data && data.type === type)) return;
          client.off("message", receive);
          resolve(data);
        };
        client.on("message", receive);
      });
    }
    const one = new WebSocket(`${endpoint}/ws?room=${room}&name=An`, { origin: base });
    t.after(() => one.terminate());
    const first = ChatWelcomeSchema.parse(await frame(one, "welcome"));
    assert.equal(first.participants.length, 1);
    assert.equal(first.participants[0]?.id, first.clientId);
    assert.equal(first.participants[0]?.name, "An");
    const joined = frame(one, "presence");
    const two = new WebSocket(`${endpoint}/ws?room=${room}&name=Binh`, { origin: base });
    t.after(() => two.terminate());
    const second = ChatWelcomeSchema.parse(await frame(two, "welcome"));
    assert.notEqual(first.clientId, second.clientId);
    assert.deepEqual(ChatPresenceSchema.parse(await joined).participants, second.participants);
    assert.equal(second.participants.length, 2);
    const other = new WebSocket(`${endpoint}/ws?room=${randomUUID()}`, { origin: base });
    t.after(() => other.terminate());
    const isolated = ChatWelcomeSchema.parse(await frame(other, "welcome"));
    assert.equal(isolated.participants[0]?.name, "Khách", "missing name uses a valid default");
    let leaked = false;
    other.on("message", (raw) => {
      if (JSON.parse(raw.toString()).type === "chat") leaked = true;
    });
    const echo = frame(one, "chat");
    const received = frame(two, "chat");
    one.send(JSON.stringify({ name: "Forged name", text: "Chào từ cửa sổ một" }));
    const message = ChatMessageSchema.parse(await received);
    assert.equal(message.text, "Chào từ cửa sổ một");
    assert.equal(message.name, "An", "server uses the registered connection identity");
    assert.equal(message.senderId, first.clientId);
    assert.deepEqual(new Set(message.recipients.map((person) => person.id)), new Set([first.clientId, second.clientId]));
    assert.deepEqual(await echo, message, "sender receives the same broadcast as the other participant");
    const reply = frame(one, "chat");
    two.send(JSON.stringify({ name: "Binh", text: "Đã nhận được" }));
    assert.equal(ChatMessageSchema.parse(await reply).senderId, second.clientId);
    const invalid = frame(one, "error");
    one.send(JSON.stringify({ name: "An", text: "" }));
    assert.equal(typeof (await invalid as { error: unknown }).error, "string");
    const departure = frame(one, "presence");
    two.close();
    assert.deepEqual(ChatPresenceSchema.parse(await departure).participants, first.participants);
    await delay(100);
    assert.equal(leaked, false, "different rooms must stay isolated");
  },
);

test(
  "HTTP boundaries reject malformed input, oversized data and remote origins",
  { timeout: 20_000 },
  async () => {
    assert.equal((await fetch(`${base}/api/polling?session=invalid`)).status, 400);
    assert.equal(
      (await post("/api/polling", { session: randomUUID(), action: "wrong" })).status,
      400,
    );
    assert.equal(
      (await fetch(`${base}/api/long-polling?session=${randomUUID()}&after=-1`)).status,
      400,
    );
    assert.equal(
      (await post("/api/long-polling", { session: randomUUID(), action: "publish", text: "" }))
        .status,
      400,
    );
    assert.equal((await post("/api/sse", { session: randomUUID(), action: "start" })).status, 409);
    assert.equal(
      (
        await post("/api/webhook/receiver", {
          session: randomUUID(),
          eventId: randomUUID(),
          type: "payment.succeeded",
        })
      ).status,
      401,
    );
    const invalidJson = await fetch(`${base}/api/polling`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    assert.equal(invalidJson.status, 400);
    const oversized = await post("/api/long-polling", {
      session: randomUUID(),
      action: "publish",
      text: "a".repeat(5000),
    });
    assert.equal(oversized.status, 413);
    const remote = await fetch(`${base}/api/polling`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://example.com" },
      body: JSON.stringify({ session: randomUUID(), action: "advance" }),
    });
    assert.equal(remote.status, 403);
  },
);
