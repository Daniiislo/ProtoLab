"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="error-page" role="alert">
      <h2>Demo gặp sự cố.</h2>
      <p>Thử tải lại phiên để tiếp tục.</p>
      <button className="button button-primary" onClick={reset}>
        Thử lại
      </button>
    </div>
  );
}
