import { z } from "zod";

const ErrorBodySchema = z.object({ error: z.string() });

// Lấy thông báo lỗi server gửi trong body; chỉ dùng fallback khi body không có.
export async function readError(response: Response, fallback: string) {
  try {
    const body = ErrorBodySchema.safeParse(await response.json());
    if (body.success) return body.data.error;
  } catch {
    // Body không phải JSON.
  }
  return fallback;
}
