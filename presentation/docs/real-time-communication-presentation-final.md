# Real-time Communication on the Web — Final Presentation Guide

**Presenter:** Tavian Nguyen\
**Cập nhật:** 07/10/2026\
**Deck:** [Real-time Communication on the Web.pptx](../Real-time%20Communication%20on%20the%20Web.pptx)

Tài liệu chuẩn bị bằng tiếng Việt, bám đúng 12 slide tiếng Anh hiện tại. Đây là bản tổng hợp final cho buổi nói, không phải nội dung để nhồi lên slide và không được nhúng làm speaker notes. SignalR và Webhook nằm ngoài phạm vi.

Các bản draft trước giữ lại làm lịch sử. Khi khác nhau, dùng phạm vi và diễn giải trong tài liệu này. Câu chuyện mở đầu là tình huống mẫu đã được biên soạn theo yêu cầu, không phải xác minh triển khai production; không có số liệu benchmark giả định.

## 1. Thông điệp xuyên suốt

**Chọn cách trao đổi phù hợp với nhu cầu. Đường truyền giúp cập nhật nhanh; lưu trữ, phân quyền và khôi phục giúp tính năng đáng tin cậy.**

Real-time trong buổi này là trải nghiệm cập nhật với độ trễ thấp khi online, không phải bảo đảm tức thì tuyệt đối hay hệ thống hard real-time.

## 2. Agenda

1. **Pain Points & Approach** — Hai tình huống mở đầu và hướng xử lý.
2. **Real-time Communication Methods** — Polling, Long Polling, SSE, WebSocket.
3. **Lessons Learned & Trade-offs** — Xử lý mất kết nối và chọn giải pháp vừa đủ.
4. **Demo - Q&A** — Quan sát hành vi thực tế, giải đáp câu hỏi.

## 3. Nội dung theo 12 slide

### Slide 01 — Real-time Communication on the Web

Bìa chỉ cần giới thiệu chủ đề và người trình bày: Tavian Nguyen.

Trọng tâm buổi nói là một câu hỏi thực tế: server đã có dữ liệu mới, làm sao trình duyệt biết mà không cần người dùng refresh? Hai ví dụ là chuông thông báo forum và chat giữa các thành viên.

### Slide 02 — Agenda

Giới thiệu bốn phần lớn. Pain point tạo bối cảnh, không phải hai chương giải pháp riêng. Phần phương thức dùng cùng sơ đồ browser–server để khán giả dễ so sánh. Chi tiết frame/opcode, hạ tầng scale-out và framework không phải trọng tâm.

### Slide 03 — Why Are Notifications Late?

**Vấn đề:** An đang mở forum. Bình trả lời bài viết của An. Server đã lưu phản hồi nhưng chuông của An vẫn chưa đổi.

Trong tình huống mẫu, cách ban đầu là polling: browser kiểm tra theo chu kỳ. Nếu phản hồi đến ngay sau một lần kiểm tra, giao diện phải đợi lần tiếp theo. Kiểm tra thường xuyên hơn giảm phần chờ này nhưng tăng số request, kể cả lúc không có thay đổi.

**Hướng xử lý:** browser mở SSE để nhận cập nhật từ server. Có phản hồi mới → server xác định người nhận và lưu notification → đẩy event đến phiên online → UI cập nhật chuông.

SSE hợp lý ở đây vì luồng thông báo chủ yếu đi từ server xuống. Đăng bài và đánh dấu đã đọc vẫn dùng HTTP API bình thường. SSE trong tình huống này phục vụ trang đang mở; không hứa tiếp tục thông báo khi trang đã đóng. [MDN — SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)

**Chốt:** dữ liệu có trên server chưa có nghĩa UI đã biết; mình cần một cơ chế thông báo cho UI.

### Slide 04 — Why Does Chat Feel Slow?

**Vấn đề:** An gửi tin nhưng Bình chưa thấy, phải đợi lần kiểm tra tiếp theo. Khi trả lời qua lại thường xuyên, cảm giác chờ khiến cuộc hội thoại thiếu tự nhiên.

**Hướng xử lý:** dùng WebSocket cho màn hình chat. Mỗi browser kết nối tới server; server kiểm tra quyền và chuyển tin đến người nhận. Hai browser không nói chuyện trực tiếp kiểu peer-to-peer trong kiến trúc này.

Lý do chọn: cả gửi và nhận diễn ra thường xuyên; có thể kèm typing và xác nhận trạng thái. Đây là lựa chọn phù hợp cho ví dụ, không phải quy tắc chat bắt buộc dùng WebSocket. Chat đơn giản vẫn có thể gửi bằng HTTP POST và nhận bằng SSE.

