import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProtoLab — Client–Server Lab",
  description:
    "Năm cách client và server giao tiếp. Thao tác, quan sát và hiểu cách dữ liệu di chuyển.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
