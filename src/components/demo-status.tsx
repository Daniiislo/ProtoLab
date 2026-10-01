import type { ReactNode } from "react";

export function Status({
  children,
  tone = "idle",
}: {
  children: ReactNode;
  tone?: "idle" | "live" | "error" | "done";
}) {
  return (
    <span className={`status status-${tone}`} role="status">
      <span className="status-dot" aria-hidden="true" />
      {children}
    </span>
  );
}
