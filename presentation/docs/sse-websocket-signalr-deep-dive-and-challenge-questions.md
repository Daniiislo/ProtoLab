# SSE, WebSocket và SignalR: Deep Dive & Challenge Questions

## Mục tiêu

Tài liệu này phục vụ ba mục đích:

1. Làm rõ bản chất kỹ thuật của SSE và WebSocket thay vì chỉ so sánh ở mức “một chiều/hai chiều”.
2. Đặt SignalR đúng vị trí trong kiến trúc: một framework chạy phía trên các transport, không phải một loại WebSocket.
3. Chuẩn bị bộ câu hỏi phản biện mà người nghe, interviewer hoặc reviewer có thể dùng để kiểm tra độ sâu của bài nói.

## Câu trả lời ngắn nhất về SignalR

> **SignalR không phải một dạng WebSocket.** WebSocket là một transport/protocol hai chiều cấp thấp. SignalR là framework real-time của ASP.NET Core, cung cấp Hub/RPC, quản lý kết nối, users/groups, serialization và lựa chọn transport. Nó ưu tiên WebSocket nhưng có thể fallback sang SSE hoặc Long Polling.

Một cách hình dung theo tầng:

```text
Business feature: chat, dashboard, notification, collaboration
                         ↓
SignalR API: Hub methods, users, groups, streaming, reconnect policy
                         ↓
SignalR Hub Protocol: JSON hoặc MessagePack, RPC/stream/ping
                         ↓
Transport: WebSocket | SSE + HTTP POST | Long Polling + HTTP POST
                         ↓
Network: HTTP/TCP/TLS
```

Vì vậy, câu hỏi “SignalR hay WebSocket?” thực chất thường là câu hỏi “dùng raw WebSocket hay dùng một framework abstraction chạy trên WebSocket và có fallback?”.

---

## 1. Deep dive: Server-Sent Events (SSE)

### 1.1 Bản chất

SSE là cơ chế server gửi một luồng sự kiện dạng text xuống client qua một HTTP response được giữ mở. Client thường dùng API `EventSource`; server trả về `Content-Type: text/event-stream`.

Đây vẫn là HTTP streaming, không phải một protocol hai chiều mới. Client mở request; server liên tục ghi thêm dữ liệu vào response đó.

```http
GET /events HTTP/1.1
Accept: text/event-stream

HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache

event: progress
id: 42
data: {"percent":70}

```

Một event kết thúc bằng một dòng trống. Các field chuẩn quan trọng:

- `data:` chứa payload; nhiều dòng `data:` liên tiếp được nối bằng ký tự newline.
- `event:` đặt tên loại event để client nghe bằng `addEventListener`.
- `id:` cập nhật last event ID của client.
- `retry:` gợi ý thời gian chờ trước khi client reconnect.
- Dòng bắt đầu bằng `:` là comment, thường được dùng làm heartbeat để proxy không đóng kết nối idle.

### 1.2 “SSE tự reconnect” không đồng nghĩa “không mất dữ liệu”

`EventSource` có cơ chế reconnect sẵn. Nếu server gửi `id`, trình duyệt lưu last event ID và gửi lại khi reconnect. Nhưng `Last-Event-ID` chỉ là một cursor; **server vẫn phải lưu/replay các event còn thiếu**. Nếu server không có event log hoặc retention phù hợp, reconnect vẫn có thể mất dữ liệu.

Các khái niệm cần tách riêng:

- **Reconnect:** mở lại đường truyền.
- **Resume/replay:** lấy lại dữ liệu từ vị trí cũ.
- **Deduplication:** bỏ event bị gửi lại.
- **Delivery semantics:** at-most-once, at-least-once hay exactly-once ở cấp ứng dụng.

SSE chỉ hỗ trợ một phần cơ chế; nó không tự cung cấp exactly-once delivery.

### 1.3 Một chiều nhưng không có nghĩa ứng dụng không thể gửi lên

Kênh SSE chỉ chạy server → client. Ứng dụng vẫn có thể dùng `fetch`/HTTP POST cho chiều client → server. Đây cũng là cách SignalR tạo abstraction hai chiều khi transport bên dưới là SSE: SSE để nhận, HTTP POST để gửi.

### 1.4 Authentication và browser API