**Chuyển phần:** Vậy khác nhau giữa việc hỏi định kỳ, chờ một câu trả lời và giữ một kênh mở là gì?

### Slide 05 — From Repeated Requests to Live Connections

Đọc sơ đồ theo cách tương tác:

- **Polling:** hỏi lại theo chu kỳ.
- **Long Polling:** hỏi, đợi server trả lời, rồi hỏi tiếp.
- **SSE:** mở luồng để server gửi nhiều event.
- **WebSocket:** mở kênh để cả hai bên gửi độc lập.

Đây là mạch giải thích từ repeated requests đến long-lived channels, không phải bảng xếp hạng công nghệ hay khẳng định cái sau luôn thay thế cái trước.

**Chốt:** Different trade-offs. No universal winner.

### Slide 06 — Polling

**Cách hoạt động:** browser gọi API → server trả lời → browser đợi interval → gọi lại.

Đi theo sơ đồ: lần đầu hỏi “có gì mới?” và nhận “chưa có”; sau khoảng đợi, lần sau mới nhận dữ liệu mới. Mỗi response kết thúc một request, nhưng nhiều request có thể dùng lại kết nối HTTP bên dưới; không phải lần nào cũng mở TCP mới.

**Phù hợp:** dữ liệu không cần cập nhật quá nhanh, số người dùng/tần suất cho phép và ưu tiên dễ xây dựng, debug.

**Đánh đổi:** interval ngắn hơn thường giảm thời gian đợi tới lần kiểm tra nhưng tăng request. Độ trễ còn gồm mạng, xử lý server, lịch chạy browser; không nói độ trễ tối đa luôn bằng interval.

Ví dụ minh họa: chu kỳ 5 giây thì một cập nhật đến ngay sau lần kiểm tra có thể phải đợi gần 5 giây mới được hỏi lại, cộng thêm thời gian xử lý và truyền tải. Đây không phải số đo của project.

### Slide 07 — Long Polling

**Cách hoạt động:** browser gửi request. Server chưa có dữ liệu thì giữ request. Khi có event hoặc hết thời gian chờ, server trả response; browser gửi request tiếp theo.

Khác với polling: thời gian chờ chính nằm ở request đang pending trên server, không chỉ ở timer phía browser sau response.

**Lợi ích:** trong nhiều tình huống cập nhật thưa, giảm số lần trả lời rỗng và gửi dữ liệu sớm khi nó xuất hiện.

**Đánh đổi:** vẫn có chu trình request/response; phải xử lý timeout, retry, client rời trang. Có thể dùng cursor/lịch sử để không bỏ sót dữ liệu giữa các lượt; mất tin không phải tính chất bắt buộc của long polling.

**Chốt:** giữ một request chờ khác với giữ một response để stream nhiều event.

### Slide 08 — Server-Sent Events

**Cách hoạt động:** browser mở một HTTP event stream; server tiếp tục gửi các event trên response đó. Trong sơ đồ, New reply, New mention và Unread count đi cùng chiều server → browser.

SSE dùng định dạng text UTF-8; JSON có thể nằm trong trường `data`. Browser thường sử dụng `EventSource`. Các hành động phía client vẫn có thể dùng request HTTP riêng.

**Tại sao hợp với thông báo:** server biết có hoạt động mới và chủ động báo cho browser đang online; phía nhận không phải hỏi theo từng chu kỳ.

**Điểm phải nhớ:** EventSource hỗ trợ reconnect, nhưng để có dữ liệu bị lỡ, server phải có lịch sử/cơ chế đồng bộ. `Last-Event-ID` cung cấp dấu để server xử lý tiếp, không tự biến server thành kho replay. [WHATWG — Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)

Với chuông thông báo, một giải pháp thực tế là sau reconnect lấy lại danh sách chưa đọc và bộ đếm từ API. Ngoài ra phải kiểm tra buffering/timeout ở proxy để event không bị giữ lại rồi gửi dồn.

**Chốt:** One open stream. Server to browser.

### Slide 09 — WebSocket

