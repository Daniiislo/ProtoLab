import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProtoLab — Client–Server Lab",
  description:
    "Năm mô hình giao tiếp giữa client và server, trình bày dưới dạng thí nghiệm tương tác.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
