import { useState, useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import { Entry, formatDate } from "@/lib/types";
import { PlanData, getPlannedTasksForDate } from "@/lib/plan-types";
import { parseTasks } from "@/lib/task-parser";
import { BufferBankWidget } from "@/components/BufferBankWidget";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BulletTextarea } from "@/components/BulletTextarea";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BarChart3, Pencil, Check, X, Copy, Users, Clock } from "lucide-react";
import { toast } from "sonner";

interface TimesheetViewProps {
  entries: Entry[];
  project: string;
  onSave: (project: string, entry: Entry) => void;
  planData: PlanData;
}

const DAILY_TARGET = 8;

type FilterPreset = "thisWeek" | "lastWeek" | "thisMonth" | "last30" | "all" | "custom";

function TruncatedCell({ text, maxWidth = "250px" }: { text: string; maxWidth?: string }) {
  if (!text) return <span className="text-xs text-muted-foreground italic">—</span>;
  
  const lines = text.split("\n").filter(l => l.trim());
  const preview = lines.slice(0, 2).map(l => l.trim().replace(/^[-•*]\s*/, "")).join(", ");
  const hasMore = lines.length > 2;
  const displayText = hasMore ? `${preview} (+${lines.length - 2})` : preview;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="text-xs font-mono truncate block cursor-default"
          style={{ maxWidth }}
        >
          {displayText}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-sm">
        <div className="space-y-0.5">
          {lines.map((line, i) => (
            <p key={i} className="text-xs">{line.trim().replace(/^[-•*]\s*/, "")}</p>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function TimesheetView({ entries, project, onSave, planData }: TimesheetViewProps) {
  const { t } = useI18n();
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editDone, setEditDone] = useState("");
  const [editDoing, setEditDoing] = useState("");
  const [editBlockers, setEditBlockers] = useState("");
  const [filterPreset, setFilterPreset] = useState<FilterPreset>("last30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Compute filter date range
  const dateRange = useMemo(() => {
    const now = new Date();
    const today = formatDate(now);
    switch (filterPreset) {
      case "thisWeek": {
        const d = new Date(now);
        const day = d.getDay();
        const diff = day === 0 ? 6 : day - 1; // Monday-based
        d.setDate(d.getDate() - diff);
        return { from: formatDate(d), to: today };
      }
      case "lastWeek": {
        const d = new Date(now);
        const day = d.getDay();
        const diff = day === 0 ? 6 : day - 1;
        d.setDate(d.getDate() - diff - 7);
        const from = formatDate(d);
        d.setDate(d.getDate() + 6);
        return { from, to: formatDate(d) };
      }
      case "thisMonth": {
        const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        return { from, to: today };
      }
      case "last30": {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        return { from: formatDate(d), to: today };
      }
      case "custom":
        return { from: customFrom || "2000-01-01", to: customTo || today };
      case "all":
      default:
        return { from: "2000-01-01", to: today };
    }
  }, [filterPreset, customFrom, customTo]);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => e.date >= dateRange.from && e.date <= dateRange.to);
  }, [entries, dateRange]);

  const rows = useMemo(() => {
    return filteredEntries.map((entry) => {
      const doneTasks = parseTasks(entry.done, "done");
      const totalHours = doneTasks.reduce((sum, t) => sum + t.hours, 0);
      const loggedTeamHours = doneTasks.reduce((sum, t) => sum + t.teamHours, 0);
      const loggedActualHours = doneTasks.reduce((sum, t) => sum + t.actualHours, 0);
      const planned = getPlannedTasksForDate(planData, project, entry.date);
      const plannedTeamHours = planned.reduce((sum, t) => sum + t.teamHours, 0);
      const plannedActualHours = planned.reduce((sum, t) => sum + t.actualHours, 0);
      const hasDualLogged = doneTasks.some(t => t.actualHours !== t.teamHours);
      const teamHours = hasDualLogged ? loggedTeamHours : (plannedTeamHours || loggedTeamHours);
      const actualHours = hasDualLogged ? loggedActualHours : (plannedActualHours || loggedActualHours);
      return { entry, doneTasks, totalHours, teamHours, actualHours };
    });
  }, [filteredEntries, planData, project]);

  // Aggregate hours by task name across all visible days
  const taskAggregation = useMemo(() => {
    const map = new Map<string, { hours: number; days: number; tags: string[] }>();
    for (const row of rows) {
      for (const task of row.doneTasks) {
        const key = task.text.toLowerCase();
        const existing = map.get(key) || { hours: 0, days: 0, tags: task.tags };
        existing.hours += task.hours;
        existing.days += 1;
        if (task.tags.length > 0) existing.tags = [...new Set([...existing.tags, ...task.tags])];
        map.set(key, existing);
      }
    }
    // Use original casing from first occurrence
    const result: { name: string; hours: number; days: number; tags: string[] }[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      for (const task of row.doneTasks) {
        const key = task.text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const agg = map.get(key);
        if (agg && agg.hours > 0) {
          result.push({ name: task.text, ...agg });
        }
      }
    }
    return result.sort((a, b) => b.hours - a.hours);
  }, [rows]);

  // Calculate target based on CALENDAR weekdays between earliest and latest entry,
  // not just entries that exist — prevents artificial inflation when days are missed.
  const grandTotal = rows.reduce((sum, r) => sum + r.totalHours, 0);
  const calendarWorkdays = useMemo(() => {
    if (rows.length === 0) return 0;
    const dates = rows.map(r => r.entry.date).sort();
    const start = new Date(dates[0] + "T00:00:00");
    const end = new Date(dates[dates.length - 1] + "T00:00:00");
    let count = 0;
    const d = new Date(start);
    while (d <= end) {
      const day = d.getDay();
      if (day !== 0 && day !== 6) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  }, [rows]);
  const grandTarget = calendarWorkdays * DAILY_TARGET;
  const grandUtil = grandTarget > 0 ? (grandTotal / grandTarget) * 100 : 0;

  const startEdit = (entry: Entry) => {
    setEditingDate(entry.date);
    setEditDone(entry.done);
    setEditDoing(entry.doing);
    setEditBlockers(entry.blockers);
  };

  const saveEdit = (entry: Entry) => {
    const doneTasks = parseTasks(editDone, "done");
    const totalHours = doneTasks.reduce((s, t) => s + t.hours, 0);
    onSave(project, { ...entry, done: editDone, doing: editDoing, blockers: editBlockers, hours: totalHours });
    setEditingDate(null);
    toast.success(`Updated ${entry.date}`);
  };

  const fmtDay = (date: string) => {
    const d = new Date(date + "T00:00:00"); // Force local timezone
    return {
      weekday: d.toLocaleDateString("en", { weekday: "short" }),
      display: d.toLocaleDateString("en", { month: "short", day: "numeric" }),
    };
  };

  const isWeekend = (date: string) => {
    const d = new Date(date + "T00:00:00");
    const day = d.getDay();
    return day === 0 || day === 6;
  };

  const utilColor = (hours: number) => {
    const pct = (hours / DAILY_TARGET) * 100;
    if (pct >= 100) return "text-success";
    if (pct >= 75) return "text-foreground";
    if (pct >= 50) return "text-warning";
    return "text-destructive";
  };

  const utilBg = (hours: number) => {
    const pct = (hours / DAILY_TARGET) * 100;
    if (pct >= 100) return "bg-success/15";
    if (pct >= 75) return "bg-foreground/5";
    if (pct >= 50) return "bg-warning/15";
    return "bg-destructive/10";
  };

  // Compute date range for buffer bank from filtered entries
  const bufferRange = useMemo(() => {
    if (rows.length === 0) return { from: "", to: "" };
    const dates = rows.map(r => r.entry.date).sort();
    return { from: dates[0], to: dates[dates.length - 1] };
  }, [rows]);

  // Grand totals for team/actual
  const grandTeam = rows.reduce((s, r) => s + r.teamHours, 0);
  const grandActual = rows.reduce((s, r) => s + r.actualHours, 0);
  const hasDualTotals = grandTeam !== grandActual && grandActual > 0;

  const presets: { key: FilterPreset; label: string }[] = [
    { key: "thisWeek", label: t("timesheet.thisWeek") },
    { key: "lastWeek", label: t("timesheet.lastWeek") },
    { key: "thisMonth", label: t("timesheet.thisMonth") },
    { key: "last30", label: t("timesheet.last30") },
    { key: "all", label: t("timesheet.all") },
    { key: "custom", label: t("timesheet.custom") },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {/* Buffer Bank */}
        {bufferRange.from && (
          <BufferBankWidget
            planData={planData}
            project={project}
            from={bufferRange.from}
            to={bufferRange.to}
            entries={entries}
          />
        )}

        {/* Filter bar */}
        <Card className="border-border/50">
          <CardContent className="py-3 px-4">
            <div className="flex flex-wrap items-center gap-2">
              {presets.map((p) => (
                <Button
                  key={p.key}
                  size="sm"
                  variant={filterPreset === p.key ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setFilterPreset(p.key)}
                >
                  {p.label}
                </Button>
              ))}
              {filterPreset === "custom" && (
                <div className="flex items-center gap-1.5 ml-2">
                  <Input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="h-7 text-xs w-32"
                  />
                  <span className="text-xs text-muted-foreground">→</span>
                  <Input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-7 text-xs w-32"
                  />
                </div>
              )}
            </div>

            {/* Team vs Actual visual bar */}
            {hasDualTotals && (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {t("timesheet.actual")}: <span className="font-mono font-semibold text-foreground">{grandActual.toFixed(1)}h</span></span>
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {t("timesheet.team")}: <span className="font-mono font-semibold text-foreground">{grandTeam.toFixed(1)}h</span></span>
                </div>
                <div className="w-full h-3 bg-muted rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-primary/70 rounded-l-full transition-all"
                    style={{ width: `${(grandActual / (grandTeam || 1)) * 100}%` }}
                    title={`Actual: ${grandActual.toFixed(1)}h`}
                  />
                  <div
                    className="h-full bg-accent/50 rounded-r-full transition-all"
                    style={{ width: `${Math.max(0, 100 - (grandActual / (grandTeam || 1)) * 100)}%` }}
                    title={`Buffer: ${(grandTeam - grandActual).toFixed(1)}h`}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground text-center">
                  {t("timesheet.teamVsActual")} · Buffer: {(grandTeam - grandActual).toFixed(1)}h ({grandTeam > 0 ? (((grandTeam - grandActual) / grandTeam) * 100).toFixed(0) : 0}%)
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary row */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                Timesheet · {project}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground min-h-[36px] min-w-[44px]"
                onClick={async () => {
                  const lines = rows.map((r) => {
                    const { weekday, display } = fmtDay(r.entry.date);
                    const tasks = r.doneTasks.map((t) => t.text).join(", ");
                    return `${weekday} ${display}: ${r.totalHours.toFixed(1)}h — ${tasks || "No tasks"}`;
                  });
                  const text = [
                    `Timesheet · ${project}`,
                    `${rows.length} entries (${calendarWorkdays} workdays) · ${grandTotal.toFixed(1)}h logged · ${grandUtil.toFixed(0)}% utilization`,
                    "",
                    ...lines,
                  ].join("\n");
                  try {
                    await navigator.clipboard.writeText(text);
                    toast.success("Timesheet copied!");
                  } catch {
                    toast.error("Failed to copy");
                  }
                }}
              >
                <Copy className="w-4 h-4" /> {t("common.copy")}
              </Button>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              <span>{rows.length} {t("timesheet.entries")} ({calendarWorkdays} {t("timesheet.workdays")})</span>
              <span>{t("timesheet.target")}: <span className="font-mono font-semibold text-foreground">{DAILY_TARGET}h/day</span></span>
              <span>{t("timesheet.logged")}: <span className={`font-mono font-semibold ${utilColor(grandTotal / (rows.length || 1))}`}>{grandTotal.toFixed(1)}h</span></span>
              <span>{t("timesheet.utilization")}: <span className={`font-mono font-semibold ${utilColor(grandTotal / (rows.length || 1))}`}>{grandUtil.toFixed(0)}%</span></span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t("timesheet.hoursNote")} <span className="font-semibold text-foreground">"{t("entry.whatIDid")}"</span>
            </p>
          </CardHeader>
        </Card>

        {/* Main timesheet table */}
        <Card className="border-border/50 overflow-hidden">
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No entries yet. Add log entries to see your timesheet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/50">
                     <TableHead className="w-24 text-[11px] font-semibold uppercase tracking-wider">Date</TableHead>
                     <TableHead colSpan={2} className="text-[11px] font-semibold uppercase tracking-wider">
                       <div className="flex items-center gap-3">
                         <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" /> Done</span>
                         <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" /> Doing</span>
                         <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-destructive" /> Blockers</span>
                       </div>
                     </TableHead>
                     <TableHead className="w-20 text-[11px] font-semibold uppercase tracking-wider text-right">Logged</TableHead>
                     <TableHead className="w-16 text-[11px] font-semibold uppercase tracking-wider text-right">Team</TableHead>
                     <TableHead className="w-16 text-[11px] font-semibold uppercase tracking-wider text-right">Actual</TableHead>
                     <TableHead className="w-20 text-[11px] font-semibold uppercase tracking-wider text-right">Target</TableHead>
                     <TableHead className="w-16 text-[11px] font-semibold uppercase tracking-wider text-right">Util%</TableHead>
                     <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const { weekday, display } = fmtDay(row.entry.date);
                    const isEditing = editingDate === row.entry.date;
                    const util = (row.totalHours / DAILY_TARGET) * 100;

                    if (isEditing) {
                      const editHours = parseTasks(editDone, "done").reduce((s, t) => s + t.hours, 0);
                      return (
                        <TableRow key={row.entry.date} className="bg-muted/20 border-border/50">
                          <TableCell className="align-top py-2 font-mono text-xs">
                            <span className="font-semibold">{weekday}</span><br />
                            <span className="text-muted-foreground">{display}</span>
                          </TableCell>
                          <TableCell className="align-top py-2" colSpan={2}>
                            <div className="space-y-2">
                              <div>
                                <label className="text-[10px] font-semibold text-success uppercase tracking-wider">What I Did</label>
                                <BulletTextarea
                                  value={editDone}
                                  onChange={setEditDone}
                                  className="min-h-[60px] text-xs font-mono mt-0.5 bg-background"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-primary uppercase tracking-wider">Doing Next</label>
                                <BulletTextarea
                                  value={editDoing}
                                  onChange={setEditDoing}
                                  className="min-h-[60px] text-xs font-mono mt-0.5 bg-background"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-warning uppercase tracking-wider">Blockers</label>
                                <BulletTextarea
                                  value={editBlockers}
                                  onChange={setEditBlockers}
                                  className="min-h-[40px] text-xs font-mono mt-0.5 bg-background"
                                />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="align-top py-2 text-right">
                            <Badge variant="secondary" className="font-mono text-[10px]">
                              {editHours.toFixed(1)}h
                            </Badge>
                          </TableCell>
                          <TableCell className="align-top py-2 text-right font-mono text-xs text-muted-foreground">
                            {row.teamHours > 0 ? `${row.teamHours.toFixed(1)}h` : "—"}
                          </TableCell>
                          <TableCell className="align-top py-2 text-right font-mono text-xs text-muted-foreground">
                            {row.actualHours > 0 ? `${row.actualHours.toFixed(1)}h` : "—"}
                          </TableCell>
                          <TableCell className="align-top py-2 text-right font-mono text-xs text-muted-foreground">
                            {DAILY_TARGET}h
                          </TableCell>
                          <TableCell className="align-top py-2" />
                          <TableCell className="align-top py-2">
                            <div className="flex flex-col gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => saveEdit(row.entry)}>
                                <Check className="w-3.5 h-3.5 text-success" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingDate(null)}>
                                <X className="w-3.5 h-3.5 text-muted-foreground" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    }

                    const doneLines = row.entry.done ? row.entry.done.split("\n").filter(l => l.trim()).map(l => l.trim().replace(/^[-•*]\s*/, "")) : [];
                    const doingLines = row.entry.doing ? row.entry.doing.split("\n").filter(l => l.trim()).map(l => l.trim().replace(/^[-•*]\s*/, "")) : [];
                    const blockerLines = row.entry.blockers ? row.entry.blockers.split("\n").filter(l => l.trim()).map(l => l.trim().replace(/^[-•*]\s*/, "")) : [];
                    const allLines = [
                      ...doneLines.map(l => ({ text: l, type: "done" as const })),
                      ...doingLines.map(l => ({ text: l, type: "doing" as const })),
                      ...blockerLines.map(l => ({ text: l, type: "blocker" as const })),
                    ];
                    // Show at least 1 row even if empty
                    const displayLines = allLines.length > 0 ? allLines : [{ text: "", type: "done" as const }];

                    return displayLines.map((line, lineIdx) => (
                      <TableRow
                        key={`${row.entry.date}-${lineIdx}`}
                        className={`group cursor-pointer hover:bg-muted/30 ${
                          lineIdx === 0 ? "border-border/50" : "border-none"
                        }`}
                        onClick={() => startEdit(row.entry)}
                      >
                        {/* Date — only on first row, rowSpan */}
                        {lineIdx === 0 && (
                          <TableCell className="py-1.5 font-mono text-xs align-top" rowSpan={displayLines.length}>
                            <span className="font-semibold">{weekday}</span>{" "}
                            <span className="text-muted-foreground">{display}</span>
                          </TableCell>
                        )}
                        {/* Task line with type badge */}
                        <TableCell className="py-1 px-2" colSpan={2}>
                          {line.text ? (
                            <div className="flex items-center gap-1.5">
                              <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                line.type === "done" ? "bg-emerald-500" : line.type === "doing" ? "bg-primary" : "bg-destructive"
                              }`} />
                              <span className="text-xs font-mono truncate">{line.text}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">—</span>
                          )}
                        </TableCell>
                        {/* Metrics — only on first row */}
                        {lineIdx === 0 && (
                          <>
                            <TableCell className="py-1.5 text-right align-top" rowSpan={displayLines.length}>
                              <span className={`font-mono text-sm font-semibold ${utilColor(row.totalHours)}`}>
                                {row.totalHours > 0 ? `${row.totalHours.toFixed(1)}h` : "—"}
                              </span>
                            </TableCell>
                            <TableCell className="py-1.5 text-right font-mono text-xs text-muted-foreground align-top" rowSpan={displayLines.length}>
                              {row.teamHours > 0 ? `${row.teamHours.toFixed(1)}h` : "—"}
                            </TableCell>
                            <TableCell className="py-1.5 text-right font-mono text-xs text-muted-foreground align-top" rowSpan={displayLines.length}>
                              {row.actualHours > 0 ? `${row.actualHours.toFixed(1)}h` : "—"}
                            </TableCell>
                            <TableCell className="py-1.5 text-right font-mono text-xs text-muted-foreground align-top" rowSpan={displayLines.length}>
                              {DAILY_TARGET}h
                            </TableCell>
                            <TableCell className="py-1.5 text-right align-top" rowSpan={displayLines.length}>
                              <span className={`inline-flex items-center justify-center w-12 rounded-sm px-1 py-0.5 text-[10px] font-mono font-semibold ${utilBg(row.totalHours)} ${utilColor(row.totalHours)}`}>
                                {util.toFixed(0)}%
                              </span>
                            </TableCell>
                            <TableCell className="py-1.5 align-top" rowSpan={displayLines.length}>
                              <Pencil className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    ));
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow className="border-border/50 bg-muted/20 hover:bg-muted/20">
                    <TableCell className="py-2 text-xs font-semibold">Total</TableCell>
                    <TableCell className="py-2" />
                    <TableCell className="py-2" />
                    <TableCell className="py-2 text-right font-mono text-sm font-bold">
                      {grandTotal.toFixed(1)}h
                    </TableCell>
                    <TableCell className="py-2 text-right font-mono text-xs font-semibold text-muted-foreground">
                      {rows.reduce((s, r) => s + r.teamHours, 0).toFixed(1)}h
                    </TableCell>
                    <TableCell className="py-2 text-right font-mono text-xs font-semibold text-muted-foreground">
                      {rows.reduce((s, r) => s + r.actualHours, 0).toFixed(1)}h
                    </TableCell>
                    <TableCell className="py-2 text-right font-mono text-xs text-muted-foreground">
                      {grandTarget}h
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      <span className={`inline-flex items-center justify-center w-12 rounded-sm px-1 py-0.5 text-[10px] font-mono font-bold ${utilBg(grandTotal / (rows.length || 1))} ${utilColor(grandTotal / (rows.length || 1))}`}>
                        {grandUtil.toFixed(0)}%
                      </span>
                    </TableCell>
                    <TableCell className="py-2" />
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Task aggregation */}
        {taskAggregation.length > 0 && (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Hours by Task</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Task</TableHead>
                    <TableHead className="w-16 text-[11px] font-semibold uppercase tracking-wider text-right">Days</TableHead>
                    <TableHead className="w-20 text-[11px] font-semibold uppercase tracking-wider text-right">Hours</TableHead>
                    <TableHead className="w-24 text-[11px] font-semibold uppercase tracking-wider text-right">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taskAggregation.map((t) => (
                    <TableRow key={t.name} className="border-border/50">
                      <TableCell className="py-1.5 text-xs font-mono">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="truncate max-w-[200px]">{t.name}</span>
                          {t.tags.length > 0 && t.tags.map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[9px] px-1 py-0 font-normal flex-shrink-0">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5 text-right text-xs text-muted-foreground font-mono">{t.days}</TableCell>
                      <TableCell className="py-1.5 text-right text-xs font-mono font-semibold">{t.hours.toFixed(1)}h</TableCell>
                      <TableCell className="py-1.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${grandTotal > 0 ? (t.hours / grandTotal) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">
                            {grandTotal > 0 ? ((t.hours / grandTotal) * 100).toFixed(0) : 0}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}
