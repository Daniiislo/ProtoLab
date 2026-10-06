"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="error-page" role="alert">
      <h2>Đã xảy ra lỗi.</h2>
      <p>Vui lòng tải lại phiên để tiếp tục.</p>
      <button className="button button-primary" onClick={reset}>
        Thử lại
      </button>
    </div>
  );
}