Native `EventSource` không cho ứng dụng tùy ý gắn `Authorization` header. Các lựa chọn thường gặp là:

- cookie trên cùng origin;
- token trong URL/query string, kèm yêu cầu tránh log hoặc làm lộ URL;
- dùng `fetch` streaming nếu cần kiểm soát header và parsing;
- đặt một backend-for-frontend/reverse proxy phía trước.

Cần dùng HTTPS và kiểm soát CORS/credentials đúng cách.

### 1.5 Proxy buffering, timeout và heartbeat

Một response mở lâu có thể bị reverse proxy, CDN hoặc load balancer buffer hay đóng vì idle timeout. Production SSE thường cần:

- tắt buffering trên proxy phù hợp;
- flush dữ liệu sau mỗi event;
- gửi comment heartbeat định kỳ;
- hủy producer/timer khi client disconnect;
- đặt giới hạn số connection và tài nguyên cho mỗi client.

### 1.6 HTTP/1.1 và HTTP/2

Trên HTTP/1.1, browser thường có giới hạn thấp về số kết nối đồng thời tới cùng origin, gây vấn đề khi mở nhiều tab hoặc nhiều `EventSource`. Với HTTP/2, nhiều stream được multiplex trên một connection và giới hạn stream được thương lượng, nên vấn đề này giảm đáng kể.

### 1.7 Khi SSE là lựa chọn tốt

- AI token streaming hoặc progress streaming.
- Dashboard, monitoring, ticker và notification.
- Server là bên phát dữ liệu chủ yếu.
- Payload là text/JSON.
- Muốn tận dụng HTTP semantics và reconnect sẵn của `EventSource`.

SSE không phù hợp khi cần binary thật sự, tần suất client gửi lên cao, hoặc cần một kênh full-duplex duy nhất.

---

## 2. Deep dive: WebSocket

### 2.1 Bản chất

WebSocket tạo một kênh message-oriented, full-duplex và lâu dài giữa client và server. Với HTTP/1.1, kết nối thường bắt đầu bằng HTTP Upgrade và server trả `101 Switching Protocols`. Sau handshake, dữ liệu đi qua các WebSocket frame thay vì HTTP request/response thông thường.

Điểm dễ nói sai: **server không tự mở WebSocket tới một browser chưa kết nối**. Client vẫn là bên khởi tạo handshake; “server push” chỉ xảy ra sau khi kênh đã được thiết lập.

### 2.2 Frame không phải message nghiệp vụ

RFC 6455 định nghĩa:

- text frame;
- binary frame;
- continuation frame cho fragmentation;
- control frame: close, ping và pong.

Một application message có thể bị chia thành nhiều frame. Ứng dụng không nên xây logic phụ thuộc tùy tiện vào ranh giới frame bên dưới.

Frame từ browser/client lên server phải được mask. Masking không phải encryption; TLS (`wss://`) mới cung cấp confidentiality/integrity trên đường truyền.

### 2.3 WebSocket không tự định nghĩa business protocol

Raw WebSocket chỉ cho gửi text/binary message. Ứng dụng vẫn phải tự quyết định:

- schema và version của message;
- command/event/request/response correlation;
- authentication và authorization;
- room/topic/subscription;
- error format;
- heartbeat và timeout;
- reconnect/backoff;
- replay, sequence, acknowledgment và deduplication.

SignalR, Socket.IO và các framework khác tồn tại vì phần “sau khi socket mở” này thường phức tạp hơn handshake.

### 2.4 TCP đảm bảo thứ tự không có nghĩa ứng dụng không mất message

Trong một connection TCP còn sống, byte được truyền có thứ tự. Nhưng nếu connection rớt sau khi sender gọi `send`, ứng dụng có thể không biết receiver đã xử lý message chưa. Sau reconnect, đây là một connection mới.

Muốn đảm bảo nghiệp vụ phải bổ sung:

- message ID hoặc sequence number;
- ACK ở cấp ứng dụng;
- lưu event/message để replay;
- idempotent handler để xử lý duplicate;
- chính sách retry và retention.

“Exactly once” thường không đến miễn phí từ WebSocket; nó là thuộc tính của thiết kế toàn hệ thống.

### 2.5 Ping/pong, heartbeat và half-open connection