**Cách hoạt động:** browser khởi tạo kết nối; sau khi thiết lập, client và server đều có thể gửi message mà không phải tạo một HTTP request mới cho từng message. Hai chiều có thể hoạt động độc lập, không phải chờ đến lượt. [RFC 6455](https://datatracker.ietf.org/doc/html/rfc6455)

**Áp dụng cho chat:** An gửi → server kiểm tra quyền cuộc hội thoại → lưu tin → xác nhận theo hợp đồng ứng dụng → chuyển tới phiên online của Bình. Bình trả lời qua kết nối của mình. Typing indicator có thể gửi trên cùng kênh nhưng thường không cần lưu như lịch sử chat.

**Điểm phải nhớ:** `send()` chỉ đưa dữ liệu vào hàng đợi gửi, không chứng minh đã lưu, đã giao hay đã đọc. Các trạng thái đó cần xác nhận ở tầng ứng dụng. [MDN — WebSocket.send()](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/send)

Raw WebSocket cần ứng dụng/thư viện xử lý reconnect và lấy bù. Một kết nối đang hoạt động truyền dữ liệu có thứ tự không đồng nghĩa một kết nối mới tự biết phần lịch sử bị thiếu.

**Chốt:** One connection. Both directions. Reliability is application work.

### Slide 10 — Build for Disconnects

Nghĩa dễ hiểu: **thiết kế để ứng dụng vẫn phục hồi được sau mất kết nối**. Đây là bài học thực tế, không phải phương thức truyền dữ liệu thứ năm.

Đi qua ba cụm trên slide:

1. **Disconnect / Show state:** báo đang mất kết nối; không để tin pending trông như đã giao.
2. **Reconnect / Backoff + jitter:** thử lại có khoảng chờ và độ ngẫu nhiên, tránh tất cả client cùng retry dồn dập.
3. **Recover / Resume + deduplicate:** lấy phần thiếu rồi ghép theo ID, tránh thêm tin trùng.

Ví dụ: đã nhận #10, mất mạng khi có #11–#12, kết nối lại nhận #13. Reconnect chỉ mở lại đường truyền. Muốn đủ lịch sử cần lấy bù #11–#12 từ dữ liệu server đã lưu.

Vì phản hồi xác nhận có thể bị mất, retry đôi khi đưa cùng thao tác tới server nhiều lần. Một lần gửi phải có ID ổn định để server nhận ra bản retry, còn phía nhận ghép tin theo ID.

**Chốt:** Reconnect ≠ recovery. Không cần trình bày thuật toán chi tiết; điều quan trọng là nhận ra hai việc khác nhau.

Đọc giải thích đầy đủ và ví dụ tại [Build for Disconnects — Reconnect Is Not Recovery](build-for-disconnects-explained.md).

### Slide 11 — Choose What Fits

Slide có ba phần: bốn dòng "nhu cầu → phương thức" (bên trái), thẻ **Best practice** và thẻ **Avoid** (bên phải), rồi câu chốt. Bốn dòng bên trái là điểm khởi đầu lựa chọn, không phải luật tuyệt đối. Slide không ghi chi phí của từng phương thức, nên phần đó nói bằng lời:

| Nhu cầu (trên slide) | Bắt đầu với | Nói thêm bằng lời (không có trên slide) |
| --- | --- | --- |
| Periodic updates | Polling | Đơn giản, nhưng phần lớn request không có gì mới |
| Earlier updates | Long polling | Cập nhật sớm hơn, nhưng phải giữ request và xử lý timeout |
| Server push | SSE | Một chiều; lấy lại sự kiện bị lỡ là việc của ứng dụng |
| Two-way interaction | WebSocket | Hai chiều, nhưng reconnect và mở rộng quy mô là việc của ứng dụng |

Long polling vẫn là lựa chọn khi các phương án khác không phù hợp với hạ tầng; đó là lý do nó có một dòng riêng.

#### Best practice và Avoid trên slide

Mỗi thẻ có hai ý, đều nói được trong khoảng 20 giây, không cần thuật ngữ, và không lặp slide 9, 10.

| Best practice | Avoid |
| --- | --- |
| Start with the simplest that fits | Assuming the connection stays alive |
| Share one connection per app | Polling every second to feel real-time |

**Best practice**

1. **Start with the simplest that fits.**
   - *Nói:* "Đừng bắt đầu bằng thứ phức tạp nhất. Chậm vài giây không sao thì polling là đủ. Cần sớm hơn thì SSE. Cần hai chiều liên tục thì mới đến WebSocket."
   - *Ví dụ:* bảng điểm cập nhật mỗi 10 giây không cần WebSocket.
   - *Vì sao:* càng phức tạp, càng nhiều thứ phải tự quản lý. Đây cũng là ý của câu chốt "More connection management".
2. **Share one connection per app.**
   - *Nói:* "Mỗi kết nối mở là một thứ server phải giữ. Nếu ô thông báo, ô chat, ô trạng thái mỗi ô tự mở một kết nối thì sẽ rất nhanh quá nhiều. Hãy mở một kết nối và dùng chung."
   - *Thêm nếu muốn:* với SSE trên HTTP/1.1, trình duyệt chỉ cho khoảng 6 kết nối cho mỗi domain ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)).

