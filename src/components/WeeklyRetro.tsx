import { useState, useMemo } from "react";
import { Entry } from "@/lib/types";
import { parseTasks } from "@/lib/task-parser";
import { generateWeeklyRetro, categorizeTasks, isAIConfigured } from "@/lib/ai-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Calendar, Tags, Copy } from "lucide-react";
import { toast } from "sonner";
import { getWeekStart, getWeekDays } from "@/lib/plan-types";

interface WeeklyRetroProps {
  entries: Entry[];
  project: string;
  selectedDate: string;
}

const TAG_COLORS: Record<string, string> = {
  "#feature": "bg-primary/15 text-primary border-primary/30",
  "#bugfix": "bg-destructive/15 text-destructive border-destructive/30",
  "#meetings": "bg-warning/15 text-warning border-warning/30",
  "#review": "bg-accent/50 text-accent-foreground border-accent",
  "#devops": "bg-secondary text-secondary-foreground border-border",
  "#docs": "bg-muted text-muted-foreground border-border",
  "#refactor": "bg-primary/10 text-primary/80 border-primary/20",
  "#testing": "bg-success/15 text-success border-success/30",
  "#design": "bg-primary/20 text-primary border-primary/40",
  "#research": "bg-secondary text-secondary-foreground border-border",
  "#support": "bg-warning/10 text-warning border-warning/20",
  "#planning": "bg-muted text-muted-foreground border-border",
};

export function WeeklyRetro({ entries, project, selectedDate }: WeeklyRetroProps) {
  const [retroText, setRetroText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [categorizedTasks, setCategorizedTasks] = useState<{ task: string; tags: string[] }[]>([]);
  const [categorizing, setCategorizing] = useState(false);

  const weekStart = useMemo(() => getWeekStart(selectedDate), [selectedDate]);
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);

  const weekEntries = useMemo(() => {
    const daySet = new Set(weekDays);
    return entries.filter((e) => daySet.has(e.date)).sort((a, b) => a.date.localeCompare(b.date));
  }, [entries, weekDays]);

  const allTasks = useMemo(() => {
    return weekEntries.flatMap((e) => [
      ...parseTasks(e.done, "done"),
      ...parseTasks(e.doing, "doing"),
    ]);
  }, [weekEntries]);

  const totalHours = useMemo(
    () => allTasks.reduce((s, t) => s + t.teamHours, 0),
    [allTasks]
  );

  const handleGenerateRetro = async () => {
    if (!isAIConfigured()) {
      toast.error("Configure AI in Settings first (⚙️ → AI)");
      return;
    }
    if (weekEntries.length === 0) {
      toast.error("No entries for this week");
      return;
    }

    setGenerating(true);
    try {
      const weekData = weekEntries.map((e) => ({
        date: e.date,
        done: e.done,
        doing: e.doing,
        blockers: e.blockers,
        hours: e.hours,
      }));
      const result = await generateWeeklyRetro(weekData);
      setRetroText(result);
      toast.success("Weekly retrospective generated!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate");
    } finally {
      setGenerating(false);
    }
  };

  const handleCategorize = async () => {
    if (!isAIConfigured()) {
      toast.error("Configure AI in Settings first (⚙️ → AI)");
      return;
    }
    if (allTasks.length === 0) {
      toast.error("No tasks to categorize");
      return;
    }

    setCategorizing(true);
    try {
      const uniqueNames = [...new Set(allTasks.map((t) => t.text))];
      const result = await categorizeTasks(uniqueNames);
      setCategorizedTasks(result);
      toast.success(`Categorized ${result.length} tasks!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to categorize");
    } finally {
      setCategorizing(false);
    }
  };

  const handleCopyRetro = async () => {
    if (!retroText) return;
    try {
      await navigator.clipboard.writeText(retroText);
      toast.success("Copied to clipboard!");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const weekLabel = useMemo(() => {
    const start = new Date(weekDays[0]);
    const end = new Date(weekDays[weekDays.length - 1]);
    const fmt = (d: Date) =>
      d.toLocaleDateString("en", { month: "short", day: "numeric" });
    return `${fmt(start)} – ${fmt(end)}`;
  }, [weekDays]);

  if (!isAIConfigured()) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-8 text-center text-muted-foreground">
          <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Configure AI in ⚙️ Settings to unlock weekly retros and auto-categorization.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Week summary header */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              Week of {weekLabel}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {weekEntries.length} days · {totalHours.toFixed(1)}h
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Generate Retro */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleGenerateRetro}
              disabled={generating || weekEntries.length === 0}
              className="gap-1.5"
            >
              {generating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Generate Weekly Retro
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCategorize}
              disabled={categorizing || allTasks.length === 0}
              className="gap-1.5"
            >
              {categorizing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Tags className="w-3.5 h-3.5" />
              )}
              Auto-Tag Tasks
            </Button>
          </div>

          {/* Retro output */}
          {retroText && (
            <div className="relative">
              <Button
                size="sm"
                variant="ghost"
                className="absolute top-2 right-2 h-7 w-7 p-0 text-muted-foreground"
                onClick={handleCopyRetro}
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
              <div className="rounded-lg bg-muted/30 border border-border/50 p-4">
                <pre className="text-sm whitespace-pre-wrap font-mono leading-relaxed text-foreground/90">
                  {retroText}
                </pre>
              </div>
            </div>
          )}
          {generating && !retroText && (
            <div className="rounded-lg bg-muted/30 border border-border/50 p-4 space-y-2">
              <div className="h-4 bg-muted/50 rounded animate-pulse w-3/4" />
              <div className="h-4 bg-muted/50 rounded animate-pulse w-1/2" />
              <div className="h-4 bg-muted/50 rounded animate-pulse w-5/6" />
              <div className="h-4 bg-muted/50 rounded animate-pulse w-2/3" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auto-categorized tasks */}
      {categorizedTasks.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Tags className="w-4 h-4 text-primary" />
              Categorized Tasks ({categorizedTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {categorizedTasks.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/30 transition-colors"
                >
                  <span className="text-xs font-mono flex-1 truncate text-foreground/80">
                    {item.task}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {item.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 ${TAG_COLORS[tag] || "bg-muted text-muted-foreground border-border"}`}
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Tag summary */}
            <div className="mt-4 pt-3 border-t border-border/30">
              <p className="text-[10px] text-muted-foreground mb-2">Distribution</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(
                  categorizedTasks
                    .flatMap((t) => t.tags)
                    .reduce((acc, tag) => {
                      acc[tag] = (acc[tag] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>)
                )
                  .sort((a, b) => b[1] - a[1])
                  .map(([tag, count]) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className={`text-[10px] ${TAG_COLORS[tag] || "bg-muted text-muted-foreground border-border"}`}
                    >
                      {tag} × {count}
                    </Badge>
                  ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