Protocol có ping/pong control frames, nhưng browser WebSocket API không cho JavaScript trực tiếp gửi ping frame. Ứng dụng browser thường dùng heartbeat message ở cấp ứng dụng hoặc dựa vào server/library để phát hiện timeout.

Heartbeat giúp phát hiện half-open connection — ví dụ mạng biến mất mà không có close handshake — và giữ cho proxy không đóng connection idle.

### 2.6 Backpressure

Browser `WebSocket` API truyền thống không có cơ chế backpressure cho luồng message nhận. Nếu server gửi nhanh hơn client xử lý, bộ nhớ có thể tăng hoặc UI bị nghẽn CPU. Phía gửi có thể theo dõi `bufferedAmount`, nhưng ứng dụng vẫn cần chiến lược:

- giới hạn tốc độ;
- batch/coalesce update;
- bỏ dữ liệu cũ với dữ liệu dạng “latest state wins”;
- giới hạn queue;
- ngắt client quá chậm;
- dùng cơ chế/protocol có flow control phù hợp.

### 2.7 Scale-out

Mỗi WebSocket là một connection lâu dài gắn với một server process. Khi có nhiều instance:

- server A không tự biết client đang nối với server B;
- broadcast/group cần một backplane/pub-sub hoặc managed service;
- presence cần shared state hoặc chiến lược eventual consistency;
- reconnect có thể vào instance khác;
- deploy và restart cần connection draining/graceful shutdown.

Sticky session không thay thế backplane: nó chỉ giữ một client ở cùng instance, không giúp server A gửi message tới client của server B.

### 2.8 Security

Các câu hỏi production cần trả lời:

- Dùng `wss://` chưa?
- Xác thực diễn ra ở handshake hay message đầu tiên?
- Có kiểm tra `Origin` không? CORS không tự bảo vệ WebSocket như HTTP `fetch`.
- Có authorization cho từng action/room không, hay chỉ authenticate một lần rồi tin mọi message?
- Có giới hạn payload, rate limit, schema validation và timeout không?
- Có tránh log token trong URL/query string không?
- Có xử lý connection hijacking, abuse và resource exhaustion không?

---

## 3. Deep dive: SignalR

### 3.1 SignalR thêm gì lên trên transport?

ASP.NET Core SignalR cung cấp:

- Hub methods/RPC giữa client và server;
- gửi tới caller, một client, một user, một group hoặc toàn bộ clients;
- serialization bằng JSON mặc định hoặc MessagePack;
- transport negotiation và fallback;
- connection lifecycle, keep-alive và timeout;
- client/server streaming;
- lựa chọn scale-out qua Azure SignalR Service hoặc Redis backplane.

Raw WebSocket client không thể tự động nói chuyện với SignalR Hub chỉ bằng cách mở socket và gửi JSON tùy ý. Nó phải thực hiện SignalR negotiation/handshake và tuân thủ Hub Protocol.

### 3.2 SignalR chọn transport như thế nào?

Mặc định SignalR hỗ trợ, theo thứ tự ưu tiên:

1. WebSocket;
2. Server-Sent Events;
3. Long Polling.

Client và server có thể giới hạn transport. Có thể bỏ bước negotiate khi chắc chắn chỉ dùng WebSocket, nhưng điều đó làm mất fallback và có ảnh hưởng tới cách triển khai/scale.

Khi dùng SSE hoặc Long Polling, SignalR ghép transport nhận server → client với HTTP POST cho client → server để tạo abstraction duplex.

### 3.3 Hub Protocol khác transport protocol

- **Transport** trả lời: byte/message đi qua mạng bằng cách nào?
- **Hub Protocol** trả lời: message đó có nghĩa là invoke method, result, stream item, cancel, ping hay completion?

SignalR có JSON Hub Protocol và MessagePack Hub Protocol. Chọn MessagePack có thể giảm kích thước payload nhưng tăng độ khó quan sát/debug và yêu cầu client hỗ trợ tương ứng.

### 3.4 Reconnect không phải mặc định tuyệt đối

JavaScript client của ASP.NET Core SignalR không tự reconnect nếu chưa gọi `withAutomaticReconnect()`. Cấu hình mặc định của method này thử lại sau 0, 2, 10 và 30 giây rồi dừng.

