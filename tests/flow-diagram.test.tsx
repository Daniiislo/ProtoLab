import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FlowDiagram } from "../src/components/flow-diagram";

test("flow keeps sender, server, echo and other recipient distinct", () => {
  const actors = [
    { id: "one", label: "An", role: "Client · bạn" },
    { id: "server", label: "Máy chủ", role: "Server" },
    { id: "two", label: "Bình", role: "Client · người khác" },
  ];
  const steps = [
    { from: "one", to: "server", label: "Gửi lời chào" },
    { from: "server", to: "one", label: "Nhận lại tin của mình" },
    { from: "server", to: "two", label: "Phát cho Bình" },
  ];
  const render = (current: number) => renderToStaticMarkup(<FlowDiagram actors={actors} steps={steps} current={current} playing={false} duration={1800} replayKey="test" />);
  assert.match(render(1), /flow-route-reverse/);
  assert.doesNotMatch(render(2), /flow-route-reverse/);
  assert.match(render(1), /Máy chủ.*→ An/);
  assert.match(render(2), /Máy chủ.*→ Bình/);
  assert.equal((render(0).match(/aria-current="step"/g) ?? []).length, 1);
  assert.match(render(1), /animation-play-state:paused/);
});

test("internal processing has no network arrow; historical actors remain readable", () => {
  const html = renderToStaticMarkup(<FlowDiagram actors={[{ id: "receiver", label: "Cửa hàng", role: "Server" }]} steps={[{ from: "receiver", to: "receiver", label: "Cập nhật đơn" }, { from: "receiver", to: "departed", label: "Gửi kết quả" }]} current={0} playing={false} duration={1800} replayKey="test" />);
  assert.match(html, /flow-local/);
  assert.doesNotMatch(html, /class="flow-route/);
  assert.match(html, /Xử lý nội bộ/);
  assert.match(html, /Kết nối trước đó/);
  assert.match(html, /departed/);
});
