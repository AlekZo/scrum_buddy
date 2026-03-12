import { PlanTask, PlanData, getPlannedTasksForDate } from "@/lib/plan-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, ArrowRight, Calendar } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PlannedPanelProps {
  planData: PlanData;
  project: string;
  date: string;
  onPushToDone: (text: string) => void;
  onPushToDoing: (text: string) => void;
}

export function PlannedPanel({ planData, project, date, onPushToDone, onPushToDoing }: PlannedPanelProps) {
  const plannedTasks = getPlannedTasksForDate(planData, project, date);

  if (plannedTasks.length === 0) return null;

  const totalHours = plannedTasks.reduce((sum, t) => sum + t.hours, 0);

  const pushAllTo = (target: "done" | "doing") => {
    const text = plannedTasks.map((t) => `• ${t.text}${t.hours > 0 ? ` - ${t.hours}h` : ""}`).join("\n");
    if (target === "done") onPushToDone(text);
    else onPushToDoing(text);
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-primary">
            <CalendarCheck className="w-4 h-4" />
            Planned for this day
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {totalHours > 0 && (
              <Badge variant="secondary" className="font-mono text-[10px]">
                {totalHours.toFixed(1)}h planned
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] gap-1"
              onClick={() => pushAllTo("doing")}
            >
              <ArrowRight className="w-3 h-3" />
              Use plan
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 text-muted-foreground">
                  More ▾
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => pushAllTo("done")}>
                  Copy to "What I Did"
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => pushAllTo("doing")}>
                  Copy to "What I'm Doing Next"
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1 pb-3">
        {plannedTasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center gap-1.5 text-xs text-foreground/70 font-mono"
          >
            <span className="text-primary/60">•</span>
            <span className="flex-1">{task.text}</span>
            {task.hours > 0 && (
              <span className="text-muted-foreground">{task.hours}h</span>
            )}
            {task.startDate !== task.endDate && (
              <Calendar className="w-3 h-3 text-primary/40" />
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