Ngoài reconnect transport, ứng dụng vẫn phải quyết định:

- có cần join lại group hay khôi phục subscription không;
- dữ liệu nào đã bị lỡ;
- có cần replay theo cursor không;
- UI hiển thị trạng thái disconnected/reconnecting thế nào;
- command đang gửi dở được retry hay không.

### 3.5 Scale SignalR

Trong server farm, SignalR thường cần session affinity vì một logical connection có thể dùng nhiều HTTP request, đặc biệt khi negotiate/fallback. Microsoft nêu ba trường hợp không cần sticky session: một process duy nhất; dùng Azure SignalR Service; hoặc mọi client chỉ dùng WebSocket và bật `SkipNegotiation`.

Để broadcast giữa nhiều instance, lựa chọn phổ biến là:

- Azure SignalR Service quản lý connection và scale;
- Redis backplane chuyển tiếp message giữa các server.

Backplane không tự đảm bảo lưu message khi nó bị down; application vẫn phải thiết kế durability nếu nghiệp vụ yêu cầu.

### 3.6 Khi nên và không nên chọn SignalR

**Nên cân nhắc SignalR khi:**

- backend là ASP.NET Core;
- cần Hub/RPC, groups, users, streaming và quản lý lifecycle;
- muốn fallback transport và client SDK;
- muốn tích hợp Azure SignalR Service/Redis scale-out.

**Raw WebSocket có thể hợp hơn khi:**

- cần protocol tùy biến rất chặt hoặc tương thích với hệ sinh thái không dùng SignalR;
- cần giảm abstraction/overhead tới mức tối thiểu;
- đã có hạ tầng connection, routing, replay và observability riêng;
- cần kiểm soát framing/subprotocol ở mức thấp.

**SSE có thể hợp hơn cả hai khi:** server chủ yếu stream text một chiều và HTTP POST thông thường đã đủ cho chiều ngược lại.

---

## 4. Bảng so sánh trọng tâm

| Tiêu chí | Native SSE | Raw WebSocket | ASP.NET Core SignalR |
| --- | --- | --- | --- |
| Mức abstraction | Transport một chiều | Transport hai chiều | Framework real-time + Hub Protocol |
| Transport thực tế | HTTP event stream | WebSocket | WebSocket, SSE hoặc Long Polling |
| Hướng dữ liệu trên một kênh | Server → client | Full-duplex | API duplex; cách truyền phụ thuộc transport |
| Client gửi lên | HTTP request riêng | Cùng connection | Cùng WebSocket hoặc HTTP POST nếu dùng SSE/Long Polling |
| Payload | UTF-8 text | Text hoặc binary | JSON mặc định; MessagePack tùy chọn và phụ thuộc transport |
| Reconnect | `EventSource` tự reconnect | Tự xây | Opt-in bằng client API; vẫn cần logic khôi phục nghiệp vụ |
| Replay dữ liệu bị lỡ | Server phải triển khai theo event ID | Tự triển khai | Không mặc nhiên có; ứng dụng vẫn phải thiết kế |
| Business routing | Tự xây | Tự xây | Hubs, clients, users, groups |
| Backpressure browser | Phụ thuộc HTTP stream và xử lý app | Native API không có receive backpressure | Có buffer/limit ở framework nhưng vẫn phải quản trị tải |
| Scale-out | Shared event source/pub-sub | Backplane/pub-sub/managed gateway | Azure SignalR Service hoặc Redis backplane |
| Phù hợp nhất | Stream text một chiều | Protocol hai chiều tùy biến | Ứng dụng ASP.NET Core cần abstraction cấp cao |

---

## 5. Bộ câu hỏi challenge

### A. Câu hỏi nền tảng

1. “Real-time” trong bài của bạn nghĩa là gì? Có ngưỡng latency cụ thể không, hay chỉ có nghĩa dữ liệu được push?
   - **Điểm cần trả lời:** real-time trên web thường là near-real-time; cần nói latency budget, update frequency và business SLA.

2. Tại sao không dùng Polling với interval 100 ms để đạt độ trễ thấp như WebSocket?
   - **Điểm cần trả lời:** request/header overhead, tải server, pin connection/resource, burst đồng bộ giữa clients, rate limit và phần lớn response không đổi.

