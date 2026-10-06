# ProtoLab

Phòng thí nghiệm localhost để thao tác và đọc code của **Polling, Long polling, SSE, WebSocket và Webhook**. Mỗi tab là một ứng dụng nhỏ với backend thật và nhật ký gửi/nhận.

## Chạy project

Cần **Node.js 22.22+** và npm.

```sh
npm install
npm run dev
```

Mở **http://127.0.0.1:3000**. Một lệnh khởi động cả Next.js và WebSocket. `Ctrl+C` để dừng. Nếu đổi cổng, trên PowerShell:

```powershell
$env:PORT = '3001'
npm run dev
```

Bản production local:

```sh
npm run build
npm start
```

Dùng các script này; chạy `next dev` trực tiếp sẽ thiếu WebSocket `/ws`.

## Trình diễn trước người xem

Mỗi tab chỉ mở kết nối khi bấm bắt đầu. **Đặt lại** hoặc đổi tab tạo phiên mới và dọn kết nối/timer cũ. Riêng chat: dùng link **Mở thêm một phiên client** để hai cửa sổ vào cùng phòng; sau khi Đặt lại, mở lại link phòng mới.

| Tab | Thao tác | Điều cần quan sát |
| --- | --- | --- |
| Polling | Bấm **Bắt đầu theo dõi**, chờ vài giây rồi **Chuyển trạng thái** phía cửa hàng. | Client hỏi mỗi 2 giây kể cả khi chưa có thay đổi. Khách hàng cập nhật ở lần GET tiếp theo. |
| Long polling | Bấm **Bắt đầu nhận thông báo**, chờ rồi **Tạo thông báo**. Thử chờ hơn 20 giây không tạo sự kiện. | Chưa có thông báo thì server giữ request đến khi có thông báo hoặc timeout; đã có sẵn thì trả ngay. Nhận xong mới gửi request kế tiếp. |
| SSE | Bấm **Khởi chạy tác vụ**; chờ khoảng 6 giây. Thử **Chạy lại tác vụ** hoặc dừng giữa chừng. | Nhiều event tiến độ trên cùng một response; server kết thúc response khi hoàn thành, client đóng EventSource để không tự kết nối lại. |
| WebSocket | Nhập tên, **Kết nối**, mở người thứ hai bằng link, nhập tên khác và kết nối. | Gửi tin qua lại trên cùng kết nối; các phòng độc lập. |
| Webhook | Bấm **Thanh toán mô phỏng**, quan sát hai bên và mã sự kiện. | Provider trả `202 Accepted` ngay, sau đó POST webhook tới receiver (retry tối đa 3 lần, giữ nguyên `eventId`); browser truy vấn trạng thái cửa hàng bằng HTTP riêng. |

Webhook mô phỏng hai **vai trò backend trong cùng process Next.js**. Provider dùng `fetch` để tạo request HTTP thật tới receiver, không gọi trực tiếp hàm receiver. Đây không phải thanh toán thật.

## Cấu trúc và cách đọc source

```text
server.ts                      Khởi động Next + HTTP Upgrade cho /ws
src/
  app/
    page.tsx                   Trang chính
    layout.tsx                 Ngôn ngữ và metadata
    error.tsx                  Thử lại khi render lỗi
    globals.css                Token, layout, responsive và dark mode
    api/
      polling/route.ts         Đọc/đổi trạng thái đơn
      long-polling/route.ts    Chờ và tạo thông báo
      sse/route.ts             Mở stream và chạy tác vụ
      webhook/
        provider/route.ts     Gửi HTTP POST tới receiver cố định
        receiver/route.ts     Nhận event và cập nhật đơn
        status/route.ts       Trình duyệt đọc trạng thái
        log/route.ts          Nhật ký webhook đã nhận, chỉ để vẽ sơ đồ
  components/
    protocol-tabs.tsx          Chọn demo, session và Làm lại
    activity-log.tsx           Hook ghi log và timeline
    demo-status.tsx            Trạng thái có live region
    demos/*-demo.tsx           State + API trực tiếp + UX mỗi demo
    ui/                       Button/Tabs từ shadcn, style đã chỉnh
  server/
    event-store.ts             Memory, waiter, subscriber và timer
    http.ts                    Validation/body limit/JSON dùng chung
    websocket.ts               Phòng chat và broadcast
  lib/
    protocol-contracts.ts      Schema Zod và type payload
    utils.ts                   cn() cho component UI
 tests/protocols.test.ts        8 kiểm tra tích hợp
```

Đọc **component demo → route tương ứng → event-store**. Với chat, đọc `websocket-demo.tsx` → `server.ts` → `websocket.ts`.

