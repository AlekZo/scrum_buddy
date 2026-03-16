import { Entry } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, ListTodo, AlertTriangle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { parseTasks } from "@/lib/task-parser";
import { usePresentationMode } from "@/lib/presentation-mode";
import { stripAllHours } from "@/lib/text-sanitizer";

interface YesterdayPanelProps {
  entry: Entry | null;
  date: string;
}

export function YesterdayPanel({ entry, date }: YesterdayPanelProps) {
  const { presentationMode } = usePresentationMode();
  const displayDate = new Date(date).toLocaleDateString("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const tasks = entry ? [...parseTasks(entry.done, "done"), ...parseTasks(entry.doing, "doing")] : [];
  const totalHours = tasks.reduce((sum, t) => sum + t.hours, 0);

  return (
    <Card className="border-border/50 bg-muted/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <span className="text-muted-foreground">Yesterday · {displayDate}</span>
          {!presentationMode && totalHours > 0 && (
            <Badge variant="secondary" className="font-mono text-[10px]">
              {totalHours.toFixed(1)}h
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {!entry ? (
          <p className="text-xs text-muted-foreground text-center py-3">No entry for this date</p>
        ) : (
          <>
            {entry.done && (
              <div>
                <div className="flex items-center gap-1 text-xs font-medium text-success mb-1">
                  <CheckCircle2 className="w-3 h-3" /> Done
                </div>
                <p className="text-xs font-mono text-foreground/70 whitespace-pre-wrap leading-relaxed">{presentationMode ? stripAllHours(entry.done) : entry.done}</p>
              </div>
            )}
            {entry.doing && (
              <div>
                <div className="flex items-center gap-1 text-xs font-medium text-primary mb-1">
                  <ListTodo className="w-3 h-3" /> Planned
                </div>
                <p className="text-xs font-mono text-foreground/70 whitespace-pre-wrap leading-relaxed">{presentationMode ? stripAllHours(entry.doing) : entry.doing}</p>
              </div>
            )}
            {entry.blockers && (
              <div>
                <div className="flex items-center gap-1 text-xs font-medium text-warning mb-1">
                  <AlertTriangle className="w-3 h-3" /> Blockers
                </div>
                <p className="text-xs font-mono text-foreground/70 whitespace-pre-wrap leading-relaxed">{presentationMode ? stripAllHours(entry.blockers) : entry.blockers}</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
