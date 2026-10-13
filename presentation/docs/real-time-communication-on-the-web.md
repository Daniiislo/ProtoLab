# Real-time Communication on the Web: From Polling to WebSocket and SignalR

## Phạm vi của tài liệu

Bài thuyết trình tập trung vào bài toán trình duyệt và server trao đổi dữ liệu gần thời gian thực:

- **Polling → Long polling → SSE → WebSocket** là chuỗi các transport/kỹ thuật truyền dữ liệu, từ request–response định kỳ tới kết nối hai chiều lâu dài.
- **SignalR** không phải một transport mới sau WebSocket. Đây là framework/lớp abstraction phía trên, có thể dùng WebSocket, SSE hoặc Long Polling làm transport bên dưới.

Webhook thuộc bài toán server–server nên được bỏ khỏi phạm vi hiện tại.

## Chuỗi tiến hóa: Polling → Long polling → SSE → WebSocket

| | **1. Polling** | **2. Long polling** | **3. SSE** | **4. WebSocket** |
| --- | --- | --- | --- | --- |
| **Cách hoạt động** | Client gửi request đều đặn, ví dụ mỗi 5 giây. Server trả lời ngay dù có dữ liệu mới hay không. | Client gửi request, server giữ request cho tới khi có dữ liệu hoặc hết thời gian chờ. Sau khi nhận response, client lập tức gửi request mới. | Client mở một kết nối HTTP. Server giữ kết nối mở và đẩy từng sự kiện xuống bất cứ lúc nào. | Kết nối bắt đầu bằng HTTP rồi được nâng cấp thành một kết nối riêng, cho phép hai bên gửi dữ liệu tự do. |
| **Ưu điểm** | Rất đơn giản, chạy được hầu như mọi nơi, không cần hạ tầng đặc biệt và dễ debug. | Nhận dữ liệu gần như tức thì, ít request “trống” hơn Polling và vẫn tương thích rộng nhờ dùng HTTP. | Chỉ cần một kết nối lâu dài, không phải liên tục hỏi lại. Trình duyệt hỗ trợ sẵn qua `EventSource`, tự động kết nối lại và có `Last-Event-ID` để lấy lại sự kiện bị lỡ. | Giao tiếp hai chiều, độ trễ rất thấp, overhead mỗi message nhỏ và hỗ trợ cả text lẫn binary. |
| **Nhược điểm** | Phần lớn request có thể trả về “chưa có gì”, gây lãng phí. Độ trễ tối đa bằng chu kỳ Polling. Số lượng request vô ích tăng mạnh khi có nhiều người dùng. | Sau mỗi response phải mở request mới với đầy đủ HTTP header. Server phải giữ nhiều kết nối chờ. Dữ liệu có thể bị mất hoặc trùng trong khoảng chuyển tiếp giữa hai request. | Chỉ truyền một chiều từ server xuống client và chỉ hỗ trợ text UTF-8. Trên HTTP/1.1, trình duyệt thường giới hạn khoảng 6 kết nối mỗi domain. Một số proxy hoặc CDN có thể buffer dữ liệu và gây trễ. | Phức tạp hơn vì phải tự xử lý reconnect, heartbeat và khôi phục message bị mất. Kết nối có trạng thái nên khó scale hơn, thường cần sticky session hoặc pub/sub. Không tận dụng được HTTP cache và có thể bị proxy hoặc firewall chặn. |
| **Bản sau khắc phục điều gì?** | Long polling giảm request vô ích và giảm độ trễ bằng cách để server quyết định khi nào trả lời. | SSE loại bỏ chu trình “nhận xong lại mở request mới” bằng một kết nối lâu dài có chuẩn và cơ chế reconnect sẵn. | WebSocket cho phép client cũng chủ động gửi dữ liệu trên cùng kết nối, không cần thêm request riêng. | Không có bước kế tiếp trực tiếp trong chuỗi này. Có thể cân nhắc WebTransport/HTTP/3 hoặc WebRTC cho những nhu cầu khác. |
| **Hạn chế còn lại** | Không thực sự real-time vì client vẫn phải chủ động hỏi. | Vẫn là mô hình request/response kéo dài, chưa phải một kênh liên tục. Server chỉ có thể trả lời khi client đã gửi request. | Không thể gửi dữ liệu từ client lên qua chính kênh SSE; thường phải dùng thêm HTTP POST. Không hỗ trợ binary. | Độ linh hoạt cao đi kèm chi phí vận hành lớn hơn. Nếu chỉ cần đẩy thông báo một chiều, WebSocket có thể là giải pháp quá phức tạp. |

