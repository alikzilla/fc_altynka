import { formatDateRu, matchCountdown, todayAlmaty, type EventSummaryDto } from "@altynka/core";
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

/** One big answer — how soon — then a single when/where line and two tags: your place and the roster. */
export function MatchCard({
  event,
  index,
}: {
  event: EventSummaryDto;
  index: number;
}) {
  const e = useMatchPhase(event)!;
  const countdown =
    e.status === "playing"
      ? "Идёт игра"
      : (matchCountdown(e.date, todayAlmaty(new Date())) ?? STATUS_LABEL[e.status]);
  const time =
    e.startTime && e.durationHours
      ? timeRange(e.startTime, e.durationHours)
      : "Время уточняется";
  const roster = `${e.mainCount} / ${e.limit}${e.reserveCount ? ` · резерв ${e.reserveCount}` : ""}`;
  return (
    <article
      className={`card match-card ${index % 2 ? "material-blue" : "material-plum"}`}
      aria-label={`Матч ${formatDateRu(e.date)}`}
    >
      <h2 className="match-day">{formatDateRu(e.date)}</h2>
      <p className="match-headline">{countdown}</p>
      <p className="match-when">
        {time} · {e.place || "Поле уточняется"}
      </p>
      <div className="match-tags">
        <MyTag event={e} />
        <span
          className="match-tag"
          aria-label={`Записано ${e.mainCount} из ${e.limit}${e.reserveCount ? `, в резерве ${e.reserveCount}` : ""}`}
        >
          {roster}
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

function MyTag({ event: e }: { event: EventSummaryDto }) {
  if (e.my === "main")
    return (
      <span className="match-tag on">
        <Icon name="check" />
        Ты в основе
      </span>
    );
  if (e.my === "reserve")
    return (
      <span className="match-tag reserve">
        {e.myReservePosition
          ? `Ты в резерве · №${e.myReservePosition}`
          : "Ты в резерве"}
      </span>
    );
  return (
    <span className="match-tag">
      {e.status === "playing" ? "Запись закрыта" : "Запись открыта"}
    </span>
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
