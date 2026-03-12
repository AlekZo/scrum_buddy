import { useMemo } from "react";
import { Entry } from "@/lib/types";
import { PlanData, getPlannedTasksForRange } from "@/lib/plan-types";
import { parseTasks } from "@/lib/task-parser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Vault } from "lucide-react";

interface BufferBankWidgetProps {
  planData: PlanData;
  project: string;
  /** Date range start (YYYY-MM-DD) */
  from: string;
  /** Date range end (YYYY-MM-DD) */
  to: string;
  /** Log entries to extract realized hours from */
  entries?: Entry[];
}

export function BufferBankWidget({ planData, project, from, to, entries = [] }: BufferBankWidgetProps) {
  const stats = useMemo(() => {
    // Planned buffer (forecast)
    const plannedTasks = getPlannedTasksForRange(planData, project, from, to);
    const plannedTeam = plannedTasks.reduce((s, t) => s + t.teamHours, 0);
    const plannedActual = plannedTasks.reduce((s, t) => s + t.actualHours, 0);
    const plannedBuffer = plannedTeam - plannedActual;
    const plannedTracked = plannedTasks.filter(t => t.teamHours > 0 && t.actualHours > 0).length;

    // Logged buffer (realized) - from daily log entries with dual-time syntax
    let loggedTeam = 0;
    let loggedActual = 0;
    let loggedTracked = 0;
    for (const entry of entries) {
      if (entry.date < from || entry.date > to) continue;
      const tasks = parseTasks(entry.done, "done");
      for (const t of tasks) {
        if (t.actualHours !== t.teamHours) {
          // Has dual hours
          loggedTeam += t.teamHours;
          loggedActual += t.actualHours;
          loggedTracked++;
        }
      }
    }
    const loggedBuffer = loggedTeam - loggedActual;

    // Combined: use logged when available, planned as supplement
    const totalTeam = loggedTeam + plannedTeam;
    const totalActual = loggedActual + plannedActual;
    const totalBuffer = totalTeam - totalActual;
    const totalTracked = loggedTracked + plannedTracked;

    return {
      plannedTeam, plannedActual, plannedBuffer, plannedTracked,
      loggedTeam, loggedActual, loggedBuffer, loggedTracked,
      totalTeam, totalActual, totalBuffer, totalTracked,
    };
  }, [planData, project, from, to, entries]);

  if (stats.totalTracked === 0) return null;

  const bufferColor = stats.totalBuffer > 0
    ? "text-success"
    : stats.totalBuffer < 0
    ? "text-destructive"
    : "text-muted-foreground";

  const bufferBg = stats.totalBuffer > 0
    ? "bg-success/10"
    : stats.totalBuffer < 0
    ? "bg-destructive/10"
    : "bg-muted/30";

  const BufferIcon = stats.totalBuffer > 0 ? TrendingUp : stats.totalBuffer < 0 ? TrendingDown : Minus;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Vault className="w-4 h-4 text-primary" />
          Buffer Bank
          <div className="flex gap-1">
            {stats.loggedTracked > 0 && (
              <Badge variant="secondary" className="text-[9px] font-normal">
                {stats.loggedTracked} logged
              </Badge>
            )}
            {stats.plannedTracked > 0 && (
              <Badge variant="outline" className="text-[9px] font-normal">
                {stats.plannedTracked} planned
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2 rounded-md bg-muted/30">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Communicated</p>
            <p className="text-lg font-mono font-bold text-foreground">{stats.totalTeam.toFixed(1)}h</p>
          </div>
          <div className="text-center p-2 rounded-md bg-muted/30">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Actual</p>
            <p className="text-lg font-mono font-bold text-foreground">{stats.totalActual.toFixed(1)}h</p>
          </div>
          <div className={`text-center p-2 rounded-md ${bufferBg}`}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Buffer</p>
            <div className={`flex items-center justify-center gap-1 ${bufferColor}`}>
              <BufferIcon className="w-4 h-4" />
              <p className="text-lg font-mono font-bold">
                {stats.totalBuffer > 0 ? "+" : ""}{stats.totalBuffer.toFixed(1)}h
              </p>
            </div>
          </div>
        </div>
        {stats.totalTracked > 0 && stats.totalTeam > 0 && (
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Efficiency: <span className="font-mono font-semibold text-foreground">
              {((stats.totalActual / stats.totalTeam) * 100).toFixed(0)}%
            </span> of communicated time actually needed
            {stats.totalBuffer > 0 && (
              <span className="text-success"> — {stats.totalBuffer.toFixed(1)}h available for other work</span>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
