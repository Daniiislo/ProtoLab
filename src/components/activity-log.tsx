"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, GitBranch, Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FlowDiagram } from "@/components/flow-diagram";

export type Actor = { id: string; label: string; role: string; state?: string };
export type FlowStep = { from: string; to: string; label: string; detail?: string };
type Kind = "send" | "receive" | "info" | "error";
type Entry = {
  id: string; time: string; kind: Kind; title: string; detail?: string; flow?: FlowStep[];
};
const defaultActors: Actor[] = [
  { id: "client", label: "Trình duyệt", role: "Client" },
  { id: "server", label: "Máy chủ", role: "Server" },
];
const labels = { send: "Client gửi", receive: "Client nhận", info: "Trạng thái", error: "Lỗi" };

export function useActivity() {
  const [entries, setEntries] = useState<Entry[]>([]);
  // Số bước của từng entry, đọc được ngay khi ghi để demo biết bước mới nằm ở vị trí nào.
  const lengths = useRef(new Map<string, number>());
  const log = useCallback((kind: Kind, title: string, detail?: string, flow?: FlowStep[]) => {
    const entry = { id: crypto.randomUUID(), time: new Date().toLocaleTimeString("vi-VN", { hour12: false }), kind, title, detail, flow };
    lengths.current.set(entry.id, flow?.length ?? 0);
    // Map giữ thứ tự chèn: bỏ entry cũ nhất khi vượt quá số entry còn hiển thị.
    if (lengths.current.size > 80) lengths.current.delete(lengths.current.keys().next().value!);
    setEntries((previous) => [entry, ...previous].slice(0, 80));
    return entry.id;
  }, []);
  // Request còn mở ghi tiếp vào entry của chính nó; trả về vị trí bước đầu tiên vừa thêm.
  const extend = useCallback((id: string, kind: Kind, title: string, detail?: string, flow: FlowStep[] = []) => {
    const index = lengths.current.get(id) ?? 0;
    lengths.current.set(id, index + flow.length);
    setEntries((previous) => previous.map((entry) => entry.id === id
      ? { ...entry, kind, title, detail, flow: [...(entry.flow ?? []), ...flow] }
      : entry));
    return index;
  }, []);
  return { entries, log, extend };
}

