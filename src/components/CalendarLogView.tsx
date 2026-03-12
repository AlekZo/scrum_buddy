import { useMemo, useState } from "react";
import { Entry } from "@/lib/types";
import { parseTasks } from "@/lib/task-parser";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface CalendarLogViewProps {
  entries: Entry[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAILY_TARGET = 8;

function fmt(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isWeekend(dayOfWeek: number): boolean {
  return dayOfWeek === 0 || dayOfWeek === 6; // Sun=0, Sat=6
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
  hasBlockers: boolean;
  hasDone: boolean;
  isPast: boolean;
}

export function CalendarLogView({ entries, selectedDate, onSelectDate }: CalendarLogViewProps) {
  const today = new Date();
  const todayStr = fmt(today.getFullYear(), today.getMonth(), today.getDate());

  // Month navigation state, default to selectedDate's month
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date(selectedDate);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // Build entry lookup
  const entryMap = useMemo(() => {
    const map = new Map<string, Entry>();
    entries.forEach((e) => map.set(e.date, e));
    return map;
  }, [entries]);

  // Build grid cells
  const cells = useMemo(() => {
    const { year, month } = viewMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Monday-based: 0=Mon, 6=Sun
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const grid: DayCellData[] = [];

    // Fill leading days from prev month
    const prevMonthLast = new Date(year, month, 0);
    for (let i = startDow - 1; i >= 0; i--) {
      const d = prevMonthLast.getDate() - i;
      const date = fmt(prevMonthLast.getFullYear(), prevMonthLast.getMonth(), d);
      const entry = entryMap.get(date);
      grid.push(buildCellData(date, d, entry, false, todayStr, selectedDate));
    }

    // Current month days
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = fmt(year, month, d);
      const entry = entryMap.get(date);
      grid.push(buildCellData(date, d, entry, true, todayStr, selectedDate));
    }

    // Fill trailing days to complete last week
    const remaining = 7 - (grid.length % 7);
    if (remaining < 7) {
      const nextMonth = new Date(year, month + 1, 1);
      for (let d = 1; d <= remaining; d++) {
        const date = fmt(nextMonth.getFullYear(), nextMonth.getMonth(), d);
        const entry = entryMap.get(date);
        grid.push(buildCellData(date, d, entry, false, todayStr, selectedDate));
      }
    }

    return grid;
  }, [viewMonth, entryMap, todayStr, selectedDate]);

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

  // Stats for the month
  const monthStats = useMemo(() => {
    const monthCells = cells.filter((c) => c.isCurrentMonth);
    const logged = monthCells.filter((c) => c.entry && c.hasDone).length;
    const workdays = monthCells.filter((c) => !c.isWeekend).length;
    const totalHours = monthCells.reduce((s, c) => s + c.totalHours, 0);
    const blockerDays = monthCells.filter((c) => c.hasBlockers).length;
    return { logged, workdays, totalHours, blockerDays };
  }, [cells]);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="w-4 h-4" />
            Calendar
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
        {/* Month stats */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge variant="secondary" className="text-[10px]">
            {monthStats.logged}/{monthStats.workdays} days
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            {monthStats.totalHours.toFixed(1)}h total
          </Badge>
          {monthStats.blockerDays > 0 && (
            <Badge variant="destructive" className="text-[10px]">
              {monthStats.blockerDays} blocker day{monthStats.blockerDays > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {DAY_LABELS.map((d) => (
            <div key={d} className="text-[10px] font-medium text-muted-foreground text-center py-0.5">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((cell) => (
            <DayCell key={cell.date} cell={cell} onSelect={onSelectDate} />
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-3 pt-2 border-t border-border/30">
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm bg-primary/20 ring-1 ring-primary/40" />
            <span className="text-[9px] text-muted-foreground">Logged</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm border border-dashed border-muted-foreground/40" />
            <span className="text-[9px] text-muted-foreground">Missing</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-destructive/60" />
            <span className="text-[9px] text-muted-foreground">Blocker</span>
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
  selectedDate: string
): DayCellData {
  const jsDate = new Date(date);
  const dow = jsDate.getDay();
  const hasDone = !!(entry?.done?.trim() || entry?.doing?.trim());
  const tasks = entry
    ? [...parseTasks(entry.done, "done"), ...parseTasks(entry.doing, "doing")]
    : [];

  return {
    date,
    day,
    entry,
    isCurrentMonth,
    isToday: date === todayStr,
    isSelected: date === selectedDate,
    isWeekend: isWeekend(dow),
    taskCount: tasks.length,
    totalHours: entry?.hours || 0,
    hasBlockers: !!(entry?.blockers?.trim()),
    hasDone,
    isPast: date < todayStr,
  };
}

function DayCell({ cell, onSelect }: { cell: DayCellData; onSelect: (d: string) => void }) {
  const {
    date, day, entry, isCurrentMonth, isToday, isSelected,
    isWeekend: weekend, taskCount, totalHours, hasBlockers, hasDone, isPast,
  } = cell;

  // Determine visual state
  const isMissing = isCurrentMonth && !weekend && isPast && !hasDone;
  const isLogged = hasDone;

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
                ? "border border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/50"
                : weekend
                  ? "bg-muted/30 hover:bg-muted/50 text-muted-foreground"
                  : "hover:bg-muted/50"
        }
      `}
    >
      {/* Day number */}
      <span className={`text-[11px] leading-none ${isToday ? "text-primary font-bold" : ""}`}>
        {day}
      </span>

      {/* Hours badge */}
      {totalHours > 0 && (
        <span
          className={`text-[8px] leading-none font-mono px-1 py-0 rounded-sm
            ${totalHours >= DAILY_TARGET
              ? "text-primary bg-primary/10"
              : "text-muted-foreground bg-muted/50"
            }
          `}
        >
          {totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}h
        </span>
      )}

      {/* Blocker dot */}
      {hasBlockers && (
        <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-destructive/70" />
      )}

      {/* Logged indicator dot */}
      {isLogged && !hasBlockers && (
        <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-success/60" />
      )}

      {/* Missing state plus icon */}
      {isMissing && (
        <Plus className="w-2.5 h-2.5 text-muted-foreground/40 absolute bottom-0.5 right-0.5" />
      )}
    </button>
  );

  // Only show hover card for entries with data
  if (!entry || !hasDone) return cellContent;

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>{cellContent}</HoverCardTrigger>
      <HoverCardContent
        className="w-64 p-3"
        side="left"
        align="start"
        sideOffset={8}
      >
        <DayPeek cell={cell} />
      </HoverCardContent>
    </HoverCard>
  );
}

function DayPeek({ cell }: { cell: DayCellData }) {
  const { date, entry, taskCount, totalHours, hasBlockers } = cell;
  if (!entry) return null;

  const dateLabel = new Date(date).toLocaleDateString("en", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const doneTasks = parseTasks(entry.done, "done");
  const doingTasks = parseTasks(entry.doing, "doing");

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">{dateLabel}</span>
        <Badge variant="secondary" className="text-[10px]">{totalHours}h</Badge>
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
