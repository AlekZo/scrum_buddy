import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Shared types ───────────────────────────────────────

interface TaskOccurrence {
  date: string;
  text: string;
  childText: string;
  actualHours: number;
  teamHours: number;
  source: "done" | "doing";
}

interface TaskGroup {
  id: string;
  name: string;
  method: string;
  occurrences: TaskOccurrence[];
  subGroups?: TaskGroup[];
  totalActual: number;
  totalTeam: number;
  lastSeen: string;
}

// ── Timeline View ──────────────────────────────────────
// Swim-lane grid: tasks as rows × dates as columns
// Shows WHEN you worked on WHAT with intensity dots

interface TimelineViewProps {
  taskGroups: TaskGroup[];
  allOccurrences: TaskOccurrence[];
  showActual: boolean;
  showTeam: boolean;
  formatDate: (d: string) => string;
}

const COLS_PER_PAGE = 14;

// Color palette for task groups — cycles through these
const GROUP_COLORS = [
  "hsl(var(--primary))",
  "hsl(221 83% 53%)",    // blue
  "hsl(142 71% 45%)",    // green
  "hsl(38 92% 50%)",     // amber
  "hsl(0 84% 60%)",      // red
  "hsl(262 83% 58%)",    // purple
  "hsl(172 66% 50%)",    // teal
  "hsl(25 95% 53%)",     // orange
];