export function ActivityLog({ entries, actors = defaultActors, note, onStep, sequential = false }: {
  entries: Entry[]; actors?: Actor[]; note?: string;
  onStep?: (entryId: string | null, step: number) => void;
  // Phát lần lượt từng entry thay vì nhảy tới entry mới nhất (dùng khi entry phát sinh thưa).
  sequential?: boolean;
}) {
  // Giữ một bản chụp trong lúc phát: sự kiện mới không chen ngang câu chuyện.
  const [selected, setSelected] = useState<Entry | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [following, setFollowing] = useState(true);
  const [replay, setReplay] = useState(0);
  const [speed, setSpeed] = useState(1800);
  const reducedMotion = useRef(false);
  // Request ngắn ghi entry gửi và entry nhận riêng: ưu tiên lần trao đổi đã có kết quả.
  const latest = entries.find((entry) => entry.flow?.length && entry.kind !== "send")
    ?? entries.find((entry) => entry.flow?.length);
  const steps = selected?.flow ?? [];
  const selectedIndex = selected ? entries.findIndex((entry) => entry.id === selected.id) : 0;
  const current = selected && selectedIndex >= 0 ? entries[selectedIndex] : undefined;
  const target = sequential && current
    ? entries.slice(0, selectedIndex).reverse().find((entry) => entry.flow?.length) ?? current
    : latest;
  const pending = entries.slice(0, selectedIndex < 0 ? entries.length : selectedIndex).filter((entry) => entry.flow?.length).length;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    function update() {
      reducedMotion.current = media.matches;
      if (media.matches) { setPlaying(false); setFollowing(false); }
    }
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    // Entry đang xem có thêm bước: phát tiếp từ chỗ đang dừng thay vì chuyển sang entry khác.
    if (current && current !== selected) {
      setSelected(current);
      // Không có chuyển động: hiển thị ngay bước mới nhất thay vì đứng ở bước cũ.
      if (reducedMotion.current) setStep((current.flow?.length ?? 1) - 1);
      else if (following) setPlaying(true);
      return;
    }
    if (!target || target.id === selected?.id || (selected && (playing || !following))) return;
    setSelected(target);
    setStep(reducedMotion.current ? (target.flow?.length ?? 1) - 1 : 0);
    setPlaying(!reducedMotion.current);
  }, [current, target, selected, playing, following]);

  // Demo có thể hiển thị trạng thái theo đúng bước đang mô phỏng.
  useEffect(() => {
    onStep?.(selected?.id ?? null, step);
  }, [onStep, selected?.id, step]);

  useEffect(() => {
    if (!playing || !steps.length) return;
    const timer = setTimeout(() => {
      if (step < steps.length - 1) setStep(step + 1);
      else setPlaying(false);
    }, speed);
    return () => clearTimeout(timer);
  }, [playing, step, steps.length, speed, selected?.id, replay]);

  function show(entry: Entry, follow = false) {
    setSelected(entry); setStep(0); setFollowing(follow);
    setPlaying(!reducedMotion.current); setReplay((value) => value + 1);
  }
  function move(next: number) {
    setFollowing(false); setPlaying(false); setStep(next);
  }

  return (
    <aside className="activity-panel" aria-label="Sơ đồ luồng dữ liệu">
      <div className="activity-heading">
        <div>
          <span className="section-label">MÔ PHỎNG TRÌNH TỰ</span>
          <h3><GitBranch size={18} aria-hidden="true" />Luồng dữ liệu</h3>
        </div>
        <span className="flow-mode">{playing ? "Đang phát" : selected ? "Chế độ từng bước" : "Chưa có dữ liệu"}</span>
      </div>
      <div className="flow-player">
        <FlowDiagram actors={actors} steps={steps} current={step} playing={playing} duration={speed} replayKey={`${selected?.id}-${replay}`} />
        <div className="flow-caption" role="status" aria-live="polite" aria-atomic="true">
          <span className="section-label">{selected ? `BƯỚC ${step + 1} / ${steps.length}` : "SẴN SÀNG"}</span>
          <p>{steps[step]?.label}</p>
        </div>
        <div className="flow-payload">
          <span className="section-label">{steps.length && steps[step]?.from === steps[step]?.to ? "XỬ LÝ NỘI BỘ" : "DỮ LIỆU TRUYỀN"}</span>
          <pre tabIndex={0} aria-label="Chi tiết bước hiện tại">{steps[step]?.detail ?? selected?.detail ?? "—"}</pre>
        </div>
        <div className="flow-controls" aria-label="Điều khiển trình phát">
          <Button variant="outline" size="icon" aria-label="Bước trước" disabled={!selected || step === 0} onClick={() => move(step - 1)}><ChevronLeft size={17} aria-hidden="true" /></Button>
          <Button variant="outline" disabled={!selected} onClick={() => {
            setFollowing(false);
            if (!playing && step === steps.length - 1) { setStep(0); setReplay((value) => value + 1); }
            setPlaying(!playing);
          }}>{playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}{playing ? "Tạm dừng" : "Phát"}</Button>
          <Button variant="outline" size="icon" aria-label="Bước kế tiếp" disabled={!selected || step >= steps.length - 1} onClick={() => move(step + 1)}><ChevronRight size={17} aria-hidden="true" /></Button>
          <Button variant="ghost" size="icon" aria-label="Phát lại từ đầu" disabled={!selected} onClick={() => selected && show(selected)}><RotateCcw size={16} aria-hidden="true" /></Button>
          <label className="flow-speed">Tốc độ<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={1800}>Chậm</option><option value={3200}>Rất chậm</option></select></label>
        </div>
        {selected && <div className="flow-current">
          <span><time className="mono">{selected.time}</time> · {selected.title}</span>
          {latest && <Button variant="ghost" size="sm" disabled={latest.id === selected.id && following} onClick={() => show(latest, true)}>Sự kiện mới nhất{pending > 0 ? ` (+${pending})` : ""}</Button>}
        </div>}
      </div>
      {note && <p className="flow-note">{note}</p>}
      {entries.length > 0 && <details className="flow-history">
        <summary>Lịch sử sự kiện <span className="mono">{entries.length}</span></summary>
        <ol className="activity-scroll log-list" aria-label="Nhật ký sự kiện">
          {entries.map((entry) => <li key={entry.id} className={`log-entry log-${entry.kind}`}>
            <div className="log-entry-meta"><span>{labels[entry.kind]}</span><time className="mono">{entry.time}</time></div>
            {entry.flow?.length ? <button type="button" className="flow-history-button" aria-current={selected?.id === entry.id ? "true" : undefined} onClick={() => show(entry)}>{entry.title}<Play size={13} aria-hidden="true" /></button> : <p>{entry.title}</p>}
            {entry.detail && <pre>{entry.detail}</pre>}
          </li>)}
        </ol>
      </details>}
    </aside>
  );
}