3. Bạn đang so sánh protocol, browser API hay framework? Vì sao phải tách ba lớp này?
   - **Điểm cần trả lời:** SSE/WebSocket là transport/API; SignalR là framework + application protocol; nếu trộn lớp sẽ dẫn tới so sánh sai.

4. “Một kết nối” có thực sự là một TCP connection trong mọi trường hợp HTTP/1.1, HTTP/2 và qua proxy không?
   - **Điểm cần trả lời:** logical stream và physical connection không luôn đồng nhất; HTTP/2 multiplex nhiều stream, proxy có thể terminate rồi mở upstream connection khác.

### B. Challenge về SSE

5. SSE nói “tự reconnect”, vậy vì sao vẫn có thể mất event?
   - **Điểm cần trả lời:** reconnect chỉ mở lại stream; replay cần `id`, `Last-Event-ID`, event log và retention phía server.

6. `Last-Event-ID` đảm bảo exactly-once không?
   - **Điểm cần trả lời:** không; reconnect/retry có thể tạo duplicate, server và client cần cursor/dedup/idempotency.

7. SSE chỉ một chiều; vậy một ứng dụng chat có dùng SSE được không?
   - **Điểm cần trả lời:** có thể dùng SSE nhận + POST gửi, nhưng hai channel và semantics phức tạp hơn; cần đánh giá tần suất gửi và nhu cầu full-duplex.

8. Nếu payload là JSON lớn hoặc binary thì sao?
   - **Điểm cần trả lời:** SSE là UTF-8 text; binary phải encode như Base64 gây overhead, nên cân nhắc WebSocket/fetch streaming.

9. Event SSE được phân tách như thế nào? Nếu quên dòng trống cuối event thì chuyện gì xảy ra?
   - **Điểm cần trả lời:** event kết thúc bằng blank line; thiếu delimiter khiến client tiếp tục buffer và chưa dispatch.

10. `event`, `data`, `id`, `retry` khác nhau thế nào?
    - **Điểm cần trả lời:** event name, payload, resume cursor, reconnect delay.

11. Vì sao demo cần đợi event `ready` rồi mới POST `start`?
    - **Điểm cần trả lời:** tránh race trong đó producer phát event trước khi subscriber/stream được đăng ký.

12. Proxy buffering làm SSE “không còn real-time” thế nào và bạn phát hiện ra sao?
    - **Điểm cần trả lời:** proxy gom chunk rồi mới flush; đo timestamp, kiểm tra headers/config, heartbeat, disable buffering.

13. Nhiều tab cùng mở SSE có vấn đề gì trên HTTP/1.1? HTTP/2 thay đổi điều gì?
    - **Điểm cần trả lời:** giới hạn connection thấp theo origin trên HTTP/1.1; HTTP/2 multiplex và giới hạn concurrent streams được thương lượng.

14. Native `EventSource` gửi bearer token bằng `Authorization` header được không?
    - **Điểm cần trả lời:** API không cho custom header; thường dùng cookie/same-origin, token query với biện pháp chống leak, BFF hoặc fetch streaming.

### C. Challenge về WebSocket

15. WebSocket có thực sự “server chủ động kết nối tới client” không?
    - **Điểm cần trả lời:** không; browser/client khởi tạo handshake, server chỉ push sau khi connection tồn tại.

16. Sau `101 Switching Protocols`, HTTP còn đóng vai trò gì trong dữ liệu ứng dụng?
    - **Điểm cần trả lời:** handshake dùng HTTP/1.1; sau upgrade trao đổi WebSocket frames, không còn mỗi message là HTTP request/response.

17. Message và frame có phải một không?
    - **Điểm cần trả lời:** không; message có thể gồm nhiều fragmented frames; control frame có thể xen giữa.

18. Vì sao browser phải mask frame gửi lên? Masking có thay TLS không?
    - **Điểm cần trả lời:** chống một lớp tấn công vào intermediary/proxy; không phải encryption; vẫn cần `wss://`.

19. WebSocket chạy trên TCP nên có đảm bảo không mất và không trùng message không?
    - **Điểm cần trả lời:** chỉ có ordered reliable byte stream khi connection còn sống; rớt kết nối tạo trạng thái mơ hồ, reconnect/retry cần ACK, sequence, replay và idempotency.