export function TimelineView({
  taskGroups,
  allOccurrences,
  showActual,
  showTeam,
  formatDate,
}: TimelineViewProps) {
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState<"name" | "hours" | "recent">("recent");

  // Get all unique dates, sorted chronologically
  const allDates = useMemo(() => {
    const dates = new Set<string>();
    for (const occ of allOccurrences) dates.add(occ.date);
    return [...dates].sort();
  }, [allOccurrences]);

  // Paginate dates
  const totalPages = Math.max(1, Math.ceil(allDates.length / COLS_PER_PAGE));
  // Default to last page (most recent)
  const effectivePage = page === 0 ? totalPages - 1 : Math.min(page - 1, totalPages - 1);
  const visibleDates = allDates.slice(
    effectivePage * COLS_PER_PAGE,
    (effectivePage + 1) * COLS_PER_PAGE
  );

  // Build a lookup: groupName → { date → { actual, team } }
  const groupDateMap = useMemo(() => {
    const map = new Map<string, Map<string, { actual: number; team: number }>>();
    for (const g of taskGroups) {
      const dateMap = new Map<string, { actual: number; team: number }>();
      for (const occ of g.occurrences) {
        const existing = dateMap.get(occ.date) || { actual: 0, team: 0 };
        existing.actual += occ.actualHours;
        existing.team += occ.teamHours;
        dateMap.set(occ.date, existing);
      }
      map.set(g.id, dateMap);
    }
    return map;
  }, [taskGroups]);

  // Find max hours for scaling
  const maxHours = useMemo(() => {
    let max = 0;
    for (const [, dateMap] of groupDateMap) {
      for (const [, h] of dateMap) {
        const val = showActual ? h.actual : h.team;
        if (val > max) max = val;
      }
    }
    return max || 1;
  }, [groupDateMap, showActual]);

  // Sort groups
  const sortedGroups = useMemo(() => {
    const groups = taskGroups.filter((g) => g.occurrences.length > 0);
    switch (sortBy) {
      case "name":
        return [...groups].sort((a, b) => a.name.localeCompare(b.name));
      case "hours":
        return [...groups].sort((a, b) => b.totalActual - a.totalActual);
      case "recent":
      default:
        return [...groups].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
    }
  }, [taskGroups, sortBy]);

  if (allDates.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No tasks to display in timeline
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Controls */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Sort:</span>
        {(["recent", "hours", "name"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={sortBy === s ? "default" : "outline"}
            className="h-6 text-[10px] px-2"
            onClick={() => setSortBy(s)}
          >
            {s === "recent" ? "Recent" : s === "hours" ? "Hours" : "Name"}
          </Button>
        ))}
        <div className="flex-1" />
        {/* Pagination */}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            disabled={effectivePage === 0}
            onClick={() => setPage(effectivePage)}
          >
            <ChevronLeft className="w-3 h-3" />
          </Button>
          <span className="text-muted-foreground font-mono text-[10px] min-w-[60px] text-center">
            {effectivePage + 1} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            disabled={effectivePage === totalPages - 1}
            onClick={() => setPage(effectivePage + 2)}
          >
            <ChevronRight className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Timeline grid */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            {/* Date header */}
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground sticky left-0 bg-card z-10 min-w-[160px] max-w-[200px]">
                  Task
                </th>
                {visibleDates.map((date) => {
                  const d = new Date(date + "T00:00:00");
                  const dayName = d.toLocaleDateString(undefined, { weekday: "narrow" });
                  const dayNum = d.getDate();
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <th
                      key={date}
                      className={cn(
                        "text-center py-2 px-1 font-normal min-w-[44px]",
                        isWeekend ? "text-muted-foreground/50 bg-muted/20" : "text-muted-foreground"
                      )}
                    >
                      <div className="text-[9px] leading-none">{dayName}</div>
                      <div className="font-mono text-[10px] leading-tight">{dayNum}</div>
                    </th>
                  );
                })}
                <th className="text-right py-2 px-3 font-medium text-muted-foreground min-w-[60px]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedGroups.map((group, gi) => {
                const dateMap = groupDateMap.get(group.id);
                const color = GROUP_COLORS[gi % GROUP_COLORS.length];
                const visibleTotal = visibleDates.reduce((s, d) => {
                  const h = dateMap?.get(d);
                  return s + (h ? (showActual ? h.actual : h.team) : 0);
                }, 0);

                return (
                  <tr
                    key={group.id}
                    className="border-b border-border/20 hover:bg-muted/10 transition-colors"
                  >
                    {/* Task name */}
                    <td className="py-1.5 px-3 sticky left-0 bg-card z-10">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="truncate font-medium text-foreground/90 max-w-[150px]">
                          {group.name}
                        </span>
                      </div>
                    </td>

                    {/* Date cells */}
                    {visibleDates.map((date) => {
                      const h = dateMap?.get(date);
                      const isWeekend =
                        new Date(date + "T00:00:00").getDay() === 0 ||
                        new Date(date + "T00:00:00").getDay() === 6;

                      if (!h) {
                        return (
                          <td
                            key={date}
                            className={cn(
                              "text-center py-1.5 px-1",
                              isWeekend && "bg-muted/20"
                            )}
                          />
                        );
                      }

                      const val = showActual ? h.actual : h.team;
                      const intensity = Math.min(1, val / maxHours);
                      const size = 8 + intensity * 16; // 8px to 24px

                      return (
                        <td
                          key={date}
                          className={cn(
                            "text-center py-1.5 px-1",
                            isWeekend && "bg-muted/20"
                          )}
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center justify-center">
                                <div
                                  className="rounded-full transition-all"
                                  style={{
                                    width: `${size}px`,
                                    height: `${size}px`,
                                    backgroundColor: color,
                                    opacity: 0.2 + intensity * 0.8,
                                  }}
                                />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              <div className="font-medium">{group.name}</div>
                              <div className="text-muted-foreground">
                                {formatDate(date)}
                              </div>
                              {showActual && <div>Actual: {h.actual.toFixed(1)}h</div>}
                              {showTeam && <div>Team: {h.team.toFixed(1)}h</div>}
                            </TooltipContent>
                          </Tooltip>
                        </td>
                      );
                    })}

                    {/* Row total */}
                    <td className="text-right py-1.5 px-3 font-mono text-muted-foreground">
                      {visibleTotal > 0 ? `${visibleTotal.toFixed(1)}h` : "–"}
                    </td>
                  </tr>
                );
              })}

              {/* Column totals */}
              <tr className="border-t border-border/50 bg-muted/10">
                <td className="py-2 px-3 font-medium text-muted-foreground sticky left-0 bg-muted/10 z-10">
                  Daily total
                </td>
                {visibleDates.map((date) => {
                  const dayTotal = sortedGroups.reduce((s, g) => {
                    const h = groupDateMap.get(g.id)?.get(date);
                    return s + (h ? (showActual ? h.actual : h.team) : 0);
                  }, 0);
                  return (
                    <td key={date} className="text-center py-2 px-1 font-mono text-[10px] text-muted-foreground">
                      {dayTotal > 0 ? `${dayTotal.toFixed(1)}` : ""}
                    </td>
                  );
                })}
                <td className="text-right py-2 px-3 font-mono font-medium text-foreground">
                  {(() => {
                    const total = visibleDates.reduce((s, date) =>
                      s + sortedGroups.reduce((s2, g) => {
                        const h = groupDateMap.get(g.id)?.get(date);
                        return s2 + (h ? (showActual ? h.actual : h.team) : 0);
                      }, 0), 0);
                    return total > 0 ? `${total.toFixed(1)}h` : "–";
                  })()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground px-1">
        <span>Bubble size = hours intensity</span>
        <span>·</span>
        <span>{sortedGroups.length} tasks across {allDates.length} days</span>
      </div>
    </div>
  );
}