Mỗi demo giữ state, gửi/nhận và markup trong cùng file để lần theo luồng học. Một số component dài hơn 200 dòng sau format vì chủ đích này; chỉ những phần thực sự lặp như log, UI primitive và validation HTTP mới dùng chung.

### API

GET dùng UUID qua `?session=...`. POST gửi JSON có `session` và `action`. Schema đầy đủ nằm trong `protocol-contracts.ts` và route tương ứng.

| Endpoint | Input chính | Response/event |
| --- | --- | --- |
| `GET /api/polling` | `session` | `{step, updatedAt}` |
| `POST /api/polling` | `action: advance / reset` | Trạng thái đơn |
| `GET /api/long-polling` | `session, after` | `{events, cursor, held, timedOut}` |
| `POST /api/long-polling` | `action: publish, text` hoặc `reset` | Batch thông báo |
| `GET /api/sse` | `session` | Named event `ready`, rồi `progress` |
| `POST /api/sse` | `action: start / reset` | `{ok: true}` |
| `POST /api/webhook/provider` | `action: pay / reset` | Pay: `202 {ok, eventId}`; webhook gửi sau response |
| `POST /api/webhook/receiver` | `{session, eventId, type: payment.succeeded}` | `{ok: true}` |
| `GET /api/webhook/status` | `session` | `{status, eventId, updatedAt}` |
| `GET /api/webhook/log` | `session` | `{webhooks: [{eventId, status, outcome, receivedAt}]}` |
| `WS /ws?room=UUID` | `{name, text}` | `{id, name, text, createdAt}` |

SSE đợi `ready` trước khi POST `start`, tránh phát sự kiện trước khi client đăng ký. Long polling dùng cursor tăng dần để nhận cả tin được tạo giữa hai request. Webhook gửi lại cùng `eventId` không thanh toán đơn hai lần.

## Kiểm tra

Giữ server đang chạy ở terminal thứ nhất, mở terminal thứ hai:

```sh
npm run typecheck
npm test
npm run build
```

Test mất khoảng 30 giây vì có timeout thật 20 giây và stream thật. Test không tự khởi động server. Nếu đổi cổng:

```powershell
$env:BASE_URL = 'http://127.0.0.1:3001'
npm test
```

Bao gồm: session độc lập, polling, long-poll delivery/replay/timeout, SSE nhiều event và cleanup, webhook/idempotency, WebSocket hai chiều/phòng riêng, payload sai, body quá lớn và Origin không được phép.

Checklist browser: đủ 5 demo; Làm lại/chuyển tab lúc đang chờ; hai cửa sổ chat; phím mũi tên và Enter cho tabs; viewport 320/768/1024/1440; zoom 400%; dark mode và reduced motion. Vùng timeline cuộn được bằng bàn phím. Status quan trọng có live region, không đọc từng log liên tục.

**Đã xác minh trong phiên triển khai:** TypeScript, production build và 8/8 integration test; browser đã thao tác polling, long polling, SSE chạy hai lần, webhook, chat hai client. Đã đo Webhook không tràn ngang ở 320px và các tab ở desktop thực tế. Người dùng dừng Computer Use bằng Escape trước khi hoàn tất ma trận responsive, keyboard, zoom 400%, dark mode và reduced motion; các mục đó chưa được đánh dấu đạt.

## Giới hạn có chủ đích

- Memory thuộc **một process**, mất khi restart. Đây là demo localhost, chưa có lưu trữ bền vững.
- Route Handlers dùng singleton `globalThis` để chia sẻ state trong Next và hạn chế reset khi hot reload. WebSocket giữ state riêng.
- Tối đa 1.000 phiên. Phiên không hoạt động quá 1 giờ được thu hồi khi có request mới. Mỗi phiên giữ 50 thông báo; UI giữ 100 tin chat và 80 log gần nhất.
- Server bind `127.0.0.1`; không cần database, Docker, đăng nhập hay dịch vụ ngoài.
- Webhook có secret demo ở backend, có thể đặt `WEBHOOK_SECRET` trước khi chạy. Secret không gửi xuống client; retry chỉ nằm trong memory (3 lần), chưa có chữ ký HMAC hay hàng đợi bền vững của production.
- Làm lại hoặc đổi tab tạo UUID mới; kết nối cũ đóng và memory cũ thu hồi theo giới hạn trên.
- Button/Tabs được tạo bằng shadcn CLI và chỉnh style. Dùng Radix cho accessibility; client gọi trực tiếp `fetch`, `EventSource`, `WebSocket`.

Tham khảo: [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [Custom Server](https://nextjs.org/docs/app/guides/custom-server), [shadcn/ui](https://ui.shadcn.com), [MDN SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events).
