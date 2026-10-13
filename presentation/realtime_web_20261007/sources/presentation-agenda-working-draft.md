# Real-time Communication on the Web — Agenda & Storyline Draft

Trạng thái: bản đề xuất để cùng thảo luận; chưa chốt agenda, số slide hoặc thiết kế.

## 1. Presentation Goals & Scope

Giới thiệu Polling, Long Polling, SSE và WebSocket theo hướng đơn giản, thực tế. Hai tình huống thông báo forum và chat thành viên là phần dẫn nhập tạo động lực tìm hiểu các phương thức, không phải hai chương riêng của bài.

Ưu tiên tình huống → cách xử lý → minh họa → bài học. Chỉ giới thiệu lý thuyết đủ để giải thích quyết định. Không dành phần chính cho frame, opcode, masking hay chi tiết RFC.

Đã thống nhất theo yêu cầu: một slide bìa, một slide agenda; phần Pain Points dẫn vào phần kiến thức; kết thúc bằng bài học, best practices, điều không nên làm và trade-offs. Toàn bộ nội dung slide bằng tiếng Anh, bao gồm tiêu đề, nội dung, bảng, nhãn sơ đồ và chú thích. Bạn thuyết trình bằng tiếng Việt; lời dẫn, speaker notes và tài liệu chuẩn bị viết bằng tiếng Việt. Webhook nằm ngoài phạm vi. SignalR dành cho một buổi deep dive riêng, không nằm trong agenda buổi này.

Thời lượng và đối tượng nghe chưa xác định. Chưa cố định tổng số slide; các phần bên dưới là khung nội dung có thể co giãn.

## 2. Pain Points — Opening Context

### A. Forum Notifications

Tình huống minh họa: Bình trả lời bài viết hoặc nhắc tên An. An đang mở forum và cần thấy chuông thông báo/unread count cập nhật mà không phải refresh.

Yêu cầu thực tế: gửi đúng người, hiển thị sớm khi online, lưu lại để người dùng quay lại vẫn thấy thông báo chưa đọc.

Câu hỏi dẫn: “Server đã biết có phản hồi mới. Làm sao giao diện của người nhận biết ngay?”

### B. Member Chat

An gửi tin cho Bình. Bình thấy tin xuất hiện khi đang online và có thể trả lời ngay. Có thể mở rộng sang typing/read receipt nếu cần minh họa tương tác hai chiều thường xuyên.

Câu hỏi dẫn: “Khi cả hai bên đều liên tục gửi và nhận, mình tổ chức đường truyền thế nào?”

“Ngay lập tức” là mục tiêu trải nghiệm độ trễ thấp khi có kết nối; không hứa không có độ trễ hoặc giao được khi người nhận mất mạng.

### First-Person Story Draft

Theo yêu cầu, dùng một tình huống mẫu được xây dựng để kể ở ngôi thứ nhất, như đang nhìn lại quá trình triển khai. Đây là quy ước biên soạn nội bộ, không phải hồ sơ xác minh lịch sử dự án. Không cần chờ bổ sung trải nghiệm mới tiếp tục viết. Không thêm số liệu benchmark, sự cố production hoặc kết quả đo giả định.

Mạch đã chọn: tôi xây forum → dùng polling để lấy notification và tin nhắn mới → nhận thấy UI phải chờ lần kiểm tra tiếp theo, còn kiểm tra thường xuyên hơn tạo thêm request → dùng SSE cho notification khi mở forum, WebSocket cho chat khi mở màn hình chat → dẫn vào cách hoạt động của bốn phương thức.

Nội dung slide tiếng Anh và lời dẫn ngôi thứ nhất bằng tiếng Việt được lưu trong [Pain Points & Approach — nội dung và lời dẫn](pain-points-and-approach-english-draft.md).

## 3. Technical Choice Notes

**Có, với thông báo trong trang khi người dùng đang online.** Dữ liệu chủ yếu đi từ server xuống giao diện nên SSE là lựa chọn hợp lý. Việc đăng bài, trả lời và đánh dấu đã đọc vẫn có thể dùng HTTP API thông thường. Đây là đề xuất kiến trúc cho tình huống trên, không phải quy tắc mọi notification đều phải dùng SSE. [MDN — SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)

Nếu cần báo khi trang không được tải/mở, phải xét Web Push và service worker, tùy quyền và hỗ trợ của nền tảng. SSE không giải quyết nhu cầu đó. Chỉ cần nêu ranh giới này trong bài, chưa cần mở rộng thành một chủ đề riêng. [MDN — Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)

