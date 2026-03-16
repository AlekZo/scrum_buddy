import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Entry } from "@/lib/types";
import { parseTasks } from "@/lib/task-parser";
import { Promise as PromiseItem } from "@/lib/promise-types";
import { usePresentationMode } from "@/lib/presentation-mode";
import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Users,
  Clock,
  HandHeart,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface CalendarLogViewProps {
  entries: Entry[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  getPromisesForDate?: (date: string) => PromiseItem[];
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function fmt(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isWeekend(dayOfWeek: number): boolean {
  return dayOfWeek === 0 || dayOfWeek === 6;
}

interface DayCellData {
  date: string;
  day: number;
  entry: Entry | null;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isWeekend: boolean;
  taskCount: number;
  totalHours: number;
  actualHours: number;
  teamHours: number;
  hasBlockers: boolean;
  hasDone: boolean;
  isPast: boolean;
  promiseCount: number;
}

export function CalendarLogView({ entries, selectedDate, onSelectDate, getPromisesForDate }: CalendarLogViewProps) {
  const { t } = useI18n();
  const { presentationMode } = usePresentationMode();
  const today = new Date();
  const todayStr = fmt(today.getFullYear(), today.getMonth(), today.getDate());

  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date(selectedDate);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const entryMap = useMemo(() => {
    const map = new Map<string, Entry>();
    entries.forEach((e) => map.set(e.date, e));
    return map;
  }, [entries]);

  const cells = useMemo(() => {
    const { year, month } = viewMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const grid: DayCellData[] = [];

    const prevMonthLast = new Date(year, month, 0);
    for (let i = startDow - 1; i >= 0; i--) {
      const d = prevMonthLast.getDate() - i;
      const date = fmt(prevMonthLast.getFullYear(), prevMonthLast.getMonth(), d);
      grid.push(buildCellData(date, d, entryMap.get(date) || null, false, todayStr, selectedDate, getPromisesForDate));
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = fmt(year, month, d);
      grid.push(buildCellData(date, d, entryMap.get(date) || null, true, todayStr, selectedDate, getPromisesForDate));
    }

    const remaining = 7 - (grid.length % 7);
    if (remaining < 7) {
      const nextMonth = new Date(year, month + 1, 1);
      for (let d = 1; d <= remaining; d++) {
        const date = fmt(nextMonth.getFullYear(), nextMonth.getMonth(), d);
        grid.push(buildCellData(date, d, entryMap.get(date) || null, false, todayStr, selectedDate, getPromisesForDate));
      }
    }

    return grid;
  }, [viewMonth, entryMap, todayStr, selectedDate, getPromisesForDate]);

  const monthLabel = new Date(viewMonth.year, viewMonth.month).toLocaleDateString("en", {
    month: "long",
    year: "numeric",
  });

  const navigateMonth = (delta: number) => {
    setViewMonth((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const monthStats = useMemo(() => {
    const monthCells = cells.filter((c) => c.isCurrentMonth);
    const logged = monthCells.filter((c) => c.entry && c.hasDone).length;
    const workdays = monthCells.filter((c) => !c.isWeekend).length;
    const totalHours = monthCells.reduce((s, c) => s + c.totalHours, 0);
    const totalActual = monthCells.reduce((s, c) => s + c.actualHours, 0);
    const totalTeam = monthCells.reduce((s, c) => s + c.teamHours, 0);
    const blockerDays = monthCells.filter((c) => c.hasBlockers).length;
    return { logged, workdays, totalHours, totalActual, totalTeam, blockerDays };
  }, [cells]);

  return (
    <div className="rounded-xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium uppercase tracking-wider">{t("calendar.title")}</span>
          </div>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg hover:bg-muted" onClick={() => navigateMonth(-1)}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="text-sm font-semibold min-w-[130px] text-center text-foreground">{monthLabel}</span>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg hover:bg-muted" onClick={() => navigateMonth(1)}>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted/50 rounded-md px-2 py-0.5">
            {monthStats.logged}/{monthStats.workdays} days
          </span>
          {!presentationMode && (
            <>
              {monthStats.totalActual !== monthStats.totalTeam ? (
                <>
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted/50 rounded-md px-2 py-0.5">
                    <Clock className="w-2.5 h-2.5" /> {monthStats.totalActual.toFixed(1)}h
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted/50 rounded-md px-2 py-0.5">
                    <Users className="w-2.5 h-2.5" /> {monthStats.totalTeam.toFixed(1)}h
                  </span>
                </>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted/50 rounded-md px-2 py-0.5">
                  <Clock className="w-2.5 h-2.5" /> {monthStats.totalHours.toFixed(1)}h
                </span>
              )}
            </>
          )}
          {monthStats.blockerDays > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-destructive bg-destructive/10 rounded-md px-2 py-0.5">
              <AlertTriangle className="w-2.5 h-2.5" /> {monthStats.blockerDays} blocker{monthStats.blockerDays > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="px-3 pb-3">
        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_LABELS.map((d, i) => (
            <div
              key={d}
              className={`text-[10px] font-semibold text-center py-1.5 uppercase tracking-wider
                ${i >= 5 ? "text-muted-foreground/50" : "text-muted-foreground/70"}`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-[3px]">
          {cells.map((cell) => (
            <DayCell key={cell.date} cell={cell} onSelect={onSelectDate} getPromisesForDate={getPromisesForDate} />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="px-4 py-2.5 border-t border-border/30 flex items-center gap-4 flex-wrap">
        <LegendItem>
          <div className="w-2 h-2 rounded-full bg-primary/50 ring-1 ring-primary/30" />
          <span>{t("calendar.logged")}</span>
        </LegendItem>
        <LegendItem>
          <div className="w-2 h-2 rounded-sm border border-dashed border-destructive/50" />
          <span>{t("calendar.missing")}</span>
        </LegendItem>
        <LegendItem>
          <div className="w-2 h-2 rounded-full bg-destructive/60" />
          <span>{t("calendar.blocker")}</span>
        </LegendItem>
        <LegendItem>
          <div className="w-2 h-2 rounded-full bg-primary/40" />
          <span>{t("calendar.promise")}</span>
        </LegendItem>
      </div>
    </div>
  );
}

function LegendItem({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground/60">{children}</div>;
}

function buildCellData(
  date: string,
  day: number,
  entry: Entry | null,
  isCurrentMonth: boolean,
  todayStr: string,
  selectedDate: string,
  getPromisesForDate?: (date: string) => PromiseItem[]
): DayCellData {
  const jsDate = new Date(date);
  const dow = jsDate.getDay();
  const hasDone = !!(entry?.done?.trim() || entry?.doing?.trim());
  const actualHours = entry?.actualHours ?? entry?.hours ?? 0;
  const teamHours = entry?.teamHours ?? entry?.hours ?? 0;
  const taskCount = (entry?.doneTaskCount ?? 0) + (entry?.doingTaskCount ?? 0);
  const promiseCount = getPromisesForDate ? getPromisesForDate(date).length : 0;

  return {
    date, day, entry, isCurrentMonth,
    isToday: date === todayStr,
    isSelected: date === selectedDate,
    isWeekend: isWeekend(dow),
    taskCount, totalHours: entry?.hours || 0,
    actualHours, teamHours,
    hasBlockers: !!(entry?.blockers?.trim()),
    hasDone, isPast: date < todayStr, promiseCount,
  };
}

function DayCell({ cell, onSelect, getPromisesForDate }: { cell: DayCellData; onSelect: (d: string) => void; getPromisesForDate?: (date: string) => PromiseItem[] }) {
  const { presentationMode } = usePresentationMode();
  const {
    date, day, entry, isCurrentMonth, isToday, isSelected,
    isWeekend: weekend, totalHours, actualHours, teamHours, hasBlockers, hasDone, isPast, promiseCount,
  } = cell;

  const isMissing = isCurrentMonth && !weekend && isPast && !hasDone;
  const isLogged = hasDone;
  const hasDualHours = actualHours !== teamHours && actualHours > 0 && teamHours > 0;

  const cellContent = (
    <button
      onClick={() => onSelect(date)}
      className={`
        relative w-full aspect-square rounded-lg text-xs transition-all duration-200 ease-out
        flex flex-col items-center justify-center gap-0.5 group
        ${!isCurrentMonth ? "opacity-25" : ""}
        ${isSelected
          ? "ring-2 ring-primary bg-primary/15 shadow-sm shadow-primary/20"
          : isToday
            ? "ring-1.5 ring-primary/60 bg-primary/8"
            : isLogged
              ? "bg-primary/6 hover:bg-primary/12 ring-1 ring-primary/15 hover:ring-primary/30"
              : isMissing
                ? "border border-dashed border-destructive/30 bg-destructive/4 hover:bg-destructive/8 hover:border-destructive/50"
                : weekend
                  ? "bg-muted/20 hover:bg-muted/40 text-muted-foreground/60"
                  : "hover:bg-muted/40"
        }
      `}
    >
      {/* Day number */}
      <span className={`text-[11px] leading-none font-mono
        ${isSelected ? "text-primary font-bold" : isToday ? "text-primary font-bold" : "font-medium"}
      `}>
        {day}
      </span>

      {/* Hours badge */}
      {!presentationMode && (hasDualHours ? (
        <span className="text-[7px] leading-none font-mono rounded bg-muted/40 px-0.5 flex items-center gap-px">
          <span className="text-primary">{actualHours % 1 === 0 ? actualHours : actualHours.toFixed(1)}</span>
          <span className="text-muted-foreground/40">│</span>
          <span className="text-foreground/60">{teamHours % 1 === 0 ? teamHours : teamHours.toFixed(1)}</span>
        </span>
      ) : totalHours > 0 ? (
        <span className={`text-[7px] leading-none font-mono px-1 rounded
          ${totalHours >= 8 ? "text-primary/80 bg-primary/8" : "text-muted-foreground/70 bg-muted/30"}
        `}>
          {totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}h
        </span>
      ) : null)}

      {/* Status indicators */}
      {hasBlockers && (
        <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-destructive/70 shadow-sm shadow-destructive/30" />
      )}

      {isLogged && !hasBlockers && (
        <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary/50" />
      )}

      {/* Promise dots */}
      {promiseCount > 0 && (
        <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-[2px]">
          {Array.from({ length: Math.min(promiseCount, 3) }).map((_, i) => (
            <div key={i} className="w-[3px] h-[3px] rounded-full bg-primary/40" />
          ))}
        </div>
      )}

      {/* Missing label */}
      {isMissing && (
        <span className="text-[5px] font-bold text-destructive/50 uppercase tracking-widest leading-none">
          miss
        </span>
      )}
    </button>
  );

  if (!entry || !hasDone) {
    if (promiseCount > 0 && getPromisesForDate) {
      return (
        <HoverCard openDelay={250} closeDelay={100}>
          <HoverCardTrigger asChild>{cellContent}</HoverCardTrigger>
          <HoverCardContent className="w-56 p-3 rounded-xl border-border/40 shadow-xl" side="left" align="start" sideOffset={8}>
            <PromisePeek promises={getPromisesForDate(date)} date={date} />
          </HoverCardContent>
        </HoverCard>
      );
    }
    return cellContent;
  }

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>{cellContent}</HoverCardTrigger>
      <HoverCardContent className="w-64 p-3.5 rounded-xl border-border/40 shadow-xl" side="left" align="start" sideOffset={8}>
        <DayPeek cell={cell} promises={getPromisesForDate ? getPromisesForDate(date) : []} />
      </HoverCardContent>
    </HoverCard>
  );
}

function PromisePeek({ promises, date }: { promises: PromiseItem[]; date: string }) {
  const dateLabel = new Date(date).toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" });
  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold text-foreground">{dateLabel}</span>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <HandHeart className="w-3 h-3 text-primary/60" />
        <span className="text-[10px] font-medium">Promises ({promises.length})</span>
      </div>
      <ul className="space-y-1">
        {promises.map((p) => (
          <li key={p.id} className="text-[11px] text-foreground/70 truncate pl-3.5 relative before:content-['·'] before:absolute before:left-1 before:text-muted-foreground">
            {p.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DayPeek({ cell, promises }: { cell: DayCellData; promises: PromiseItem[] }) {
  const { presentationMode } = usePresentationMode();
  const { date, entry, totalHours, actualHours, teamHours, hasBlockers } = cell;
  if (!entry) return null;

  const dateLabel = new Date(date).toLocaleDateString("en", {
    weekday: "long", month: "short", day: "numeric",
  });

  const doneTasks = parseTasks(entry.done, "done");
  const doingTasks = parseTasks(entry.doing, "doing");
  const hasDual = actualHours !== teamHours && actualHours > 0;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{dateLabel}</span>
        {!presentationMode && (
          <div className="flex items-center gap-1">
            {hasDual ? (
              <>
                <span className="inline-flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">
                  <Clock className="w-2.5 h-2.5" /> {actualHours.toFixed(1)}h
                </span>
                <span className="inline-flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">
                  <Users className="w-2.5 h-2.5" /> {teamHours.toFixed(1)}h
                </span>
              </>
            ) : (
              <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">{totalHours}h</span>
            )}
          </div>
        )}
      </div>

      {doneTasks.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 className="w-3 h-3 text-primary/70" />
            <span className="text-[10px] font-semibold text-primary/80">Done ({doneTasks.length})</span>
          </div>
          <ul className="space-y-0.5">
            {doneTasks.slice(0, 4).map((t, i) => (
              <li key={i} className="text-[11px] text-foreground/60 font-mono truncate pl-4 relative before:content-['·'] before:absolute before:left-1.5 before:text-muted-foreground">
                {t.text} {!presentationMode && t.teamHours > 0 && <span className="text-muted-foreground/50">({t.teamHours}h)</span>}
              </li>
            ))}
            {doneTasks.length > 4 && (
              <li className="text-[10px] text-muted-foreground/50 pl-4 italic">+{doneTasks.length - 4} more</li>
            )}
          </ul>
        </div>
      )}

      {doingTasks.length > 0 && (
        <div>
          <span className="text-[10px] font-semibold text-foreground/60">In Progress ({doingTasks.length})</span>
          <ul className="space-y-0.5 mt-0.5">
            {doingTasks.slice(0, 3).map((t, i) => (
              <li key={i} className="text-[11px] text-foreground/50 font-mono truncate pl-4 relative before:content-['·'] before:absolute before:left-1.5 before:text-muted-foreground">
                {t.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {promises.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <HandHeart className="w-3 h-3 text-primary/50" />
            <span className="text-[10px] font-medium text-muted-foreground">Promises ({promises.length})</span>
          </div>
          <ul className="space-y-0.5">
            {promises.map((p) => (
              <li key={p.id} className="text-[11px] text-foreground/60 truncate pl-4 relative before:content-['·'] before:absolute before:left-1.5 before:text-muted-foreground">
                {p.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasBlockers && (
        <div className="flex items-center gap-1.5 text-destructive/80 bg-destructive/5 rounded-md px-2 py-1">
          <AlertTriangle className="w-3 h-3" />
          <span className="text-[10px] font-medium">Has blockers</span>
        </div>
      )}

      {entry.version && (
        <span className="inline-block text-[9px] font-mono text-muted-foreground/50 bg-muted/30 rounded px-1.5 py-0.5">{entry.version}</span>
      )}
    </div>
  );
}
