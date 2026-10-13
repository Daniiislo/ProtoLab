# Build for Disconnects — Reconnect Is Not Recovery

Tài liệu giải thích bằng tiếng Việt cho Tavian Nguyen · 07/10/2026.

## 1. Hiểu đơn giản nhất

**Build for Disconnects** nghĩa là: thiết kế tính năng với giả định kết nối có thể bị ngắt, không chỉ xử lý trường hợp mọi thứ chạy tốt.

Hãy tưởng tượng bạn đang gọi điện, mất sóng rồi gọi lại. Bạn nghe được những câu tiếp theo, nhưng không tự nghe lại những câu người kia nói lúc mất sóng. Muốn biết phần đã lỡ, bạn phải hỏi lại.

Trong ứng dụng cũng vậy:

- **Disconnect:** đường truyền bị ngắt.
- **Reconnect:** mở lại đường truyền.
- **Recovery:** đưa dữ liệu ứng dụng trở về trạng thái đúng, bao gồm phần đã bỏ lỡ.

WebSocket/SSE là đường truyền; chúng không thay thế database hay lịch sử tin nhắn.

## 2. Một tình huống chat cụ thể

Giả sử server lưu các tin trong một cuộc hội thoại theo số thứ tự. Các số dưới đây chỉ để minh họa.

| Thời điểm | Server | Trình duyệt của Bình |
|---|---|---|
| Trước khi mất mạng | Đã lưu tin #10 | Đã nhận và xử lý #10 |
| Mất mạng | An gửi #11, server lưu | Không nhận được #11 |
| Vẫn mất mạng | An gửi #12, server lưu | Không nhận được #12 |
| Kết nối lại | Có đường truyền mới | Vẫn chỉ có đến #10 |
| Có tin mới | Server gửi #13 | Có thể thấy #13 nhưng thiếu #11–#12 |

Đèn “Connected” chỉ nói rằng đường truyền đang hoạt động. Nó không chứng minh danh sách tin trên màn hình đã đầy đủ.

**Cách khôi phục:** Bình nói với server: “Trong cuộc hội thoại này, tôi đã xử lý đến #10. Hãy gửi phần sau đó.” Server kiểm tra quyền, đọc dữ liệu đã lưu và trả về #11–#13. Trình duyệt ghép vào danh sách theo ID và thứ tự.

Nếu server chưa từng lưu #11–#12, hoặc dữ liệu đã hết thời hạn lưu, reconnect không thể tạo lại chúng. Khi đó cần đồng bộ lại từ nguồn dữ liệu còn tồn tại, hoặc thông báo giới hạn lịch sử.

## 3. Ba bước trên slide có nghĩa gì?

### Disconnect → Show state

Đừng để giao diện trông như vẫn hoạt động bình thường khi chưa gửi/nhận được dữ liệu.

- Hiển thị “Reconnecting…” hoặc “Offline”.
- Tin mới có thể ở trạng thái “Pending”, chưa phải “Delivered”.
- Bản đơn giản có thể khóa gửi khi offline và cho người dùng thử lại. Không bắt buộc phải xây hàng đợi offline ngay.
- Mất đường truyền không phải lúc nào cũng được phát hiện ngay; có thể phải chờ lỗi, timeout hoặc kiểm tra heartbeat.

Heartbeat là tín hiệu nhỏ để kiểm tra kết nối còn sống. Nó giúp phát hiện vấn đề, **không chứng minh tin nhắn nghiệp vụ đã được lưu hay đọc**.

### Reconnect → Backoff + jitter

**Backoff:** sau mỗi lần thất bại, chờ lâu hơn trước khi thử lại, có mức chờ tối đa.

**Jitter:** thêm độ ngẫu nhiên vào thời gian chờ để nhiều client không cùng đổ về server một lúc.

