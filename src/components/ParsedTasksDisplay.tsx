import { ParsedTask } from "@/lib/types";
import { MergeSuggestion } from "@/lib/task-parser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle2, ListTodo, GitMerge } from "lucide-react";
import { usePresentationMode } from "@/lib/presentation-mode";

interface ParsedTasksDisplayProps {
  tasks: ParsedTask[];
  mergeSuggestions: MergeSuggestion[];
  onMerge?: (suggestion: MergeSuggestion) => void;
  onDismiss?: (suggestion: MergeSuggestion) => void;
}

export function ParsedTasksDisplay({ tasks, mergeSuggestions, onMerge, onDismiss }: ParsedTasksDisplayProps) {
  const { presentationMode } = usePresentationMode();
  const totalHours = tasks.reduce((sum, t) => sum + t.hours, 0);

  if (tasks.length === 0) return null;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="w-4 h-4" />
            Parsed Tasks
          </span>
          <Badge variant="secondary" className="font-mono">
            {presentationMode ? `${tasks.length} tasks` : totalHours > 0 ? `${totalHours.toFixed(1)}h total` : "No hours detected"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {tasks.map((task, i) => (
          <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30 text-sm">
            {task.source === "done" ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
            ) : (
              <ListTodo className="w-3.5 h-3.5 text-primary shrink-0" />
            )}
            <span className="flex-1 font-mono text-xs truncate">{task.text}</span>
            {!presentationMode && task.hours > 0 && (
              <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 shrink-0">
                {task.hours.toFixed(1)}h
              </Badge>
            )}
          </div>
        ))}

        {/* Merge suggestions */}
        {mergeSuggestions.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <GitMerge className="w-3.5 h-3.5" />
              Similar tasks found in previous entries
            </p>
            {mergeSuggestions.map((suggestion, i) => (
              <div key={i} className="rounded-md border border-primary/20 bg-primary/5 p-2.5 space-y-1.5">
                <div className="text-xs">
                  <span className="text-muted-foreground">Current: </span>
                  <span className="font-mono">{suggestion.currentTask.text}</span>
                </div>
                <div className="text-xs">
                  <span className="text-muted-foreground">Previous ({suggestion.previousDate}): </span>
                  <span className="font-mono">{suggestion.previousTask.text}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {Math.round(suggestion.similarity * 100)}% match
                  </Badge>
                  {suggestion.previousTask.hours > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                      prev: {suggestion.previousTask.hours.toFixed(1)}h
                    </Badge>
                  )}
                  <div className="flex-1" />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] px-2 text-muted-foreground"
                    onClick={() => onDismiss?.(suggestion)}
                  >
                    Dismiss
                  </Button>
                  <Button
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => onMerge?.(suggestion)}
                  >
                    <GitMerge className="w-3 h-3 mr-1" />
                    Use previous text
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