// ── Activity View ──────────────────────────────────────
// Daily activity cards with proportional time-distribution bars
// Shows WHAT you did on SPECIFIC DATES

interface ActivityViewProps {
  taskGroups: TaskGroup[];
  allOccurrences: TaskOccurrence[];
  showActual: boolean;
  showTeam: boolean;
  formatDate: (d: string) => string;
}

interface DayActivity {
  date: string;
  tasks: { groupName: string; groupColor: string; actual: number; team: number; items: string[] }[];
  totalActual: number;
  totalTeam: number;
}

export function ActivityView({
  taskGroups,
  allOccurrences,
  showActual,
  showTeam,
  formatDate,
}: ActivityViewProps) {
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  // Build group color map
  const groupColorMap = useMemo(() => {
    const map = new Map<string, string>();
    taskGroups.forEach((g, i) => {
      map.set(g.name, GROUP_COLORS[i % GROUP_COLORS.length]);
    });
    return map;
  }, [taskGroups]);

  // Build group lookup: occ key → group name
  const occGroupMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of taskGroups) {
      for (const occ of g.occurrences) {
        map.set(`${occ.date}::${occ.text}`, g.name);
      }
    }
    return map;
  }, [taskGroups]);

  // Aggregate per day
  const dayActivities: DayActivity[] = useMemo(() => {
    const byDate = new Map<
      string,
      Map<string, { actual: number; team: number; items: string[] }>
    >();

    for (const occ of allOccurrences) {
      if (!byDate.has(occ.date)) byDate.set(occ.date, new Map());
      const dayMap = byDate.get(occ.date)!;
      const groupName = occGroupMap.get(`${occ.date}::${occ.text}`) || occ.text;

      const existing = dayMap.get(groupName) || { actual: 0, team: 0, items: [] };
      existing.actual += occ.actualHours;
      existing.team += occ.teamHours;
      existing.items.push(occ.text);
      dayMap.set(groupName, existing);
    }

    return [...byDate.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, groupMap]) => {
        const tasks = [...groupMap.entries()]
          .map(([groupName, data]) => ({
            groupName,
            groupColor: groupColorMap.get(groupName) || "hsl(var(--muted-foreground))",
            ...data,
          }))
          .sort((a, b) => (showActual ? b.actual - a.actual : b.team - a.team));

        return {
          date,
          tasks,
          totalActual: tasks.reduce((s, t) => s + t.actual, 0),
          totalTeam: tasks.reduce((s, t) => s + t.team, 0),
        };
      });
  }, [allOccurrences, occGroupMap, groupColorMap, showActual]);

  const toggleDay = (date: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  if (dayActivities.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No activity to display
      </div>
    );
  }

  // Find max daily hours for consistent bar scaling
  const maxDaily = Math.max(
    ...dayActivities.map((d) => (showActual ? d.totalActual : d.totalTeam)),
    1
  );

  return (
    <div className="space-y-2">
      {dayActivities.map((day) => {
        const isExpanded = expandedDays.has(day.date);
        const d = new Date(day.date + "T00:00:00");
        const dayName = d.toLocaleDateString(undefined, { weekday: "long" });
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        const totalH = showActual ? day.totalActual : day.totalTeam;
        const barWidth = (totalH / maxDaily) * 100;

        return (
          <Card
            key={day.date}
            className={cn("overflow-hidden", isWeekend && "opacity-75")}
          >
            {/* Day header */}
            <button
              className="w-full text-left px-4 py-3 hover:bg-muted/20 transition-colors"
              onClick={() => toggleDay(day.date)}
            >
              <div className="flex items-center gap-3 mb-2">
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0 rotate-180" />
                )}
                <span className="text-sm font-medium">
                  {dayName}
                  <span className="ml-2 text-xs text-muted-foreground font-mono">
                    {formatDate(day.date)}
                  </span>
                </span>
                <div className="flex items-center gap-2 ml-auto shrink-0">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                    {day.tasks.length} task{day.tasks.length !== 1 ? "s" : ""}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                    {[
                      showActual && `${day.totalActual.toFixed(1)}h`,
                      showTeam && `${day.totalTeam.toFixed(1)}h`,
                    ]
                      .filter(Boolean)
                      .join(" / ")}
                  </Badge>
                </div>
              </div>

              {/* Proportional bar visualization */}
              <div className="flex items-center gap-2">
                <div
                  className="h-5 flex rounded-md overflow-hidden transition-all"
                  style={{ width: `${barWidth}%`, minWidth: "20px" }}
                >
                  {day.tasks.map((task, i) => {
                    const taskH = showActual ? task.actual : task.team;
                    const pct = totalH > 0 ? (taskH / totalH) * 100 : 0;
                    if (pct < 1) return null;
                    return (
                      <Tooltip key={`${day.date}-${task.groupName}-${i}`}>
                        <TooltipTrigger asChild>
                          <div
                            className="h-full transition-all hover:brightness-110"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: task.groupColor,
                              minWidth: "3px",
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          <div className="font-medium">{task.groupName}</div>
                          {showActual && <div>Actual: {task.actual.toFixed(1)}h</div>}
                          {showTeam && <div>Team: {task.team.toFixed(1)}h</div>}
                          <div className="text-muted-foreground">
                            {task.items.length} item{task.items.length !== 1 ? "s" : ""}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
                <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                  {totalH.toFixed(1)}h
                </span>
              </div>
            </button>

            {/* Expanded: task breakdown */}
            {isExpanded && (
              <div className="border-t border-border/50">
                {day.tasks.map((task, i) => (
                  <div
                    key={`${day.date}-${task.groupName}-${i}`}
                    className={cn(
                      "px-4 py-2 text-xs",
                      i > 0 && "border-t border-border/20"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: task.groupColor }}
                      />
                      <span className="font-medium text-foreground/90 flex-1 truncate">
                        {task.groupName}
                      </span>
                      {showActual && (
                        <span className="font-mono text-muted-foreground shrink-0">
                          {task.actual.toFixed(1)}h actual
                        </span>
                      )}
                      {showActual && showTeam && (
                        <span className="text-muted-foreground/50">·</span>
                      )}
                      {showTeam && (
                        <span className="font-mono text-muted-foreground shrink-0">
                          {task.team.toFixed(1)}h team
                        </span>
                      )}
                    </div>
                    {/* Individual items */}
                    <div className="pl-5 space-y-0.5">
                      {task.items.map((item, j) => (
                        <div
                          key={j}
                          className="text-[11px] text-muted-foreground font-mono truncate"
                        >
                          • {item}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
