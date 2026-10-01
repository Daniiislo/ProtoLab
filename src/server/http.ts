import { z } from "zod";
import { SessionSchema } from "../lib/protocol-contracts";

export const localOrigin = `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
// Chỉ là bí mật cho demo localhost; cấu hình WEBHOOK_SECRET nếu dùng ngoài demo.
export const webhookSecret = process.env.WEBHOOK_SECRET ?? "protolab-local-demo-secret";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function isLocalOrigin(origin: string) {
  return origin === localOrigin || origin === localOrigin.replace("127.0.0.1", "localhost");
}

export function sessionFrom(request: Request) {
  const session = SessionSchema.safeParse(new URL(request.url).searchParams.get("session"));
  if (!session.success) throw json({ error: "Mã phiên không hợp lệ." }, 400);
  return session.data;
}

// Dùng chung vì mọi POST đều cần cùng giới hạn kích thước và cách báo lỗi.
export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const origin = request.headers.get("origin");
  if (origin && !isLocalOrigin(origin)) throw json({ error: "Nguồn gửi không được phép." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw json({ error: "Body phải có định dạng JSON." }, 415);
  }
  const reader = request.body?.getReader();
  if (!reader) throw json({ error: "Thiếu dữ liệu gửi lên." }, 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        throw json({ error: "Dữ liệu vượt quá 4 KB." }, 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw json({ error: "JSON không hợp lệ." }, 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw json({ error: "Dữ liệu gửi lên không hợp lệ." }, 400);
  return parsed.data;
}

export function errorResponse(error: unknown) {
  if (error instanceof Response) return error;
  console.error("ProtoLab request failed:", error);
  return json({ error: "Server gặp lỗi. Hãy thử lại." }, 500);
}
