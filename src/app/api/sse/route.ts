import { z } from "zod";
import { SessionSchema } from "@/lib/protocol-contracts";
import {
  getSession,
  resetProgress,
  startProgress,
  subscribeToProgress,
} from "@/server/event-store";
import { errorResponse, json, readBody, sessionFrom } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const InputSchema = z.object({ session: SessionSchema, action: z.enum(["start", "reset"]) });

export function GET(request: Request) {
  try {
    const state = getSession(sessionFrom(request));
    const encoder = new TextEncoder();
    let cleanup = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let unsubscribe = () => {};
        const finish = (closeStream: boolean) => {
          if (closed) return;
          closed = true;
          unsubscribe();
          request.signal.removeEventListener("abort", close);
          if (closeStream) controller.close();
        };
        const close = () => finish(true);
        cleanup = () => finish(false);
        const send = (event: string, data: unknown) => {
          if (!closed)
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
            );
        };
        unsubscribe = subscribeToProgress(state, {
          send: (progress) => send("progress", progress),
          close,
        });
        request.signal.addEventListener("abort", close, { once: true });
        // ready giúp client biết stream đã đăng ký xong trước khi POST start.
        send("ready", {});
        send("progress", state.progress);
        if (request.signal.aborted) close();
      },
      cancel() {
        cleanup();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { session, action } = await readBody(request, InputSchema);
    const state = getSession(session);
    if (action === "reset") resetProgress(state);
    else {
      if (!state.subscribers.size)
        return json({ error: "Hãy mở kết nối SSE trước khi chạy tác vụ." }, 409);
      if (!startProgress(state)) return json({ error: "Tác vụ đang chạy." }, 409);
    }
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