**Avoid**

1. **Assuming the connection stays alive.**
   - *Nói:* "Đổi Wi-Fi, máy ngủ, đi qua proxy: kết nối có thể chết mà không ai báo. Hãy gửi định kỳ một tin nhỏ kiểu 'còn đó không?' để biết sớm."
   - *Nguồn:* WebSocket có ping/pong để kiểm tra còn sống ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers)); với SSE, spec gợi ý gửi một dòng comment khoảng mỗi 15 giây ([WHATWG](https://html.spec.whatwg.org/multipage/server-sent-events.html)).
2. **Polling every second to feel real-time.**
   - *Nói:* "Hỏi mỗi giây nghe như thời gian thực, nhưng 1.000 người dùng nghĩa là 1.000 request mỗi giây, mà phần lớn câu trả lời chỉ là 'chưa có gì mới'. Nếu thật sự cần nhanh đến vậy, đó là dấu hiệu nên chuyển sang long polling hoặc SSE."
   - *Ví dụ:* 1.000 người × 1 request/giây = 1.000 request/giây, kể cả khi cả ngày chỉ có vài thay đổi.
   - *Ghi chú:* đây là phép tính, không cần nguồn. Nó nối về slide 6 (polling tốn request vô ích) và về chủ đề "chọn vừa đủ".

**Ý dự phòng (đã bỏ khỏi slide, dùng khi cần nói thêm hoặc trả lời Q&A):**

- **Check permissions on the server, always.** "Giống soát vé ở từng cửa, không chỉ cửa chính. Kết nối đã mở không có nghĩa người đó được xem mọi thứ." OWASP khuyên kiểm tra quyền cho từng hành động, không chỉ lúc kết nối ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)).
- **WebSocket "just in case".** "WebSocket rất mạnh, nhưng bạn phải tự lo nối lại, xác nhận, và nhiều server. Chỉ cần server báo tin xuống thì SSE đơn giản hơn." Chat vẫn làm được bằng POST để gửi và SSE để nhận (xem Q&A "Chat có bắt buộc WebSocket?").
- **Secrets in the URL.** "URL bị ghi vào log và lịch sử trình duyệt, đừng để token hay mật khẩu trong đó." (OWASP, cùng trang trên.)

**Chỉ dùng khi bị hỏi sâu hơn (không đưa lên slide):** chặn client chậm làm đầy bộ nhớ server (giới hạn hàng đợi gửi); giới hạn kích thước và tần suất message; kiểm tra `Origin`; và reconnect có thêm độ ngẫu nhiên (jitter) để các client không cùng thử lại một lúc. Các ý này có nguồn ở mục 7.

**Trade-off (câu chốt "Less polling. More connection management."):** giảm polling có thể giảm request không cần thiết, nhưng phải quản lý kết nối lâu dài, giới hạn tài nguyên, timeout và phục hồi. Nếu có nhiều server, cũng phải giải quyết cách chuyển event tới instance đang giữ kết nối của người nhận; đây là ý "scaling" ở dòng WebSocket, nói bằng lời chứ không đưa lên slide.

### Slide 12 — Demo - Q&A

Mục tiêu: cho người nghe thấy hành vi đường truyền, không chỉ thấy UI thay đổi.

| Phương thức | Điều quan sát trong DevTools |
| --- | --- |
| Polling | Request lặp lại theo chu kỳ, có response không thay đổi |
| Long Polling | Request pending; có dữ liệu/timeout thì kết thúc rồi có request mới |
| SSE | Response stream tiếp tục mở, nhiều event đến trên cùng luồng |
| WebSocket | Kết nối mở và các message gửi/nhận trong tab tương ứng |

Theo bản tài liệu project trước đó, SSE demo đang minh họa tiến độ tác vụ, còn WebSocket demo minh họa chat/phòng. Chưa kiểm chứng lại code trong lần soạn tài liệu này: chạy thử trước buổi nói và chỉ giới thiệu tính năng thực sự có. SSE progress và forum notification dùng cùng kiểu server push, nhưng không được gọi progress demo là tính năng notification đã triển khai.

Nếu demo chưa có reconnect/lấy bù, nói rõ đó là bài học thiết kế, không khẳng định demo đã bảo đảm không mất tin. Khi thử offline/online, chỉ cho thấy hành vi thực tế. Không đổi code trong phạm vi soạn tài liệu này.

## 4. Q&A cần chuẩn bị