Ví dụ minh họa, không phải cấu hình bắt buộc: khoảng chờ tăng dần 1, 2, 4, 8 giây; mỗi client chọn một thời điểm ngẫu nhiên trong khoảng chờ tương ứng. Khi server vừa khởi động lại, việc tất cả client retry liên tục có thể khiến nó quá tải lần nữa. RFC WebSocket khuyến nghị trì hoãn ngẫu nhiên ban đầu và backoff khi phục hồi sau đóng bất thường. [RFC 6455 §7.2.3](https://datatracker.ietf.org/doc/html/rfc6455#section-7.2.3)

Không retry vô hạn với mọi loại lỗi: hết phiên đăng nhập cần xác thực lại; không có quyền cần dừng hoặc hướng dẫn người dùng. Khi người dùng rời màn hình/đăng xuất, phải hủy timer và đóng kết nối không còn cần thiết.

### Recover → Resume + deduplicate

**Resume:** tiếp tục từ vị trí đã xử lý, thay vì chỉ chờ sự kiện mới.

**Deduplicate:** khi cùng một tin xuất hiện lần nữa, nhận ra đó là tin cũ và không thêm một bản sao.

Một quy trình ứng dụng có thể là:

1. Server lưu tin quan trọng và gán ID ổn định.
2. Client ghi nhớ vị trí đã xử lý trong luồng dữ liệu.
3. Sau reconnect, xác thực lại và đăng ký lại đúng cuộc hội thoại.
4. Lấy bù phần thiếu, đồng thời phối hợp với luồng live để không tạo khoảng trống.
5. Ghép các tin bằng ID, sắp xếp theo thứ tự server quy định.
6. Chỉ báo “đã đồng bộ” khi hoàn thành phần khôi phục cần thiết.

Đây là thiết kế ở tầng ứng dụng, không phải một bảo đảm sẵn có của giao thức.

## 4. Cursor là gì? Có khác message ID không?

Cursor giống một dấu trang: “Tôi đã đọc đến đây.” Server có thể cấp cursor để client dùng ở lần lấy dữ liệu tiếp theo.

| Khái niệm | Công việc |
|---|---|
| `messageId` | Nhận diện một tin cụ thể; dùng để ghép/cập nhật và loại trùng |
| `cursor` hoặc `sequence` | Chỉ vị trí trong một luồng có thứ tự; dùng để lấy phần tiếp theo |
| `clientMessageId` | Nhận diện một lần gửi của người dùng qua nhiều lần retry |

Một hệ thống có thể dùng cùng một giá trị cho vài vai trò, nhưng phải thiết kế rõ. UUID ngẫu nhiên không tự mang thứ tự; không được mặc định lấy “UUID lớn hơn” là lấy được tin mới hơn. Mỗi cuộc hội thoại có thể cần cursor riêng, trừ khi server cung cấp một luồng sự kiện tổng hợp cho từng user.

Chỉ tăng cursor khi đã xử lý an toàn phần dữ liệu trước nó. Nếu thấy #13 trong lúc còn thiếu #11–#12 mà ghi luôn “đã xử lý đến #13”, lần khôi phục sau có thể bỏ qua phần thiếu.

## 5. Tại sao tin có thể bị trùng?

### Trùng khi nhận

Client nhận #12, nhưng chưa kịp lưu dấu đã xử lý thì ứng dụng bị gián đoạn. Khi khôi phục từ dấu cũ #11, server gửi #12 lần nữa.

Cách xử lý: lưu/hiển thị theo `messageId`. Đã có ID đó thì cập nhật bản hiện có hoặc bỏ qua, không append thêm một dòng. Không chỉ so sánh nội dung: hai tin đều có chữ “OK” vẫn có thể là hai tin hợp lệ khác nhau.

### Trùng khi gửi

1. Client gửi tin với `clientMessageId = abc`.
2. Server đã lưu tin, nhưng phản hồi xác nhận chưa đến client thì mất mạng.
3. Client không biết server đã lưu hay chưa nên gửi lại.
4. Nếu server cứ tạo bản ghi mới, người nhận thấy hai tin.

Cách xử lý: retry **cùng một lần gửi** phải giữ nguyên `clientMessageId`. Server kiểm tra khóa duy nhất theo phạm vi phù hợp, ví dụ người gửi + cuộc hội thoại + clientMessageId. Nếu đã xử lý, trả lại kết quả cũ; nếu chưa, mới tạo tin. Dùng ràng buộc duy nhất/giao dịch để tránh hai request đồng thời cùng tạo bản ghi.

Đó là **idempotency**: lặp lại cùng một thao tác vẫn tạo một hiệu ứng nghiệp vụ. Loại trùng ở UI không thay thế được idempotency ở server.

## 6. SSE làm sẵn gì, mình phải làm gì?

Với `EventSource`, trình duyệt có cơ chế tự kết nối lại cho các trường hợp gián đoạn có thể phục hồi. Server có thể gửi trường `id` cùng event. Trong vòng đời đối tượng đó, khi reconnect, trình duyệt có thể gửi `Last-Event-ID` để thông báo dấu sự kiện cuối. [WHATWG — Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)

Ví dụ event minh họa:

```text
id: 12
event: notification
data: {"notificationId":"n12","text":"New reply"}

```

Nhưng browser không tự tạo kho lịch sử cho server. Server phải hiểu dấu này, còn dữ liệu để replay và kiểm tra người đang yêu cầu có quyền nhận dữ liệu đó. Dấu của EventSource cũng không phải xác nhận giao dịch nghiệp vụ của client đã thành công. Không mặc định nó được giữ qua reload hay một đối tượng EventSource mới.

Với chuông thông báo đơn giản, phương án dễ hiểu hơn là: khi kết nối lại, gọi API lấy danh sách chưa đọc và unread count hiện tại. Không nhất thiết replay mọi lần tăng/giảm bộ đếm. Việc cập nhật theo trạng thái hiện tại tránh cộng trùng bộ đếm khi event lặp.

`retry` của SSE điều khiển thời gian reconnect; đừng mặc định browser cung cấp đúng thuật toán backoff + jitter riêng của ứng dụng. Tránh chạy thêm một vòng retry tạo EventSource mới song song với cơ chế reconnect đang có. [MDN — Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)

## 7. WebSocket làm sẵn gì, mình phải làm gì?

WebSocket cho hai phía gửi dữ liệu trên kết nối đang mở. Khi kết nối bị đóng, raw browser WebSocket không tự tạo kết nối mới; ứng dụng hoặc thư viện phải đảm nhiệm reconnect, đăng ký lại và khôi phục dữ liệu.

`socket.send()` đưa dữ liệu vào hàng đợi gửi, không phải bằng chứng server đã lưu hay người nhận đã đọc. [MDN — WebSocket.send()](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/send)

Nên tách các mức xác nhận theo hợp đồng ứng dụng:

- **Pending:** client đang chờ kết quả gửi.
- **Stored/Accepted:** server xác nhận đã lưu theo định nghĩa của hệ thống.
- **Delivered:** phiên nhận đã xác nhận nhận được theo thiết kế.
- **Read:** phía nhận báo đã đọc theo quy tắc sản phẩm; không chứng minh con người đã hiểu nội dung.

WebSocket/TCP bảo toàn thứ tự dữ liệu trên một kết nối đang hoạt động. Điều đó không tạo ra cơ chế lưu lịch sử, xác nhận nghiệp vụ hay tiếp nối thứ tự giữa các kết nối mới. Đây là hai tầng khác nhau. [RFC 6455](https://datatracker.ietf.org/doc/html/rfc6455)

## 8. Chỗ khó: đang lấy bù thì tin mới lại đến

Nếu ứng dụng “gọi API lấy lịch sử xong rồi mới bật nhận live”, tin phát sinh giữa hai thao tác có thể rơi vào khoảng trống.

Một hướng thiết kế là mở luồng live và tạm giữ event, lấy snapshot/lịch sử kèm cursor do server cung cấp, sau đó ghép phần live theo ID/thứ tự và loại trùng. Một hướng khác là server cung cấp một luồng resume thống nhất: replay rồi chuyển sang live không bỏ sót. Cả hai cần hợp đồng phía server rõ ràng, không chỉ thêm vài dòng code client.

Với bản đơn giản, có thể đồng bộ lại trạng thái qua API sau reconnect và định kỳ đối soát nếu cần. Đừng hứa “không bao giờ mất tin” chỉ vì đã thêm một lệnh fetch.

Tương tự, “lưu database rồi phát event” vẫn có khoảng lỗi: tiến trình có thể chết sau khi lưu nhưng trước khi phát. Lịch sử cho phép lấy bù; nếu cần bảo đảm công việc phát event được thử lại, cân nhắc transactional outbox hoặc cơ chế tương đương. Đây là phần mở rộng, không cần giải thích sâu trên slide.

## 9. Áp dụng vào hai tình huống trong bài

| Tình huống | Dữ liệu nên lưu | Sau reconnect | Không cần replay mọi thứ |
|---|---|---|---|
| Forum notifications | Notification, người nhận, trạng thái đọc | Đồng bộ danh sách và unread count; hoặc replay theo cursor | Không cần phát lại mọi hiệu ứng chuông/animation |
| Member chat | Nội dung, người gửi, cuộc hội thoại, ID/thứ tự | Lấy các tin thiếu, ghép bằng ID; retry gửi có idempotency | Typing indicator cũ nên hết hạn, không phát lại |

Server phải kiểm tra quyền cả khi live lẫn khi lấy bù. Biết một cursor hay room ID không có nghĩa là được đọc dữ liệu ở đó.

## 10. Cần nhớ bao nhiêu để trình bày slide này?

Chỉ cần hiểu và giải thích được ba câu:

1. Mất mạng là tình huống bình thường, nên UI cần báo trạng thái.
2. Kết nối lại giúp nhận tiếp; lấy bù mới giúp xử lý phần đã bỏ lỡ.
3. Muốn lấy bù cần dữ liệu đã lưu; muốn retry an toàn cần ID và xử lý trùng.

Phần cursor, idempotency và khoảng trống replay/live là tài liệu đọc thêm để trả lời câu hỏi, không cần đưa tất cả lên slide.
