"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createBookingAction } from "@/actions/booking";
import { joinWaitlistAction } from "@/actions/waitlist";
import {
  getOccupiedRanges,
  isDragRangeBookable,
  isRangeFree,
  minutesFromColumnEvent,
  normalizeDragRange,
  BOOKING_GRID_MINUTES,
  type DragSelection,
} from "@/components/calendar/calendar-drag";
import { useLiveAppNow } from "@/components/calendar/use-live-app-now";
import { buildStartSlotOptions, formatMinuteLabel } from "@/lib/booking-grid";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export type SerBooking = {
  id: string;
  mine: boolean;
  status: "CONFIRMED" | "PENDING" | "CANCELLED" | "REJECTED";
  noShow: boolean;
  ownerLabel?: string;
  startKey: string;
  startMin: number;
  endKey: string;
  endMin: number;
  startLabel: string;
  endLabel: string;
  rangeLabel: string;
};

type Day = { key: string; label: string; dayNum: string };

type WeekNav = {
  prevHref: string;
  nextHref: string;
  todayHref: string;
  weekLabel: string;
  isCurrentWeek: boolean;
};

type Props = {
  appTimezone: string;
  nowKey: string;
  nowMin: number;
  weekNav: WeekNav;
  instrument: {
    id: string;
    name: string;
    slotMinutes: number;
    maxSessionMinutes: number;
    advanceBookingDays: number;
    minNoticeMinutes: number;
    maintenance: boolean;
    bookingAdminMode: boolean;
  };
  days: Day[];
  bookings: SerBooking[];
  /** Own pending requests — shown as grey placeholders for the requester only. */
  myPendingRequests?: SerBooking[];
  canBook: boolean;
  isAdmin: boolean;
  showBookerNames: boolean;
  bookableUsers: { id: string; username: string }[];
  limitMinutes: number | null;
  usedStandardMinutes: number;
  myWaitlist: { id: string; startKey: string; startMin: number }[];
};