**SSE có gửi dữ liệu lên server được không?** Không qua chính luồng event một chiều; dùng HTTP POST/API riêng. Toàn ứng dụng vẫn có giao tiếp hai chiều.

**Chat có bắt buộc WebSocket?** Không. POST + SSE hoặc long polling có thể đáp ứng; lựa chọn phụ thuộc tần suất, trải nghiệm và hạ tầng.

**Có thể dùng WebSocket cho cả notification không?** Có. Nếu đã có kết nối chung, tái sử dụng có thể đơn giản hơn duy trì thêm SSE.

**Reconnect rồi sao vẫn thiếu tin?** Kết nối mới chỉ giúp trao đổi tiếp. Tin phát sinh lúc offline cần lấy từ lịch sử hoặc đồng bộ lại trạng thái.

**Tại sao phải chống trùng?** Retry và replay có thể đưa cùng dữ liệu tới nhiều lần. Dùng ID ổn định; không so nội dung để quyết định hai tin là một.

**WebSocket dùng TCP, sao còn cần xác nhận?** TCP giải quyết truyền byte trên kết nối. Nó không xác nhận server đã commit dữ liệu hoặc người nhận đã đọc.

**Thông báo khi đóng trang thì sao?** Đó là nhu cầu khác với SSE trong trang; thường cần xem xét Web Push/service worker và quyền thông báo. Không mở rộng chủ đề này trong buổi hiện tại.

**Có phải dùng sticky session khi có nhiều server?** Không phải quy tắc chung cho mọi kiến trúc WebSocket. Kết nối đã mở gắn với một instance; hệ thống cần routing event và trạng thái chia sẻ/khôi phục phù hợp. Sticky session không tự giải quyết việc phát tin giữa các instance.

## 5. Những câu nên tránh nói quá

| Tránh nói | Nói chính xác hơn |
| --- | --- |
| WebSocket luôn nhanh nhất | Phù hợp với tương tác hai chiều; độ trễ thực tế cần đo |
| Mỗi poll mở TCP mới | Mỗi poll tạo request; kết nối HTTP bên dưới có thể được tái sử dụng |
| SSE tự lấy lại mọi event bị lỡ | EventSource có reconnect và dấu sự kiện; server phải hỗ trợ khôi phục |
| Reconnect là không mất tin | Reconnect và phục hồi dữ liệu là hai bước khác nhau |
| Gọi send là gửi thành công | Cần xác nhận đúng mức: được lưu, được giao, được đọc |
| Lưu rồi phát là bảo đảm tuyệt đối | Vẫn cần xử lý lỗi giữa lưu và phát nếu yêu cầu độ tin cậy cao |

## 6. Checklist trước buổi nói

- Mở đúng deck có tên Tavian Nguyen; không dùng bìa draft cũ.
- Thử các demo và đường dẫn thực tế; mở sẵn DevTools, hai cửa sổ nếu cần.
- Phân biệt rõ câu chuyện minh họa, giải pháp đề xuất và tính năng demo đang có.
- Dành trọng tâm cho SSE/WebSocket; Polling/Long Polling đủ để thấy sự khác nhau.
- Hiểu ví dụ #10 → mất #11–#12 → nhận #13 để giải thích slide 10.
- Chốt bằng việc chọn vừa đủ và thiết kế cho mất kết nối; không mở thêm SignalR/Webhook.

## 7. Nguồn đối chiếu

- [MDN — Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events): cơ chế stream, EventSource, định dạng và vận hành SSE.
- [WHATWG — Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html): reconnect và Last-Event-ID.
- [RFC 6455 — The WebSocket Protocol](https://datatracker.ietf.org/doc/html/rfc6455): giao thức WebSocket và phục hồi sau đóng bất thường.
- [MDN — WebSocket.send()](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/send): ý nghĩa của thao tác gửi.

Nguồn cho slide 11 (best practice và avoid):

- [OWASP — WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html): kiểm tra quyền từng hành động, token và URL, giới hạn kích thước/tần suất, allowlist `Origin`.
- [MDN — Writing WebSocket servers](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers): ping/pong, `Origin`.
- [RFC 6202 — Known Issues and Best Practices for Bidirectional HTTP](https://datatracker.ietf.org/doc/html/rfc6202) và [AWS — Exponential Backoff And Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/): cho phần Q&A sâu hơn (timeout long polling, jitter).

Các ví dụ ID, quy trình lưu/lấy bù và lựa chọn kiến trúc là diễn giải thiết kế cho tình huống của buổi nói, không phải tuyên bố những tính năng này được giao thức tự bảo đảm.