20. Nếu client xử lý chậm hơn tốc độ server gửi thì điều gì xảy ra?
    - **Điểm cần trả lời:** native browser WebSocket thiếu receive backpressure; buffer/memory/CPU tăng; cần rate limit, batching, drop/coalesce hoặc disconnect slow consumer.

21. Ping/pong khác application heartbeat thế nào? JavaScript trong browser có tự gửi ping frame được không?
    - **Điểm cần trả lời:** ping/pong là control frame; browser API không expose trực tiếp, nên thường dùng app-level heartbeat hoặc server/library.

22. `close` event có luôn xảy ra ngay khi người dùng mất Wi-Fi không?
    - **Điểm cần trả lời:** không; half-open connection cần timeout/heartbeat để phát hiện.

23. CORS có bảo vệ WebSocket endpoint không?
    - **Điểm cần trả lời:** không theo cùng cách với fetch; phải kiểm tra Origin, authenticate, authorize action và dùng WSS.

24. Khi scale lên ba server, gửi message vào room hoạt động thế nào?
    - **Điểm cần trả lời:** connection nằm rải ở các instance; cần shared pub/sub/backplane và shared/derived room membership; sticky session một mình không đủ cho cross-node broadcast.

25. Trong deploy rolling update, bạn xử lý hàng nghìn connection đang mở thế nào?
    - **Điểm cần trả lời:** draining, readiness, grace period, close code/reconnect jitter, replay missed data và capacity headroom.

### D. Challenge về SignalR

26. SignalR có phải wrapper mỏng của WebSocket không?
    - **Điểm cần trả lời:** không; có negotiation, fallback, Hub Protocol, RPC/streaming, lifecycle, users/groups và scale-out integration.

27. Nếu SignalR fallback sang SSE, tại sao API vẫn cho client gọi method server?
    - **Điểm cần trả lời:** SSE nhận server → client; HTTP POST gửi client → server; framework ghép hai half-transports thành abstraction duplex.

28. Một raw WebSocket client có kết nối trực tiếp tới SignalR Hub được không?
    - **Điểm cần trả lời:** mở transport thôi chưa đủ; client phải nói đúng negotiation/handshake/framing và Hub Protocol.

29. SignalR tự động reconnect phải không?
    - **Điểm cần trả lời:** JavaScript client phải opt-in bằng `withAutomaticReconnect`; initial start failure vẫn cần logic retry riêng; reconnect không tự replay business data.

30. Dùng SignalR có đảm bảo message exactly once không?
    - **Điểm cần trả lời:** không; framework không thay thế transaction, durable log, ACK/dedup và idempotency ở cấp ứng dụng.

31. JSON và MessagePack trong SignalR là transport hay serialization protocol?
    - **Điểm cần trả lời:** Hub Protocol/encoding chạy phía trên transport; JSON mặc định, MessagePack binary nhỏ hơn nhưng yêu cầu hỗ trợ tương ứng.

32. Khi nào bạn ép SignalR chỉ dùng WebSocket và skip negotiation?
    - **Điểm cần trả lời:** khi hạ tầng chắc chắn hỗ trợ WebSocket và chấp nhận mất fallback; phải cân nhắc load balancer, client compatibility và hosting.

33. Redis backplane giải quyết gì và không giải quyết gì?
    - **Điểm cần trả lời:** chuyển message giữa instances; không mặc nhiên tạo durable delivery, replay hoặc lưu message khi Redis/downstream lỗi.

34. Vì sao SignalR thường cần sticky session khi scale?
    - **Điểm cần trả lời:** negotiate/SSE/Long Polling có nhiều HTTP request thuộc cùng logical connection; ngoại lệ gồm single process, Azure SignalR Service, hoặc WebSocket-only + skip negotiation.

35. Nếu bài toán chỉ là stream token từ LLM xuống browser, tại sao SignalR có thể là overkill?
    - **Điểm cần trả lời:** SSE/fetch streaming đơn giản hơn, giữ HTTP semantics và đủ một chiều; SignalR hợp khi cần thêm Hub/groups/duplex/lifecycle.

### E. Câu hỏi bám trực tiếp vào demo hiện tại

