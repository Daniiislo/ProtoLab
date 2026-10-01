import { ArrowUpRight, Blocks } from "lucide-react";
import { ProtocolTabs } from "@/components/protocol-tabs";

export default function Home() {
  return (
    <div className="app-shell">
      <a href="#workspace" className="skip-link">
        Đến nội dung chính
      </a>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Blocks size={24} strokeWidth={1.7} />
          </span>
          <div>
            <h1>
              ProtoLab<span className="brand-dot">.</span>
            </h1>
            <span className="brand-subtitle">CLIENT–SERVER LAB</span>
          </div>
        </div>
        <div className="header-note">
          Client &amp; server.
          <br />
          <strong>Năm cách kết nối.</strong>
        </div>
        <span className="local-badge">
          <span className="tiny-dot" />
          Local environment
          <ArrowUpRight size={14} aria-hidden="true" />
        </span>
      </header>
      <main id="workspace">
        <ProtocolTabs />
      </main>
      <footer className="app-footer">
        <span>THAO TÁC. QUAN SÁT. HIỂU CƠ CHẾ.</span>
        <span>
          05 giao thức <span className="footer-divider">/</span> 01 phòng thí nghiệm
        </span>
      </footer>
    </div>
  );
}
