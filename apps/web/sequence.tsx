import type { CSSProperties } from "react";
import {
  initialBudgets,
  sectionNames,
  sectionOrder,
  type SectionId,
} from "../../packages/contracts/project.ts";

export function timecode(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return [Math.floor(seconds / 60), seconds % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

export function Sequence({
  duration,
  busy,
  onSelect,
}: {
  duration: number;
  busy: boolean;
  onSelect: (section: SectionId) => void;
}) {
  const budgets = initialBudgets(duration);
  return (
    <section className="sequence" aria-labelledby="sequence-title">
      <div className="sequence-head">
        <div>
          <h2 id="sequence-title">五段时间预算</h2>
          <div className="counter">
            <span className="sr-only">目标时长 {duration / 1000} 秒</span>
            <span aria-hidden="true">{timecode(duration)}</span>
          </div>
        </div>
        <span className="format">
          1080p <i /> 30 fps
        </span>
      </div>
      <div className="track-layout">
        <div className="budget-strip" aria-hidden="true">
          {sectionOrder.map((id, i) => (
            <i className={`clip-${id}`} key={id} style={{ flex: budgets[i] }} />
          ))}
        </div>
        <div
          className="track"
          style={{ "--allocation": budgets.map((n) => `minmax(0, ${n}fr)`).join(" ") } as CSSProperties}
        >
          {sectionOrder.map((id, i) => (
            <button
              key={id}
              type="button"
              className={`clip clip-${id}`}
              disabled={busy}
              onClick={() => onSelect(id)}
              aria-label={`编辑${sectionNames[id]}讲稿，预算 ${budgets[i] / 1000} 秒`}
            >
              <strong>{sectionNames[id]}</strong>
              <span>{budgets[i] / 1000} s</span>
            </button>
          ))}
        </div>
        <div className="ruler" aria-hidden="true">
          <span>00:00</span>
          <span>{timecode(duration / 2)}</span>
          <span>{timecode(duration)}</span>
        </div>
      </div>
    </section>
  );
}
