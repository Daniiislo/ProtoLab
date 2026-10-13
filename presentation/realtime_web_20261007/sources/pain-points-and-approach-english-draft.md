# Pain Points & Approach — Nội dung slide và lời dẫn

Ghi chú biên soạn: Đây là câu chuyện mẫu được xây dựng theo yêu cầu, kể ở ngôi thứ nhất như đang nhìn lại quá trình triển khai; không phải bản xác minh lịch sử dự án. Không sử dụng số liệu kết quả giả định. Các khối dưới đây chưa tương ứng với số slide cố định.

## Quy ước ngôn ngữ

Toàn bộ nội dung hiển thị trên slide bằng tiếng Anh: tiêu đề, nội dung, nhãn sơ đồ, bảng, chú thích và takeaway. Bạn nói bằng tiếng Việt, nên lời dẫn, speaker notes và tài liệu chuẩn bị bằng tiếng Việt. Các phần “Short Copy” và “Flow Labels” bên dưới là nội dung tiếng Anh để đưa lên slide.

## Cover

**Real-time Communication on the Web**

*A Practical Guide to Polling, Long Polling, SSE, and WebSocket*

## Agenda

1. Pain Points & Approach
2. Real-time Communication Methods
3. Lessons Learned & Trade-offs
4. Q&A

## Opening Story — Short Copy

### Two Features, One Expectation

- Forum notifications: let members know when someone replies or mentions them.
- Member chat: let people exchange messages without refreshing the page.
- The expectation: see new activity as it happens while online.

### My First Approach: Keep Checking

- I used polling to check for new notifications and messages.
- Updates waited for the next request.
- Checking more often meant making more requests, even when nothing changed.

### My Next Step: Keep the Connection Open

- **SSE for notifications:** the server pushes updates to the open forum page.
- **WebSocket for chat:** members send and receive messages over persistent connections.
- **Regular HTTP APIs:** posting replies, marking notifications as read, and loading history.

Transition: **How do these communication methods actually work?**

## Lời dẫn — nói bằng tiếng Việt

Khi xây dựng forum, mình có hai tính năng cần cập nhật ngay cho người dùng: thông báo và chat giữa các thành viên.

Ví dụ, khi có người trả lời bài viết hoặc nhắc tên mình, mình muốn chuông thông báo cập nhật mà không cần refresh trang. Còn khi hai người đang chat, gửi tin xong thì bên kia cần thấy sớm để cuộc trò chuyện không bị ngắt quãng.

Ban đầu mình dùng polling. Cứ sau một khoảng thời gian, trình duyệt lại hỏi server xem có thông báo hay tin nhắn mới không. Cách này dễ làm và vẫn chạy được. Nhưng nếu tin mới xuất hiện ngay sau lần kiểm tra, người dùng phải chờ tới lần tiếp theo mới thấy.

Mình có thể giảm thời gian chờ bằng cách hỏi thường xuyên hơn. Tuy nhiên, như vậy sẽ có nhiều request hơn, kể cả lúc không có gì thay đổi.

Vì thế, mình chuyển sang cách giữ đường truyền mở. Với thông báo, mình dùng SSE. Khi người dùng mở forum, trình duyệt duy trì một luồng nhận; có thông báo mới thì server đẩy xuống để giao diện cập nhật. Những việc như đăng bài hay đánh dấu đã đọc vẫn dùng HTTP API bình thường.

Với chat, mình dùng WebSocket. Khi người dùng vào màn hình chat, trình duyệt mở kết nối với server. Cả gửi lẫn nhận tin nhắn đều đi qua kết nối đó; server chuyển tin tới đúng người nhận.

Điểm mình dựa vào để lựa chọn là: thông báo chủ yếu cần server đẩy xuống, còn chat cần gửi và nhận thường xuyên theo cả hai chiều.

Để hiểu các lựa chọn này, mình sẽ đi qua bốn phương thức: Polling, Long Polling, SSE và WebSocket. Mỗi phương thức hoạt động thế nào, phù hợp lúc nào, và phải đánh đổi điều gì?

## Simple Flow Labels

**Before — Polling**

Browser checks → Server responds → Wait → Check again

**Notifications — SSE**

New reply → Server creates a notification → SSE update → Notification bell updates

**Chat — WebSocket**

Member A → Server → Member B

Member B → Server → Member A

Ghi chú khi nói: các mũi tên biểu diễn message của ứng dụng. Mỗi trình duyệt kết nối tới server; hai thành viên không kết nối trực tiếp với nhau theo kiểu peer-to-peer.

## Lessons Learned — Short Copy

- **Choose what fits.** Polling can be enough; persistent connections add operational work.
- **Expect disconnects.** Show connection status and recover missed updates.
- **Store important data.** A live connection is not message history.
- **Check permissions.** Deliver updates only to authorized users and conversations.
- **Reuse connections when practical.** An existing app-wide WebSocket can carry notifications too.

## Ghi chú trade-offs để trình bày ngắn

Trong câu chuyện mẫu, SSE hoạt động khi mở forum, còn WebSocket mở khi vào màn hình chat. Cách này minh họa rõ hai nhu cầu, nhưng duy trì hai cơ chế sẽ tốn công hơn. Nếu đã có WebSocket dùng chung toàn ứng dụng, có thể tận dụng luôn để gửi notification.

SSE phù hợp với thông báo bên trong trang đang mở. Nếu trang không được tải, cần cơ chế khác như Web Push. Chỉ nhắc giới hạn này, không mở thêm một phần kiến thức trong buổi nói.

Chat cũng có thể dùng HTTP POST để gửi và SSE để nhận. Trong ví dụ này chọn WebSocket vì có nhu cầu gửi/nhận thường xuyên theo cả hai chiều; không nói rằng chat bắt buộc dùng WebSocket.

## Phạm vi phần nội dung chính

Câu chuyện chỉ là phần dẫn. Phần kiến thức trình bày cả bốn phương thức, dành nhiều thời gian hơn cho SSE và WebSocket. Long Polling được giới thiệu như một lựa chọn khác; câu chuyện không cần khẳng định mình đã triển khai nó.

SignalR và Webhook nằm ngoài buổi này. Lưu trữ, tải bù và độ tin cậy là các bài học/định hướng thiết kế. Khi giới thiệu demo hiện tại, chỉ mô tả những khả năng demo thực sự có.
