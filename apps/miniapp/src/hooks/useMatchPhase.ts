import { matchPhase, matchStartsAt, type EventSummaryDto } from "@altynka/core";
import { useEffect, useMemo, useState } from "react";
import { resourceReceivedAt } from "../lib/queryClient";

/** One boundary timer, anchored to server time rather than the phone's wall clock. */
export function useMatchPhase<T extends EventSummaryDto>(
  event: T | undefined,
  reload?: () => void,
): T | undefined {
  const [revision, setRevision] = useState(0);
  const anchor = useMemo(
    () => ({
      server: event?.serverNow ?? Date.now(),
      elapsed: (event && resourceReceivedAt(event)) ?? performance.now(),
    }),
    [event],
  );
  const now = () => anchor.server + performance.now() - anchor.elapsed;
  const phase = event ? matchPhase(event, now()) : undefined;
  useEffect(() => {
    if (!event || event.status !== "scheduled") return;
    const kickoff = matchStartsAt(event);
    const remaining = kickoff === null ? 0 : kickoff - now();
    if (remaining <= 0) return;
    const timer = setTimeout(
      () => {
        setRevision((value) => value + 1);
        if (kickoff !== null && now() >= kickoff) reload?.();
      },
      Math.min(remaining + 1, 2_147_483_647),
    );
    return () => clearTimeout(timer);
  }, [event, anchor, revision, reload]);
  return event && phase !== event.status ? { ...event, status: phase! } : event;
}