const HOUR_PX = 44;
const TIME_COL = "3.25rem"; // fits "10 AM" on one line
const SUBGRID_LINES = Array.from({ length: 1440 / BOOKING_GRID_MINUTES - 1 }, (_, i) => (i + 1) * BOOKING_GRID_MINUTES);

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** Compact single-line label for the hour gutter. */
function fmtHourGutter(h: number): string {
  if (h === 0) return "";
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${ampm}`;
}

export function CalendarClient(props: Props) {
  const {
    appTimezone,
    nowKey,
    nowMin,
    weekNav,
    instrument,
    days,
    bookings,
    myPendingRequests = [],
    canBook,
    isAdmin,
    bookableUsers,
    limitMinutes,
    usedStandardMinutes,
  } = props;
  const memberRequestMode = instrument.bookingAdminMode && !isAdmin;
  const adminBookMode = instrument.bookingAdminMode && isAdmin;
  const relaxedMinNotice = memberRequestMode || adminBookMode;
  const occupiedBlocks = useMemo(
    () => (memberRequestMode ? [...bookings, ...myPendingRequests] : bookings),
    [bookings, myPendingRequests, memberRequestMode],
  );
  const maxBookingMinutes = memberRequestMode
    ? instrument.advanceBookingDays * 24 * 60
    : instrument.maxSessionMinutes;
  const liveNow = useLiveAppNow(appTimezone, { dateKey: nowKey, minutes: nowMin });
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const [date, setDate] = useState(() => days.find((d) => d.key >= nowKey)?.key ?? days[0].key);
  const [duration, setDuration] = useState(instrument.slotMinutes * 2);
  const [startMin, setStartMin] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [targetUserId, setTargetUserId] = useState(() => bookableUsers[0]?.id ?? "");
  const [selection, setSelection] = useState<DragSelection | null>(null);
  const [drag, setDrag] = useState<{ dayKey: string; anchorMin: number; currentMin: number } | null>(null);
  const skipAutoStart = useRef(false);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 8 * HOUR_PX;
  }, []);

  const occupiedForDate = useMemo(
    () => getOccupiedRanges(date, occupiedBlocks),
    [occupiedBlocks, date],
  );

  const dayIndex = days.findIndex((d) => d.key === date);
  const withinAdvance = dayIndex <= props.instrument.advanceBookingDays;

  const slotOptions = useMemo(
    () =>
      buildStartSlotOptions({
        dayKey: date,
        nowKey: liveNow.dateKey,
        nowMin: liveNow.minutes,
        duration,
        occupied: occupiedForDate,
        minNoticeMinutes: relaxedMinNotice ? 0 : instrument.minNoticeMinutes,
      }),
    [date, liveNow, duration, occupiedForDate, instrument.minNoticeMinutes, relaxedMinNotice],
  );

  useEffect(() => {
    if (skipAutoStart.current) {
      skipAutoStart.current = false;
      return;
    }
    const preferred = slotOptions.find((o) => !o.busy);
    setStartMin((prev) => {
      if (prev !== null && slotOptions.some((o) => o.value === prev)) return prev;
      return preferred?.value ?? slotOptions[0]?.value ?? null;
    });
  }, [slotOptions]);

  useEffect(() => {
    if (startMin !== null) {
      setSelection({ dayKey: date, startMin, endMin: startMin + duration });
    } else {
      setSelection(null);
    }
  }, [date, startMin, duration]);

  const applySelection = useCallback(
    (dayKey: string, start: number, dur: number) => {
      skipAutoStart.current = true;
      setDate(dayKey);
      setDuration(dur);
      setStartMin(start);
      setSelection({ dayKey, startMin: start, endMin: start + dur });
      setMessage(null);
    },
    [],
  );

  const dragPreview = useMemo(() => {
    if (!drag) return null;
    return normalizeDragRange({
      anchorMin: drag.anchorMin,
      currentMin: drag.currentMin,
      dayKey: drag.dayKey,
      nowKey: liveNow.dateKey,
      nowMin: liveNow.minutes,
      slotMinutes: instrument.slotMinutes,
      maxSessionMinutes: maxBookingMinutes,
      minNoticeMinutes: relaxedMinNotice ? 0 : instrument.minNoticeMinutes,
      occupied: getOccupiedRanges(drag.dayKey, occupiedBlocks),
    });
  }, [drag, liveNow, instrument.slotMinutes, maxBookingMinutes, instrument.minNoticeMinutes, relaxedMinNotice, occupiedBlocks]);

  const dragBookable = useMemo(() => {
    if (!dragPreview || !drag) return false;
    const dayIndex = days.findIndex((d) => d.key === drag.dayKey);
    return isDragRangeBookable({
      dayKey: drag.dayKey,
      start: dragPreview.start,
      duration: dragPreview.duration,
      dayIndex,
      advanceBookingDays: instrument.advanceBookingDays,
      bookings: occupiedBlocks,
    });
  }, [dragPreview, drag, days, instrument.advanceBookingDays, occupiedBlocks]);

  const finishDrag = useCallback(
    (dayKey: string, anchorMin: number, currentMin: number) => {
      const normalized = normalizeDragRange({
        anchorMin,
        currentMin,
        dayKey,
        nowKey: liveNow.dateKey,
        nowMin: liveNow.minutes,
        slotMinutes: instrument.slotMinutes,
        maxSessionMinutes: maxBookingMinutes,
        minNoticeMinutes: relaxedMinNotice ? 0 : instrument.minNoticeMinutes,
        occupied: getOccupiedRanges(dayKey, occupiedBlocks),
      });
      if (!normalized) {
        setMessage({ tone: "error", text: "That time is not available to book." });
        return;
      }
      const dayIndex = days.findIndex((d) => d.key === dayKey);
      const bookable = isDragRangeBookable({
        dayKey,
        start: normalized.start,
        duration: normalized.duration,
        dayIndex,
        advanceBookingDays: instrument.advanceBookingDays,
        bookings: occupiedBlocks,
      });
      if (!bookable) {
        const busy = !isRangeFree(dayKey, normalized.start, normalized.start + normalized.duration, occupiedBlocks);
        setMessage({
          tone: "error",
          text: busy
            ? "That range overlaps an existing booking. Try another slot."
            : "That time is outside the booking window.",
        });
        return;
      }
      applySelection(dayKey, normalized.start, normalized.duration);
    },
    [liveNow, instrument, days, occupiedBlocks, applySelection],
  );

  const showNowLine = weekNav.isCurrentWeek && days.some((d) => d.key === liveNow.dateKey);

  const onColumnPointerDown = (dayKey: string, e: React.PointerEvent<HTMLDivElement>) => {
    if (!canBook || instrument.maintenance || dayKey < liveNow.dateKey) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const min = minutesFromColumnEvent(e.clientY, e.currentTarget.getBoundingClientRect().top, HOUR_PX);
    setDrag({ dayKey, anchorMin: min, currentMin: min });
    setMessage(null);
  };

  const onColumnPointerMove = (dayKey: string, e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.dayKey !== dayKey) return;
    const min = minutesFromColumnEvent(e.clientY, e.currentTarget.getBoundingClientRect().top, HOUR_PX);
    setDrag((prev) => (prev ? { ...prev, currentMin: min } : null));
  };

  const onColumnPointerUp = (dayKey: string, e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.dayKey !== dayKey) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    finishDrag(drag.dayKey, drag.anchorMin, drag.currentMin);
    setDrag(null);
  };

  const onColumnPointerCancel = () => {
    setDrag(null);
  };

  const selected = slotOptions.find((o) => o.value === startMin) ?? null;

  const durationOptions = useMemo(() => {
    const opts: number[] = [];
    for (let d = instrument.slotMinutes; d <= maxBookingMinutes; d += instrument.slotMinutes) {
      opts.push(d);
    }
    return opts;
  }, [instrument.slotMinutes, maxBookingMinutes]);

  function submit(kind: "book" | "waitlist") {
    if (startMin === null) return;
    const fd = new FormData();
    fd.set("instrumentId", instrument.id);
    fd.set("date", date);
    fd.set(
      "startTime",
      `${String(Math.floor(startMin / 60)).padStart(2, "0")}:${String(startMin % 60).padStart(2, "0")}`,
    );
    fd.set("durationMinutes", String(duration));
    fd.set("notes", notes);
    if (instrument.bookingAdminMode && isAdmin && targetUserId) fd.set("targetUserId", targetUserId);

    startTransition(async () => {
      setMessage(null);
      if (kind === "book") {
        const res = await createBookingAction(undefined, fd);
        if (res?.error) setMessage({ tone: "error", text: res.error });
        else if (res?.success) {
          setMessage({ tone: "success", text: res.success });
          setNotes("");
          router.refresh();
        }
      } else {
        await joinWaitlistAction(fd);
        setMessage({ tone: "success", text: "Added to the waitlist. We'll email you if this slot opens." });
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {/* Week navigation — attached to the calendar */}
        <div className="flex items-center gap-1 border-b border-slate-100 px-2 py-2 sm:px-3">
          <Link
            href={weekNav.prevHref}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
            aria-label="Previous week"
            title="Previous week"
          >
            ←
          </Link>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-semibold text-slate-800">{weekNav.weekLabel}</p>
            {!weekNav.isCurrentWeek && (
              <Link
                href={weekNav.todayHref}
                className="text-xs font-medium text-brand-700 hover:underline"
              >
                Jump to current week
              </Link>
            )}
            {weekNav.isCurrentWeek && (
              <p className="text-xs text-slate-500">
                Now{" "}
                <span className="font-semibold tabular-nums text-red-600">
                  {formatMinuteLabel(liveNow.minutes)}
                </span>
              </p>
            )}
          </div>
          <Link
            href={weekNav.nextHref}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
            aria-label="Next week"
            title="Next week"
          >
            →
          </Link>
        </div>

        <div
          className="grid border-b border-slate-100 text-center text-xs font-medium text-slate-500"
          style={{ gridTemplateColumns: `${TIME_COL} repeat(7, 1fr)` }}
        >
          <div />
          {days.map((d) => (
            <div key={d.key} className={d.key === nowKey ? "py-2 text-brand-700" : "py-2"}>
              <div>{d.label}</div>
              <div className="text-sm font-bold text-slate-800">{d.dayNum}</div>
            </div>
          ))}
        </div>
        <div ref={scrollRef} className="relative max-h-[460px] overflow-y-auto">
          <div
            className="grid"
            style={{ gridTemplateColumns: `${TIME_COL} repeat(7, 1fr)`, height: 24 * HOUR_PX }}
          >
            <div className="relative">
              {Array.from({ length: 24 }, (_, h) => (
                <div
                  key={h}
                  className="absolute right-1.5 -translate-y-1/2 whitespace-nowrap text-[10px] leading-none text-slate-400"
                  style={{ top: h * HOUR_PX }}
                >
                  {fmtHourGutter(h)}
                </div>
              ))}
            </div>
            {days.map((d) => {
              const dragActive = drag?.dayKey === d.key;
              const showSelection =
                selection?.dayKey === d.key && !dragActive && startMin !== null;
              const showDragPreview = dragActive && dragPreview;
              const canDragDay = canBook && !instrument.maintenance && d.key >= liveNow.dateKey;

              return (
              <div key={d.key} className="relative border-l border-slate-100">
                {Array.from({ length: 24 }, (_, h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-slate-50"
                    style={{ top: h * HOUR_PX, height: HOUR_PX }}
                  />
                ))}
                {drag &&
                  SUBGRID_LINES.map((min) => (
                    <div
                      key={min}
                      className={`pointer-events-none absolute left-0 right-0 border-t ${
                        min % 60 === 0 ? "border-slate-50" : "border-dashed border-slate-100"
                      }`}
                      style={{ top: (min / 60) * HOUR_PX }}
                    />
                  ))}
                {showNowLine && d.key === liveNow.dateKey && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-30 border-t-2 border-red-500"
                    style={{ top: (liveNow.minutes / 60) * HOUR_PX }}
                  />
                )}
                {showSelection && (
                  <div
                    className="pointer-events-none absolute left-0.5 right-0.5 z-[30] rounded-md border-2 border-brand-400 bg-brand-100/40"
                    style={{
                      top: (selection.startMin / 60) * HOUR_PX,
                      height: Math.max(8, ((selection.endMin - selection.startMin) / 60) * HOUR_PX),
                    }}
                  />
                )}
                {showDragPreview && (
                  <div
                    className={`pointer-events-none absolute left-0.5 right-0.5 z-[30] rounded-md border-2 ${
                      dragBookable
                        ? "border-brand-500 bg-brand-200/50"
                        : "border-amber-500 bg-amber-100/50"
                    }`}
                    style={{
                      top: (dragPreview.start / 60) * HOUR_PX,
                      height: Math.max(8, (dragPreview.duration / 60) * HOUR_PX),
                    }}
                  />
                )}
                {bookings
                  .filter((b) => b.startKey <= d.key && b.endKey >= d.key)
                  .map((b) => {
                    const isStartDay = b.startKey === d.key;
                    const isEndDay = b.endKey === d.key;
                    const segStart = isStartDay ? b.startMin : 0;
                    const segEnd = isEndDay ? b.endMin : 1440;
                    const top = (segStart / 60) * HOUR_PX;
                    const height = Math.max(16, ((segEnd - segStart) / 60) * HOUR_PX);
                    const tone = b.noShow
                      ? "bg-red-100 border-red-300 text-red-900"
                      : b.mine
                        ? "bg-emerald-100 border-emerald-300 text-emerald-900"
                        : "bg-slate-200 border-slate-300 text-slate-600";
                    const tooltip = [
                      b.rangeLabel,
                      props.showBookerNames && b.ownerLabel && !b.mine ? b.ownerLabel : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    const timeLabel = isStartDay
                      ? b.rangeLabel
                      : isEndDay
                        ? `Until ${b.endLabel}`
                        : b.rangeLabel;
                    return (
                      <div
                        key={`${b.id}-${d.key}`}
                        className={`pointer-events-none absolute left-0.5 right-0.5 z-20 overflow-hidden rounded-md border px-1 py-0.5 text-[10px] leading-snug ${tone}`}
                        style={{ top, height }}
                        title={tooltip}
                      >
                        {isStartDay && (
                          <div className="font-semibold">
                            {b.mine ? "Your booking" : "Booked"}
                            {b.noShow && " · no-show"}
                          </div>
                        )}
                        {!isStartDay && (
                          <div className="font-semibold opacity-90">↳ continued</div>
                        )}
                        {height >= 14 && (
                          <div className="whitespace-normal break-words opacity-90">{timeLabel}</div>
                        )}
                        {isStartDay && props.showBookerNames && b.ownerLabel && !b.mine && (
                          <div className="whitespace-normal break-words">{b.ownerLabel}</div>
                        )}
                        {isStartDay && b.status === "PENDING" && <div className="italic">pending</div>}
                      </div>
                    );
                  })}
                {memberRequestMode &&
                  myPendingRequests
                    .filter((b) => b.startKey <= d.key && b.endKey >= d.key)
                    .map((b) => {
                      const isStartDay = b.startKey === d.key;
                      const isEndDay = b.endKey === d.key;
                      const segStart = isStartDay ? b.startMin : 0;
                      const segEnd = isEndDay ? b.endMin : 1440;
                      const top = (segStart / 60) * HOUR_PX;
                      const height = Math.max(16, ((segEnd - segStart) / 60) * HOUR_PX);
                      const timeLabel = isStartDay
                        ? b.rangeLabel
                        : isEndDay
                          ? `Until ${b.endLabel}`
                          : b.rangeLabel;
                      return (
                        <div
                          key={`pending-${b.id}-${d.key}`}
                          className="pointer-events-none absolute left-0.5 right-0.5 z-[19] overflow-hidden rounded-md border border-dashed border-slate-400 bg-slate-100/90 px-1 py-0.5 text-[10px] leading-snug text-slate-500"
                          style={{ top, height }}
                          title={`Your request (pending) · ${b.rangeLabel}`}
                        >
                          {isStartDay && (
                            <div className="font-semibold text-slate-600">Your request</div>
                          )}
                          {!isStartDay && (
                            <div className="font-semibold opacity-90">↳ continued</div>
                          )}
                          {height >= 14 && (
                            <div className="whitespace-normal break-words opacity-90">{timeLabel}</div>
                          )}
                          {isStartDay && height >= 22 && (
                            <div className="italic opacity-80">awaiting approval</div>
                          )}
                        </div>
                      );
                    })}
                {canDragDay && (
                  <div
                    className="absolute inset-0 z-[25] cursor-crosshair touch-none"
                    onPointerDown={(e) => onColumnPointerDown(d.key, e)}
                    onPointerMove={(e) => onColumnPointerMove(d.key, e)}
                    onPointerUp={(e) => onColumnPointerUp(d.key, e)}
                    onPointerCancel={onColumnPointerCancel}
                  />
                )}
              </div>
            );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border border-emerald-300 bg-emerald-100" /> Your booking
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border border-slate-300 bg-slate-200" /> Booked
          </span>
          {memberRequestMode && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded border border-dashed border-slate-400 bg-slate-100" />{" "}
              Your pending request
            </span>
          )}
          {canBook && !instrument.maintenance && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded border-2 border-brand-400 bg-brand-100/40" /> Drag to select (15 min)
            </span>
          )}
          {showNowLine && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-3 bg-red-500" /> Now
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          {instrument.bookingAdminMode
            ? isAdmin
              ? "Book for user"
              : memberRequestMode
                ? "Request time"
                : "See calendar"
            : "Book a session"}
        </h2>

        {limitMinutes !== null && canBook && !instrument.bookingAdminMode && (
          <p className="mb-3 text-xs text-slate-500">
            Standard hours used this week: <strong>{fmtDuration(usedStandardMinutes)}</strong> of{" "}
            {fmtDuration(limitMinutes)}. After-hours is unlimited.
          </p>
        )}

        {!canBook ? (
          <Alert tone="info">
            {instrument.bookingAdminMode
              ? "View availability on the calendar. Contact an administrator to schedule time on this instrument."
              : "Booking is unavailable for you on this instrument right now."}
          </Alert>
        ) : (
          <div className="space-y-3">
            {message && <Alert tone={message.tone}>{message.text}</Alert>}
            {instrument.bookingAdminMode && isAdmin && (
              <div>
                <Label htmlFor="b-user">User</Label>
                <Select
                  id="b-user"
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  required
                >
                  {bookableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div>
              <Label htmlFor="b-date">Day</Label>
              <div className="flex items-center gap-2">
                <Select
                  id="b-date"
                  className="min-w-0 flex-1"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                >
                  {days.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.label} {d.dayNum}
                    </option>
                  ))}
                </Select>
                {!weekNav.isCurrentWeek ? (
                  <Link
                    href={weekNav.todayHref}
                    className="shrink-0 text-xs font-medium text-brand-700 hover:underline"
                  >
                    Today
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={date === nowKey}
                    onClick={() => setDate(nowKey)}
                    className="shrink-0 text-xs font-medium text-brand-700 hover:underline disabled:cursor-default disabled:text-slate-400 disabled:no-underline"
                  >
                    Today
                  </button>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="b-duration">Duration</Label>
              <Select
                id="b-duration"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {durationOptions.map((d) => (
                  <option key={d} value={d}>
                    {fmtDuration(d)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="b-start">Start time</Label>
              {slotOptions.length === 0 ? (
                <p className="text-sm text-slate-500">No slots available for this day and duration.</p>
              ) : (
                <Select
                  id="b-start"
                  value={startMin ?? ""}
                  onChange={(e) => setStartMin(Number(e.target.value))}
                >
                  {slotOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <div>
              <Label htmlFor="b-notes">Notes (optional)</Label>
              <Textarea
                id="b-notes"
                rows={2}
                placeholder="Sample type, experiment…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {!withinAdvance && (
              <Alert tone="warning">This day is beyond the booking window.</Alert>
            )}

            {selected?.busy && !instrument.bookingAdminMode ? (
              <div className="space-y-2">
                <Badge tone="amber">This slot is taken</Badge>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={isPending || startMin === null}
                  onClick={() => submit("waitlist")}
                >
                  Join waitlist for this slot
                </Button>
              </div>
            ) : selected?.busy && memberRequestMode ? (
              <Alert tone="warning">
                This time overlaps a confirmed booking or one of your pending requests. Cancel pending requests
                in My bookings before submitting a new one.
              </Alert>
            ) : selected?.busy && instrument.bookingAdminMode && isAdmin ? (
              <Alert tone="warning">This slot is already booked.</Alert>
            ) : (
              <Button
                className="w-full"
                disabled={
                  isPending ||
                  startMin === null ||
                  !withinAdvance ||
                  (memberRequestMode && !!selected?.busy) ||
                  (instrument.bookingAdminMode && isAdmin && !targetUserId)
                }
                onClick={() => submit("book")}
              >
                {isPending
                  ? "Working…"
                  : memberRequestMode
                    ? "Submit request"
                    : instrument.bookingAdminMode
                      ? "Create booking"
                      : "Book session"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
