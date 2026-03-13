import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Entry } from "@/lib/types";
import { parseTasks } from "@/lib/task-parser";
import { Promise as PromiseItem } from "@/lib/promise-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Plus,
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
const DAILY_TARGET = 8;

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
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="w-4 h-4" />
            {t("calendar.title")}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => navigateMonth(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs font-medium min-w-[120px] text-center">{monthLabel}</span>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => navigateMonth(1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge variant="secondary" className="text-[10px]">
            {monthStats.logged}/{monthStats.workdays} days
          </Badge>
          {monthStats.totalActual !== monthStats.totalTeam ? (
            <>
              <Badge variant="secondary" className="text-[10px] gap-0.5">
                <Clock className="w-2.5 h-2.5" /> {monthStats.totalActual.toFixed(1)}h
              </Badge>
              <Badge variant="secondary" className="text-[10px] gap-0.5">
                <Users className="w-2.5 h-2.5" /> {monthStats.totalTeam.toFixed(1)}h
              </Badge>
            </>
          ) : (
            <Badge variant="secondary" className="text-[10px]">
              {monthStats.totalHours.toFixed(1)}h {t("calendar.total")}
            </Badge>
          )}
          {monthStats.blockerDays > 0 && (
            <Badge variant="destructive" className="text-[10px]">
              {monthStats.blockerDays} blocker day{monthStats.blockerDays > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {DAY_LABELS.map((d) => (
            <div key={d} className="text-[10px] font-medium text-muted-foreground text-center py-0.5">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((cell) => (
            <DayCell key={cell.date} cell={cell} onSelect={onSelectDate} getPromisesForDate={getPromisesForDate} />
          ))}
        </div>

        <div className="flex items-center gap-3 mt-3 pt-2 border-t border-border/30 flex-wrap">
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm bg-primary/20 ring-1 ring-primary/40" />
            <span className="text-[9px] text-muted-foreground">{t("calendar.logged")}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm border border-dashed border-muted-foreground/40" />
            <span className="text-[9px] text-muted-foreground">{t("calendar.missing")}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-destructive/60" />
            <span className="text-[9px] text-muted-foreground">{t("calendar.blocker")}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-accent-foreground/40" />
            <span className="text-[9px] text-muted-foreground">{t("calendar.promise")}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
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

  // Use cached metadata from Entry when available (avoids re-parsing on every render)
  const actualHours = entry?.actualHours ?? entry?.hours ?? 0;
  const teamHours = entry?.teamHours ?? entry?.hours ?? 0;
  const taskCount = (entry?.doneTaskCount ?? 0) + (entry?.doingTaskCount ?? 0);
  const promiseCount = getPromisesForDate ? getPromisesForDate(date).length : 0;

  return {
    date,
    day,
    entry,
    isCurrentMonth,
    isToday: date === todayStr,
    isSelected: date === selectedDate,
    isWeekend: isWeekend(dow),
    taskCount,
    totalHours: entry?.hours || 0,
    actualHours,
    teamHours,
    hasBlockers: !!(entry?.blockers?.trim()),
    hasDone,
    isPast: date < todayStr,
    promiseCount,
  };
}

function DayCell({ cell, onSelect, getPromisesForDate }: { cell: DayCellData; onSelect: (d: string) => void; getPromisesForDate?: (date: string) => PromiseItem[] }) {
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
        relative w-full aspect-square rounded-md text-xs transition-all duration-150
        flex flex-col items-center justify-center gap-0.5
        ${!isCurrentMonth ? "opacity-30" : ""}
        ${isSelected
          ? "ring-2 ring-primary bg-primary/10 font-bold"
          : isToday
            ? "ring-1 ring-primary/50 bg-primary/5 font-semibold"
            : isLogged
              ? "bg-primary/8 ring-1 ring-primary/20 hover:bg-primary/15"
              : isMissing
                ? "border border-dashed border-destructive/40 bg-destructive/5 hover:border-destructive/60 hover:bg-destructive/10"
                : weekend
                  ? "bg-muted/30 hover:bg-muted/50 text-muted-foreground"
                  : "hover:bg-muted/50"
        }
      `}
    >
      <span className={`text-[11px] leading-none ${isToday ? "text-primary font-bold" : ""}`}>
        {day}
      </span>

      {/* Hours display: split-pill for dual, single badge otherwise */}
      {hasDualHours ? (
        <span className="text-[7px] leading-none font-mono rounded-sm bg-muted/60 px-0.5 flex items-center">
          <span className="text-primary">{actualHours % 1 === 0 ? actualHours : actualHours.toFixed(1)}</span>
          <span className="text-muted-foreground mx-px">|</span>
          <span className="text-accent-foreground">{teamHours % 1 === 0 ? teamHours : teamHours.toFixed(1)}</span>
        </span>
      ) : totalHours > 0 ? (
        <span
          className={`text-[8px] leading-none font-mono px-1 py-0 rounded-sm
            ${totalHours >= 8 ? "text-primary bg-primary/10" : "text-muted-foreground bg-muted/50"}
          `}
        >
          {totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}h
        </span>
      ) : null}

      {hasBlockers && (
        <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-destructive/70" />
      )}

      {isLogged && !hasBlockers && (
        <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-success/60" />
      )}

      {/* Promise dot */}
      {promiseCount > 0 && (
        <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
          {Array.from({ length: Math.min(promiseCount, 3) }).map((_, i) => (
            <div key={i} className="w-1 h-1 rounded-full bg-accent-foreground/50" />
          ))}
        </div>
      )}

      {isMissing && (
        <div className="absolute bottom-0.5 right-0.5 flex items-center gap-px">
          <span className="text-[6px] font-semibold text-destructive/60 uppercase leading-none">miss</span>
        </div>
      )}
    </button>
  );

  if (!entry || !hasDone) {
    // Still show hover for promise-only days
    if (promiseCount > 0 && getPromisesForDate) {
      return (
        <HoverCard openDelay={250} closeDelay={100}>
          <HoverCardTrigger asChild>{cellContent}</HoverCardTrigger>
          <HoverCardContent className="w-56 p-3" side="left" align="start" sideOffset={8}>
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
      <HoverCardContent className="w-64 p-3" side="left" align="start" sideOffset={8}>
        <DayPeek cell={cell} promises={getPromisesForDate ? getPromisesForDate(date) : []} />
      </HoverCardContent>
    </HoverCard>
  );
}

function PromisePeek({ promises, date }: { promises: PromiseItem[]; date: string }) {
  const dateLabel = new Date(date).toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" });
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-semibold">{dateLabel}</span>
      <div className="flex items-center gap-1 text-muted-foreground">
        <HandHeart className="w-3 h-3" />
        <span className="text-[10px] font-medium">Promises ({promises.length})</span>
      </div>
      <ul className="space-y-0.5">
        {promises.map((p) => (
          <li key={p.id} className="text-[11px] text-foreground/70 truncate pl-4">• {p.text}</li>
        ))}
      </ul>
    </div>
  );
}

function DayPeek({ cell, promises }: { cell: DayCellData; promises: PromiseItem[] }) {
  const { date, entry, totalHours, actualHours, teamHours, hasBlockers } = cell;
  if (!entry) return null;

  const dateLabel = new Date(date).toLocaleDateString("en", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const doneTasks = parseTasks(entry.done, "done");
  const doingTasks = parseTasks(entry.doing, "doing");
  const hasDual = actualHours !== teamHours && actualHours > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">{dateLabel}</span>
        <div className="flex items-center gap-1">
          {hasDual ? (
            <>
              <Badge variant="secondary" className="text-[10px] gap-0.5">
                <Clock className="w-2.5 h-2.5" /> {actualHours.toFixed(1)}h
              </Badge>
              <Badge variant="secondary" className="text-[10px] gap-0.5">
                <Users className="w-2.5 h-2.5" /> {teamHours.toFixed(1)}h
              </Badge>
            </>
          ) : (
            <Badge variant="secondary" className="text-[10px]">{totalHours}h</Badge>
          )}
        </div>
      </div>

      {doneTasks.length > 0 && (
        <div>
          <div className="flex items-center gap-1 text-success mb-0.5">
            <CheckCircle2 className="w-3 h-3" />
            <span className="text-[10px] font-medium">Done ({doneTasks.length})</span>
          </div>
          <ul className="space-y-0.5">
            {doneTasks.slice(0, 4).map((t, i) => (
              <li key={i} className="text-[11px] text-foreground/70 font-mono truncate pl-4">
                • {t.text} {t.teamHours > 0 && <span className="text-muted-foreground">({t.teamHours}h)</span>}
              </li>
            ))}
            {doneTasks.length > 4 && (
              <li className="text-[10px] text-muted-foreground pl-4">+{doneTasks.length - 4} more</li>
            )}
          </ul>
        </div>
      )}

      {doingTasks.length > 0 && (
        <div>
          <span className="text-[10px] font-medium text-primary">Doing ({doingTasks.length})</span>
          <ul className="space-y-0.5">
            {doingTasks.slice(0, 3).map((t, i) => (
              <li key={i} className="text-[11px] text-foreground/70 font-mono truncate pl-4">
                • {t.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {promises.length > 0 && (
        <div>
          <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
            <HandHeart className="w-3 h-3" />
            <span className="text-[10px] font-medium">Promises ({promises.length})</span>
          </div>
          <ul className="space-y-0.5">
            {promises.map((p) => (
              <li key={p.id} className="text-[11px] text-foreground/70 truncate pl-4">• {p.text}</li>
            ))}
          </ul>
        </div>
      )}

      {hasBlockers && (
        <div className="flex items-center gap-1 text-destructive">
          <AlertTriangle className="w-3 h-3" />
          <span className="text-[10px] font-medium">Has blockers</span>
        </div>
      )}

      {entry.version && (
        <Badge variant="outline" className="text-[9px] font-mono">{entry.version}</Badge>
      )}
    </div>
  );
}
