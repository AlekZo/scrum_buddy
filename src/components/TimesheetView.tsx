import { useState, useMemo } from "react";
import { Entry } from "@/lib/types";
import { parseTasks } from "@/lib/task-parser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { BarChart3, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

interface TimesheetViewProps {
  entries: Entry[];
  project: string;
  onSave: (project: string, entry: Entry) => void;
}

const DAILY_TARGET = 8;

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

export function TimesheetView({ entries, project, onSave }: TimesheetViewProps) {
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editDone, setEditDone] = useState("");
  const [editDoing, setEditDoing] = useState("");

  const rows = useMemo(() => {
    return entries.slice(0, 14).map((entry) => {
      const doneTasks = parseTasks(entry.done, "done");
      const totalHours = doneTasks.reduce((sum, t) => sum + t.hours, 0);
      return { entry, doneTasks, totalHours };
    });
  }, [entries]);

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

  const grandTotal = rows.reduce((sum, r) => sum + r.totalHours, 0);
  const grandTarget = rows.length * DAILY_TARGET;
  const grandUtil = grandTarget > 0 ? (grandTotal / grandTarget) * 100 : 0;

  const startEdit = (entry: Entry) => {
    setEditingDate(entry.date);
    setEditDone(entry.done);
    setEditDoing(entry.doing);
  };

  const saveEdit = (entry: Entry) => {
    const doneTasks = parseTasks(editDone, "done");
    const totalHours = doneTasks.reduce((s, t) => s + t.hours, 0);
    onSave(project, { ...entry, done: editDone, doing: editDoing, hours: totalHours });
    setEditingDate(null);
    toast.success(`Updated ${entry.date}`);
  };

  const fmtDay = (date: string) => {
    const d = new Date(date);
    return {
      weekday: d.toLocaleDateString("en", { weekday: "short" }),
      display: d.toLocaleDateString("en", { month: "short", day: "numeric" }),
    };
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

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {/* Summary row */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Timesheet · {project}
            </CardTitle>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{rows.length} days</span>
              <span>Target: <span className="font-mono font-semibold text-foreground">{DAILY_TARGET}h/day</span></span>
              <span>Logged: <span className={`font-mono font-semibold ${utilColor(grandTotal / (rows.length || 1))}`}>{grandTotal.toFixed(1)}h</span></span>
              <span>Utilization: <span className={`font-mono font-semibold ${utilColor(grandTotal / (rows.length || 1))}`}>{grandUtil.toFixed(0)}%</span></span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Hours are calculated from <span className="font-semibold text-foreground">"What I did"</span> only. "What I'm doing next" counts toward the next day.
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
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider">What I Did</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Doing Next</TableHead>
                    <TableHead className="w-20 text-[11px] font-semibold uppercase tracking-wider text-right">Logged</TableHead>
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
                            </div>
                          </TableCell>
                          <TableCell className="align-top py-2 text-right">
                            <Badge variant="secondary" className="font-mono text-[10px]">
                              {editHours.toFixed(1)}h
                            </Badge>
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

                    return (
                      <TableRow
                        key={row.entry.date}
                        className="group cursor-pointer border-border/50 hover:bg-muted/30"
                        onClick={() => startEdit(row.entry)}
                      >
                        <TableCell className="py-2 font-mono text-xs">
                          <span className="font-semibold">{weekday}</span>{" "}
                          <span className="text-muted-foreground">{display}</span>
                        </TableCell>
                        <TableCell className="py-2">
                          <TruncatedCell text={row.entry.done} />
                        </TableCell>
                        <TableCell className="py-2">
                          <TruncatedCell text={row.entry.doing} maxWidth="200px" />
                        </TableCell>
                        <TableCell className="py-2 text-right">
                          <span className={`font-mono text-sm font-semibold ${utilColor(row.totalHours)}`}>
                            {row.totalHours > 0 ? `${row.totalHours.toFixed(1)}h` : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="py-2 text-right font-mono text-xs text-muted-foreground">
                          {DAILY_TARGET}h
                        </TableCell>
                        <TableCell className="py-2 text-right">
                          <span className={`inline-flex items-center justify-center w-12 rounded-sm px-1 py-0.5 text-[10px] font-mono font-semibold ${utilBg(row.totalHours)} ${utilColor(row.totalHours)}`}>
                            {util.toFixed(0)}%
                          </span>
                        </TableCell>
                        <TableCell className="py-2">
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </TableCell>
                      </TableRow>
                    );
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
                        <span>{t.name}</span>
                        {t.tags.length > 0 && (
                          <span className="ml-2 inline-flex gap-1">
                            {t.tags.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-[9px] px-1 py-0 font-normal">
                                {tag}
                              </Badge>
                            ))}
                          </span>
                        )}
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
