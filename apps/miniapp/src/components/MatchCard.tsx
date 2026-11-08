import { formatDateRu, type EventSummaryDto } from "@altynka/core";
import { Link } from "wouter";
import { GroupTag } from "./GroupTag";
import { Icon } from "./Icon";
import { useMatchPhase } from "../hooks/useMatchPhase";
import { STATUS_LABEL, timeRange, whenLine } from "../lib/labels";

export function datePart(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("ru", {
    ...options,
    timeZone: "Asia/Almaty",
  }).format(new Date(`${date}T12:00:00+05:00`));
}

export function MatchCard({
  event,
  index,
}: {
  event: EventSummaryDto;
  index: number;
}) {
  const e = useMatchPhase(event)!;
  const month = datePart(e.date, { day: "numeric", month: "long" })
    .split(" ")
    .slice(1)
    .join(" ");
  return (
    <article
      className={`card match-card ${index % 2 ? "material-blue" : "material-plum"}`}
      aria-label={`Матч ${formatDateRu(e.date)}`}
    >
      <div className="row between match-status">
        <span className="chip">
          <i className="status-dot" />
          {STATUS_LABEL[e.status]}
        </span>
        <span>{datePart(e.date, { weekday: "long" })}</span>
      </div>
      <h2 className="match-date" aria-label={formatDateRu(e.date)}>
        <span>{e.date.slice(8)}</span>
        <small>{month}</small>
      </h2>
      <div className="match-time">
        {e.startTime && e.durationHours
          ? timeRange(e.startTime, e.durationHours)
          : "Время уточняется"}
      </div>
      <div className="match-place">
        <Icon name="pin" />
        <span>{e.place || "Поле уточняется"}</span>
      </div>
      <div className="match-roster">
        <div className="row between">
          <span>
            <strong>{e.mainCount}</strong> / {e.limit} игроков
          </span>
          <span>
            {e.reserveCount
              ? `Резерв: ${e.reserveCount}`
              : e.mainCount < e.limit
                ? `Свободно: ${e.limit - e.mainCount}`
                : "Мест нет"}
          </span>
        </div>
        <div className="roster-slots" aria-hidden="true">
          {Array.from({ length: Math.min(e.limit, 30) }, (_, i) => (
            <span key={i} className={i < e.mainCount ? "filled" : ""} />
          ))}
        </div>
      </div>
      <div className={`attendance ${e.my === "reserve" ? "reserve" : ""}`}>
        <Icon name={e.my === "main" ? "check" : "clock"} />
        <span>
          {e.status === "playing"
            ? "Запись закрыта"
            : e.my === "main"
              ? "Ты в основе"
              : e.my === "reserve"
                ? "Ты в резерве"
                : "Запись открыта"}
        </span>
      </div>
      <Link
        className="btn primary match-link"
        href={`/event/${e.id}`}
        aria-label={`Открыть матч ${formatDateRu(e.date)}`}
      >
        Открыть матч
        <Icon name="arrow" />
      </Link>
    </article>
  );
}

export function MatchRow({ event: e }: { event: EventSummaryDto }) {
  return (
    <Link
      href={`/event/${e.id}${e.status === "billing" ? "?tab=bill" : ""}`}
      className={`event-row ${e.status === "cancelled" ? "cancelled" : ""}`}
    >
      <span className="event-date-tile" aria-hidden="true">
        {Number(e.date.slice(8))}
        <small>{datePart(e.date, { month: "short" }).replace(".", "")}</small>
      </span>
      <span className="event-row-copy">
        <GroupTag community={e.community} />
        <b>{formatDateRu(e.date)}</b>
        <span className="muted">{whenLine(e)}</span>
        {e.status === "billing" && (
          <span className="status-text">{STATUS_LABEL[e.status]}</span>
        )}
      </span>
      <RowStatus event={e} />
      <Icon name="back" className="chevron-right" />
    </Link>
  );
}

/** Personal status at a glance on every row: signup position for open matches, team result for finished ones. */
function RowStatus({ event: e }: { event: EventSummaryDto }) {
  if (e.myResult) {
    const r = e.myResult;
    return <span className="row-chip result" aria-label={`Твоя команда: ${r.wins} побед, ${r.draws} ничьих, ${r.losses} поражений`}>{r.wins}–{r.draws}–{r.losses}</span>;
  }
  if (e.status !== "collecting" && e.status !== "scheduled") return null;
  if (e.my === "main") return <span className="row-chip on">В основе</span>;
  if (e.my === "reserve") return <span className="row-chip reserve">Резерв</span>;
  return <span className="row-chip" aria-label={`Записано ${e.mainCount} из ${e.limit}`}>{e.mainCount}/{e.limit}</span>;
}