**Một trade-off đáng đưa vào bài:** nếu forum đã duy trì WebSocket dùng chung toàn ứng dụng cho chat, có thể gửi cả notification trên connection đó. Mở thêm SSE làm tăng số đường truyền và công quản lý lifecycle. Nếu chat chỉ mở connection trong màn hình chat, còn notification cần hoạt động toàn forum, SSE vẫn có lý do riêng. Chọn sau khi biết kiến trúc thật.

WebSocket phù hợp cho chat tương tác thường xuyên hai chiều. Chat đơn giản cũng có thể dùng POST để gửi và SSE để nhận; không nên nói chat bắt buộc dùng WebSocket.

## 4. Proposed Agenda

1. **Pain Points & Approach**
2. **Real-time Communication Methods**
3. **Lessons Learned & Trade-offs**
4. **Q&A**

Đây là các phần lớn trên slide agenda. Polling, Long Polling, SSE và WebSocket là các mục con của phần 2. Demo lồng vào phương thức tương ứng. Bìa và agenda là hai slide mở đầu, không phải hai chương nội dung.

## 5. Section Outline

### Opening — Cover & Agenda

Tiêu đề đề xuất: **Real-time Communication on the Web**.

Phụ đề đề xuất: **A Practical Guide to Polling, SSE, and WebSocket**.

Lời mở: “Tôi có hai yêu cầu trong cùng một forum: có phản hồi mới thì người dùng biết ngay, và gửi tin nhắn thì bên kia nhận được ngay. Từ hai yêu cầu đó, mình cùng xem các cách browser và server trao đổi dữ liệu, cách chúng hoạt động và lúc nào nên chọn từng cách.”

### Part 1 — Pain Points & Approach

- Kể hai tình huống ở mục 2 bằng script ngôi thứ nhất đã soạn.
- Minh họa trạng thái trước: người nhận chưa thấy thay đổi dù server đã có dữ liệu.
- Nêu cách ban đầu là polling, vấn đề phải chờ lần kiểm tra tiếp theo và đánh đổi khi giảm interval.
- Phác thảo hướng giải quyết bằng ngôn ngữ đơn giản: để server báo xuống khi có thông báo; giữ đường truyền gửi/nhận cho chat. Nêu tên SSE và WebSocket, chưa giải thích sâu ở đây.
- Câu chuyển: “Vậy browser và server có những cách nào để cập nhật dữ liệu mà người dùng không cần refresh?”
- Phần này ngắn, chỉ tạo bối cảnh và dẫn vào kiến thức chung.

### Part 2 — Real-time Communication Methods

Đây là phần nội dung chính. Mỗi phương thức cùng một khung: cách hoạt động bằng một câu → sơ đồ/request thực tế → lúc phù hợp → một hạn chế cần nhớ. Polling và Long Polling giới thiệu nhanh; SSE và WebSocket dành nhiều thời gian hơn.

#### 2.1 Polling — Ask at Regular Intervals

“Cứ sau một khoảng thời gian, client hỏi server có gì mới không.” Minh họa vài request liên tiếp, bao gồm response không thay đổi. Đổi interval ngắn hơn để thấy đánh đổi giữa độ trễ và số request. Nhiều request không đồng nghĩa mỗi lần đều tạo TCP connection mới; HTTP có thể tái sử dụng kết nối.

#### 2.2 Long Polling — Wait for an Update

“Server giữ request cho tới khi có dữ liệu hoặc timeout; client nhận xong thì hỏi tiếp.” Minh họa request pending và request kế tiếp. Nêu ngắn việc giảm câu trả lời rỗng nhưng vẫn có chu trình request/response và cần cursor nếu muốn lấy bù sự kiện.

#### 2.3 Server-Sent Events — Stream Updates to the Browser

Giải thích một câu: “Browser mở một luồng nhận; khi có thông báo, server gửi xuống luồng đó.”

Luồng giải pháp đề xuất: Bình trả lời → server xác định người nhận và lưu notification → đẩy event tới phiên online của An → giao diện cập nhật chuông/danh sách. Trạng thái đã đọc được cập nhật qua HTTP API.

Minh họa mong muốn: hai cửa sổ, một bên tạo tương tác, bên kia cập nhật thông báo không refresh. Chỉ trỏ vào một response đang mở và các event mới; không cần giảng toàn bộ event format.

Điểm thực tế phải nói: notification vẫn cần lưu; sau reconnect tải bù hoặc đồng bộ lại. Reconnect chỉ khôi phục đường truyền. Với khoảng trống giữa lưu dữ liệu và phát event, bản production cần cơ chế phục hồi phù hợp; chi tiết outbox để dành Q&A.

