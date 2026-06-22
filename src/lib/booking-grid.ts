/** All booking start times align to this grid (minutes). */
export const BOOKING_GRID_MINUTES = 15;

export function snapDown(min: number, grid: number = BOOKING_GRID_MINUTES): number {
  return Math.floor(min / grid) * grid;
}

export function snapUp(min: number, grid: number = BOOKING_GRID_MINUTES): number {
  return Math.ceil(min / grid) * grid;
}

/** Format minutes from midnight for display (handles midnight / end-of-day). */
export function formatMinuteLabel(min: number): string {
  const clamped = min >= 1440 ? 0 : min;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function isOnBookingGrid(min: number, grid: number = BOOKING_GRID_MINUTES): boolean {
  return min % grid === 0;
}

export type OccupiedRange = [number, number];

export function isRangeBusy(
  start: number,
  end: number,
  occupied: OccupiedRange[],
): boolean {
  return occupied.some(([os, oe]) => start < oe && end > os);
}

/** Earliest grid-aligned start at or after `minStart` that fits `duration` without overlap. */
export function bumpStartPastOccupied(
  minStart: number,
  duration: number,
  occupied: OccupiedRange[],
  grid: number = BOOKING_GRID_MINUTES,
): number {
  let min = minStart;
  let changed = true;
  while (changed) {
    changed = false;
    for (const [os, oe] of occupied) {
      if (min < oe && min + duration > os) {
        const next = snapUp(oe, grid);
        if (next > min) {
          min = next;
          changed = true;
        }
      }
    }
  }
  return min;
}

export function minFutureGridStart(
  nowMin: number,
  minNoticeMinutes: number,
  grid: number = BOOKING_GRID_MINUTES,
): number {
  let min = snapUp(nowMin, grid);
  if (minNoticeMinutes > 0) {
    min = Math.max(min, snapUp(nowMin + minNoticeMinutes, grid));
  }
  return min;
}

/** Start of the current grid block containing `nowMin` (walk-up / "Now" slot). */
export function nowBlockStart(
  nowMin: number,
  grid: number = BOOKING_GRID_MINUTES,
): number {
  return snapDown(nowMin, grid);
}

export function buildStartSlotOptions(args: {
  dayKey: string;
  nowKey: string;
  nowMin: number;
  duration: number;
  occupied: OccupiedRange[];
  minNoticeMinutes: number;
  grid?: number;
}): Array<{ value: number; label: string; busy: boolean; isNow?: boolean }> {
  const {
    dayKey,
    nowKey,
    nowMin,
    duration,
    occupied,
    minNoticeMinutes,
    grid = BOOKING_GRID_MINUTES,
  } = args;

  const opts: Array<{ value: number; label: string; busy: boolean; isNow?: boolean }> = [];
  if (dayKey < nowKey) return opts;

  const isToday = dayKey === nowKey;
  const isBusy = (s: number) => isRangeBusy(s, s + duration, occupied);

  if (isToday) {
    const block = nowBlockStart(nowMin, grid);
    const nearest =
      !isBusy(block) && block + duration <= 1440
        ? block
        : bumpStartPastOccupied(snapUp(nowMin, grid), duration, occupied, grid);

    if (nearest + duration <= 1440) {
      const end = nearest + duration;
      const walkUp = nearest === block;
      opts.push({
        value: nearest,
        label: `${walkUp ? "Now" : "Next available"} (${formatMinuteLabel(nearest)} – ${formatMinuteLabel(end)})${isBusy(nearest) ? " · busy" : ""}`,
        busy: isBusy(nearest),
        isNow: walkUp,
      });
    }
  }

  let minStart = isToday
    ? bumpStartPastOccupied(
        minFutureGridStart(nowMin, minNoticeMinutes, grid),
        duration,
        occupied,
        grid,
      )
    : 0;

  if (!isToday) {
    minStart = bumpStartPastOccupied(minStart, duration, occupied, grid);
  }

  const nowBlock = isToday ? nowBlockStart(nowMin, grid) : -1;
  const nearestStart = isToday
    ? opts.find((o) => o.isNow || o.label.startsWith("Next available"))?.value ?? nowBlock
    : -1;

  for (let s = minStart; s + duration <= 1440; s += grid) {
    if (isToday && (s === nowBlock || s === nearestStart)) continue;
    const end = s + duration;
    opts.push({
      value: s,
      label: `${formatMinuteLabel(s)} – ${formatMinuteLabel(end)}${isBusy(s) ? " · busy" : ""}`,
      busy: isBusy(s),
    });
  }

  return opts;
}

export function earliestBookableStart(args: {
  dayKey: string;
  nowKey: string;
  nowMin: number;
  duration: number;
  occupied: OccupiedRange[];
  minNoticeMinutes: number;
  grid?: number;
}): number {
  const { dayKey, nowKey, nowMin, duration, occupied, minNoticeMinutes, grid = BOOKING_GRID_MINUTES } =
    args;
  if (dayKey < nowKey) return 1440;
  if (dayKey > nowKey) {
    return bumpStartPastOccupied(0, duration, occupied, grid);
  }
  return bumpStartPastOccupied(
    minFutureGridStart(nowMin, minNoticeMinutes, grid),
    duration,
    occupied,
    grid,
  );
}
