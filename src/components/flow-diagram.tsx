import { ArrowRight, Monitor, Server, Settings } from "lucide-react";
import { useEffect, useRef, type CSSProperties } from "react";
import type { Actor, FlowStep } from "@/components/activity-log";

export function FlowDiagram({ actors, steps, current, playing, duration, replayKey }: {
  actors: Actor[]; steps: FlowStep[]; current: number; playing: boolean; duration: number; replayKey: string;
}) {
  const active = steps[current];
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const container = list.current;
    const item = container?.children[current] as HTMLElement | undefined;
    if (!container || !item) return;
    const top = item.offsetTop;
    if (top < container.scrollTop || top + item.offsetHeight > container.scrollTop + container.clientHeight)
      container.scrollTop = top;
  }, [current, steps]);
  // Lịch sử vẫn đọc được khi một người đã rời phòng.
  const visible = [...actors];
  for (const step of steps) {
    for (const id of [step.from, step.to]) {
      if (!visible.some((actor) => actor.id === id)) visible.push({ id, label: id, role: "Kết nối trước đó" });
    }
  }
  const actorLabel = (id: string) => visible.find((actor) => actor.id === id)?.label ?? id;
  const source = visible.findIndex((actor) => actor.id === active?.from);
  const target = visible.findIndex((actor) => actor.id === active?.to);
  const local = source === target;
  const reverse = target < source;
  const count = Math.max(visible.length, 1);
  const fromX = ((source + 0.5) / count) * 100;
  const toX = ((target + 0.5) / count) * 100;

  return (
    <div className="flow-diagram">
      <div className="flow-actors" style={{ "--actor-count": count } as CSSProperties}>
        {visible.map((actor) => {
          const sending = active?.from === actor.id;
          const receiving = active?.to === actor.id;
          const Icon = /server|máy chủ/i.test(actor.role) || ["server", "provider", "receiver"].includes(actor.id) ? Server : Monitor;
          return <div key={actor.id} className={`flow-actor ${sending || receiving ? "flow-actor-active" : ""}`}>
            <span className="flow-actor-icon"><Icon size={21} strokeWidth={1.6} aria-hidden="true" /></span>
            <span className="flow-actor-role">{actor.role}</span>
            <strong>{actor.label}</strong>
            <span className="flow-actor-state">{actor.state ? `Hiện tại: ${actor.state}` : ""}</span>
            <span className="flow-actor-action">{sending && receiving ? "Xử lý tại đây" : sending ? "Bên gửi" : receiving ? "Bên nhận" : "—"}</span>
          </div>;
        })}
      </div>
      <div className="flow-wire" aria-hidden="true">
        {visible.map((actor, index) => <span key={actor.id} className="flow-lifeline" style={{ left: `${((index + 0.5) / count) * 100}%` }} />)}
        {active && (local ? <span className="flow-local" style={{ left: `${fromX}%` }}><Settings size={18} /></span> : <div className={`flow-route ${reverse ? "flow-route-reverse" : ""}`} style={{ left: `${Math.min(fromX, toX)}%`, width: `${Math.abs(fromX - toX)}%` }}>
          <span className="flow-arrowhead" />
          <span key={`${replayKey}-${current}-${duration}`} className="flow-packet-track" style={{ animationDuration: `${duration}ms`, animationPlayState: playing ? "running" : "paused" }}><span className="flow-packet" /></span>
        </div>)}
      </div>
      <div className="flow-direction">{active ? <><span>{actorLabel(active.from)}</span>{local ? <Settings size={14} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}<span>{local ? "Xử lý nội bộ" : actorLabel(active.to)}</span></> : <span>Client và server chưa trao đổi dữ liệu</span>}</div>
      <ol ref={list} className="flow-step-list" tabIndex={steps.length ? 0 : -1} aria-label="Các bước trong lần trao đổi">
        {steps.map((step, index) => <li key={index} className={index === current ? "flow-step-current" : index < current ? "flow-step-past" : ""} aria-current={index === current ? "step" : undefined}>
          <span className="flow-step-number mono">{index + 1}</span><span><strong>{step.label}</strong><small>{actorLabel(step.from)} {step.from === step.to ? "· xử lý nội bộ" : `→ ${actorLabel(step.to)}`}</small></span>
        </li>)}
      </ol>
    </div>
  );
}