#### 2.4 WebSocket — Keep a Two-Way Conversation Open

Giải thích một câu: “Hai phía giữ một kết nối để gửi và nhận message qua lại.”

Luồng giải pháp đề xuất: An gửi → server xác thực quyền vào cuộc hội thoại → lưu message → xác nhận đã nhận/lưu và chuyển tới các phiên online của Bình → Bình trả lời trên kết nối của mình.

Minh họa mong muốn: hai thành viên chat qua lại, quan sát message mà không phát sinh một HTTP request mới cho từng tin. Khi mất mạng, giao diện báo trạng thái kết nối.

Điểm thực tế phải nói: `send()` thành công không đồng nghĩa người nhận đã đọc; phân biệt đang gửi, server đã lưu, đã giao và đã đọc. Lịch sử cần lưu bền vững, reconnect cần tải bù; retry cần ID để chống trùng.

#### 2.5 Choosing the Right Method

Khép phần kiến thức bằng một so sánh ngắn theo nhu cầu: cập nhật định kỳ, đẩy một chiều, tương tác hai chiều và độ phức tạp có thể chấp nhận. Quay lại hai pain point mở đầu để giải thích lựa chọn SSE/WebSocket cùng điều kiện áp dụng. Không diễn đạt như công nghệ sau luôn tốt hơn hoặc thay thế công nghệ trước.

### Part 3 — Lessons Learned & Trade-offs

| Bài học | Điều nên làm | Điều nên tránh |
| --- | --- | --- |
| Chọn theo nhu cầu | SSE cho luồng đẩy một chiều; WebSocket khi cần tương tác hai chiều thường xuyên | Chọn WebSocket chỉ vì cho rằng luôn nhanh hơn |
| Giữ kiến trúc vừa đủ | Cân nhắc dùng chung WebSocket có sẵn cho chat và notification | Mở thêm connection riêng cho mọi widget/tính năng |
| Lưu dữ liệu trước, cập nhật UI sau | Lưu message/notification; tải bù khi quay lại | Dùng socket như nơi lưu lịch sử |
| Mất mạng là bình thường | Hiển thị trạng thái; retry có backoff; đồng bộ lại bằng ID/cursor | Đồng nhất reconnect với không mất message |
| Gửi đúng người | Kiểm tra quyền ở server và lọc đúng user/conversation | Tin vào user ID/room mà client tự khai |

Trade-offs cần chốt bằng lời: ít request hơn đổi lại connection lâu dài; cập nhật nhanh vẫn cần lưu trữ và khôi phục; dùng riêng SSE và WebSocket cho hai tính năng có thể tăng công vận hành so với dùng chung WebSocket đã có. Khi tăng nhiều server, cần cơ chế chuyển event giữa các instance; để chi tiết scale-out trong tài liệu hỏi đáp.

Kết bài đề xuất: “Đường truyền giúp giao diện cập nhật nhanh. Lưu trữ, phân quyền và khôi phục sau mất mạng mới giúp tính năng dùng được lâu dài.”

### Part 4 — Q&A

Dùng tài liệu deep dive để chuẩn bị câu trả lời. Chi tiết framing, masking, delivery semantics và scale-out không cần xuất hiện trong phần trình bày chính. SignalR dành cho buổi riêng.

## 6. Demo Alignment

Theo tài liệu/code đã xem: SSE hiện minh họa tiến độ tác vụ; WebSocket minh họa chat nhiều client và phòng riêng. SSE hiện chưa phải demo thông báo forum, và demo chưa chứng minh toàn bộ các đề xuất production ở trên.

Lựa chọn để bàn tiếp: giữ demo tiến độ và giải thích cùng cơ chế stream, hoặc sau khi chốt storyline mới đổi demo SSE thành chuông thông báo. Tài liệu này chưa yêu cầu thay đổi ứng dụng.

## 7. Open Discussion Points

1. Buổi nói dài bao lâu, người nghe quen backend/HTTP tới mức nào?
2. Thông báo trong phạm vi trang đang mở hay cả khi người dùng rời trang?
3. Điều chỉnh độ dài câu chuyện mẫu sau khi xác định thời lượng buổi nói.
4. Giữ demo SSE tiến độ hay sau này chuyển thành notification để khớp phần dẫn?

Giữ câu chuyện mẫu ngắn để dẫn vào kiến thức, rồi phân bổ số slide theo thời lượng. Tài liệu deep dive và 42 câu challenge dùng để chuẩn bị Q&A, không cần đưa hết vào phần trình bày chính.
