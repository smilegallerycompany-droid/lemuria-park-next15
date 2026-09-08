"use client";

import { labelTimelineType } from "@/lib/director/labels";

type TimelineEvent = {
  type: string;
  at: string;
  title: string;
  detail?: string | null;
};

export function OrderTimeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) {
    return <div className="director-empty">Нет событий</div>;
  }

  return (
    <ol className="internal-timeline">
      {events.map((ev, idx) => (
        <li key={`${ev.type}-${ev.at}-${idx}`} className="internal-timeline-item">
          <span className="internal-timeline-dot" data-type={ev.type} aria-hidden />
          <div className="internal-timeline-body">
            <div className="internal-timeline-title">{ev.title}</div>
            <div className="internal-timeline-meta">
              <time dateTime={ev.at}>{new Date(ev.at).toLocaleString("ru-RU")}</time>
              <span className="internal-timeline-type">{labelTimelineType(ev.type)}</span>
            </div>
            {ev.detail ? <div className="internal-timeline-detail">{ev.detail}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