## Câu chuyện để kể: mỗi bước một câu

1. **Polling:** “Web ban đầu chỉ biết hỏi rồi đáp. Muốn biết có tin mới, cách duy nhất là cứ hỏi đi hỏi lại.” → Tốn tài nguyên và vẫn có độ trễ.
2. **Long polling:** “Đừng trả lời ‘chưa có’ nữa, cứ giữ request đó; khi nào có tin thì trả.” → Nhanh hơn, nhưng nhận xong lại phải hỏi từ đầu.
3. **SSE:** “Mở một đường ống duy nhất, server cứ thế đẩy dữ liệu xuống.” → Gọn và ổn định, nhưng đường ống chỉ chạy một chiều.
4. **WebSocket:** “Cho cả hai bên nói chuyện qua cùng một đường.” → Phù hợp với chat, game và cộng tác thời gian thực, nhưng phải tự quản lý nhiều vấn đề vận hành hơn.

## Bảng kỹ thuật tóm tắt

| **Tiêu chí** | **Polling** | **Long polling** | **SSE** | **WebSocket** |
| --- | --- | --- | --- | --- |
| **Hướng dữ liệu** | Client hỏi, server trả lời | Client hỏi, server trả lời trễ | Server → client | Hai chiều |
| **Số kết nối** | Nhiều kết nối ngắn | Nhiều kết nối kéo dài nối tiếp nhau | Một kết nối kéo dài | Một kết nối kéo dài |
| **Độ trễ** | Cao | Thấp | Rất thấp | Rất thấp |
| **Overhead mỗi message** | Cao vì có đầy đủ HTTP header | Cao | Thấp | Rất thấp |
| **Kiểu dữ liệu** | Bất kỳ | Bất kỳ | Chỉ text | Text và binary |
| **Tự động kết nối lại** | Không cần | Phải tự viết | Có sẵn | Phải tự viết |
| **Độ khó triển khai** | Dễ nhất | Trung bình | Dễ | Khó nhất |
| **Phù hợp với** | Dữ liệu ít thay đổi, ưu tiên đơn giản | Hệ thống cũ, cần tương thích HTTP rộng | Thông báo, dashboard, AI streaming | Chat, game, bảng trắng và cộng tác thời gian thực |

## SignalR nằm ở đâu trong bức tranh này?

SignalR là framework real-time của ASP.NET Core, không phải một biến thể của WebSocket. Nó tạo một lớp lập trình cấp cao hơn transport:

1. Ứng dụng gọi Hub methods và gửi dữ liệu tới một client, một nhóm hoặc toàn bộ client.
2. SignalR mã hóa lời gọi bằng Hub Protocol, mặc định là JSON và có thể dùng MessagePack.
3. SignalR thương lượng transport mà client và server cùng hỗ trợ, ưu tiên WebSocket rồi fallback sang SSE hoặc Long Polling.

Nếu dùng WebSocket, SignalR có một kênh hai chiều thực sự. Nếu fallback sang SSE, SignalR ghép SSE cho chiều server → client với HTTP POST cho chiều client → server nhưng vẫn cung cấp cho ứng dụng một abstraction hai chiều thống nhất.

SignalR còn hỗ trợ quản lý kết nối, keep-alive, Hub/RPC, users/groups và các lựa chọn scale-out. Tuy nhiên, nó không tự biến delivery thành “exactly once”, và automatic reconnect của JavaScript client vẫn phải được bật rõ ràng.

## Kết luận lựa chọn kỹ thuật

Không có kỹ thuật nào luôn tốt nhất. Nên chọn giải pháp đơn giản nhất đáp ứng đúng hướng dữ liệu và yêu cầu độ trễ:

- Dùng **Polling** khi dữ liệu ít thay đổi và sự đơn giản quan trọng hơn độ trễ.
- Dùng **Long polling** khi cần gần real-time nhưng phải tương thích với hệ thống HTTP cũ.
- Dùng **SSE** khi server chủ yếu đẩy text hoặc sự kiện xuống trình duyệt.
- Dùng **WebSocket** khi cần tương tác hai chiều với độ trễ thấp.
- Dùng **SignalR** khi xây dựng trên ASP.NET Core và muốn một API cấp cao quản lý transport, Hub/RPC, kết nối và nhóm client thay vì tự xây toàn bộ trên raw WebSocket/SSE.