36. Demo WebSocket hiện tại xử lý reconnect, heartbeat và replay chưa? Nếu chưa, nó đang chứng minh điều gì và chưa chứng minh điều gì?
37. Room membership đang nằm trong memory của một process; chuyện gì xảy ra khi chạy hai instance?
38. `maxPayload: 4096` bảo vệ hệ thống khỏi loại rủi ro nào? Nó chưa thay thế rate limit ở điểm nào?
39. Demo kiểm tra `Origin`; điều đó khác authentication và authorization ra sao?
40. Demo SSE đóng `EventSource` sau event cuối để làm gì? Nếu không đóng thì browser sẽ làm gì?
41. Demo SSE hủy timer khi client abort; nếu không cleanup thì có hậu quả gì?
42. Long polling của demo dùng cursor tăng dần. Cursor đó giải quyết race giữa hai request như thế nào?

---

## 6. Những phát biểu dễ bị bắt lỗi trên sân khấu

Tránh nói tuyệt đối như sau:

- Sai: “SSE reconnect nên không bao giờ mất dữ liệu.”
  - Nên nói: “SSE có reconnect sẵn; muốn resume không mất dữ liệu, server phải hỗ trợ event ID và replay.”
- Sai: “WebSocket đảm bảo message luôn tới đúng một lần.”
  - Nên nói: “WebSocket dựa trên TCP khi connection còn sống; delivery qua reconnect vẫn cần thiết kế ở cấp ứng dụng.”
- Sai: “SignalR là một loại WebSocket.”
  - Nên nói: “SignalR là framework phía trên WebSocket/SSE/Long Polling.”
- Sai: “WebSocket luôn nhanh hơn SSE.”
  - Nên nói: “Hiệu năng phụ thuộc workload; với stream một chiều, SSE có thể đơn giản và đủ nhanh.”
- Sai: “Có sticky session là scale WebSocket xong.”
  - Nên nói: “Sticky session giữ connection ở một node; cross-node messaging vẫn cần backplane/pub-sub.”
- Sai: “CORS bảo vệ WebSocket.”
  - Nên nói: “WebSocket cần kiểm tra Origin và authorization riêng; CORS không áp dụng như với fetch.”

---

## 7. Mạch trình bày đề xuất

1. **Định nghĩa bài toán:** từ “client phải hỏi” tới “server có thể push”.
2. **Polling và Long Polling:** dùng nhanh để tạo động lực, không dành quá nhiều thời gian.
3. **SSE deep dive:** HTTP stream, event format, reconnect và sự thật về replay.
4. **WebSocket deep dive:** handshake, frame, full-duplex, reconnect và scale.
5. **Khoảng trống của raw transport:** room, RPC, serialization, reconnect, scale-out.
6. **SignalR xuất hiện:** framework giải quyết phần plumbing, dùng WebSocket nếu có và fallback khi cần.
7. **Decision guide:** SSE vs raw WebSocket vs SignalR theo use case.
8. **Demo:** chỉ rõ demo chứng minh transport behavior nào và production còn thiếu gì.

## 8. Nguồn chính thức

- [MDN — Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [WHATWG HTML — Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [MDN — WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [RFC 6455 — The WebSocket Protocol](https://www.rfc-editor.org/rfc/rfc6455)
- [Microsoft Learn — Overview of ASP.NET Core SignalR](https://learn.microsoft.com/en-us/aspnet/core/signalr/introduction?view=aspnetcore-10.0)
- [Microsoft Learn — ASP.NET Core SignalR JavaScript client](https://learn.microsoft.com/en-us/aspnet/core/signalr/javascript-client?view=aspnetcore-10.0)
- [Microsoft Learn — SignalR configuration](https://learn.microsoft.com/en-us/aspnet/core/signalr/configuration?view=aspnetcore-10.0)
- [Microsoft Learn — Hosting and scaling SignalR](https://learn.microsoft.com/en-us/aspnet/core/signalr/scale?view=aspnetcore-10.0)
- [ASP.NET Core repository — SignalR Transport Protocols](https://github.com/dotnet/aspnetcore/blob/main/src/SignalR/docs/specs/TransportProtocols.md)
- [ASP.NET Core repository — SignalR Hub Protocol](https://github.com/dotnet/aspnetcore/blob/main/src/SignalR/docs/specs/HubProtocol.md)
