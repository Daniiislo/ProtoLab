import { getSession } from "@/server/event-store";
import { errorResponse, json, sessionFrom } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nhật ký webhook cửa hàng đã nhận, chỉ để sơ đồ vẽ đúng phần trao đổi giữa hai backend.
// Đây không phải một bước của cơ chế webhook và không được vẽ trong sơ đồ.
export function GET(request: Request) {
  try {
    return json({ webhooks: getSession(sessionFrom(request)).webhooks });
  } catch (error) {
    return errorResponse(error);
  }
}
