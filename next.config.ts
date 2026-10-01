import type { NextConfig } from "next";

const config: NextConfig = {
  // SSE cần flush từng event thay vì chờ bộ đệm nén.
  compress: false,
  devIndicators: false,
};

export default config;
