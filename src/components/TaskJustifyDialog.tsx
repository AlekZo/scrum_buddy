import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Copy, Check, Sparkles } from "lucide-react";
import { justifyTask } from "@/lib/ai-service";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  occurrences: TaskOccurrence[];
  subGroups?: TaskGroup[];
  totalActual: number;
  totalTeam: number;
  lastSeen: string;
}

interface TaskJustifyDialogProps {
  groups: TaskGroup[];
  allOccurrences: TaskOccurrence[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialGroupId?: string | null;
}

const PRESET_QUESTIONS = [
  { label: "Why so long?", question: "Why did this task take so long? Justify the time spent." },
  { label: "When started?", question: "When did I start working on this task and what was the timeline?" },
  { label: "What was done?", question: "What exactly was done on this task? Break down the activities." },
  { label: "Hours breakdown", question: "Give me a detailed breakdown of hours spent on this task by day." },
  { label: "Status update", question: "Provide a professional status update on this task for the team lead." },
];

export function TaskJustifyDialog({ groups, allOccurrences, open, onOpenChange, initialGroupId }: TaskJustifyDialogProps) {
  const [selectedGroup, setSelectedGroup] = useState<string | null>(initialGroupId ?? null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Sync initialGroupId when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedGroup(initialGroupId ?? null);
      setAnswer("");
      setQuestion("");
    }
  }, [open, initialGroupId]);

  const taskDataContext = useMemo(() => {
    if (!selectedGroup) {
      const byDate = new Map<string, TaskOccurrence[]>();
      for (const o of allOccurrences) {
        const arr = byDate.get(o.date) || [];
        arr.push(o);
        byDate.set(o.date, arr);
      }
      const dates = [...byDate.keys()].sort();
      return dates
        .map((d) => {
          const tasks = byDate.get(d)!;
          const lines = tasks.map((t) => `  • ${t.text} (actual: ${t.actualHours}h, team: ${t.teamHours}h)`);
          const dayActual = tasks.reduce((s, t) => s + t.actualHours, 0);
          return `${d} — ${dayActual.toFixed(1)}h total:\n${lines.join("\n")}`;
        })
        .join("\n\n");
    }

    const group = groups.find((g) => g.id === selectedGroup);
    if (!group) return "";

    const allOccs = group.subGroups
      ? group.subGroups.flatMap((sg) => sg.occurrences)
      : group.occurrences;

    const byDate = new Map<string, TaskOccurrence[]>();
    for (const o of allOccs) {
      const arr = byDate.get(o.date) || [];
      arr.push(o);
      byDate.set(o.date, arr);
    }
    const dates = [...byDate.keys()].sort();
    const header = `Task: "${group.name}"\nTotal actual hours: ${group.totalActual.toFixed(1)}h\nTotal team hours: ${group.totalTeam.toFixed(1)}h\nDays worked: ${dates.length}\nFirst seen: ${dates[0]}\nLast seen: ${dates[dates.length - 1]}\n\nDaily log:`;
    const dailyLog = dates
      .map((d) => {
        const tasks = byDate.get(d)!;
        const lines = tasks.map((t) => `  • ${t.childText || t.text} (actual: ${t.actualHours}h, team: ${t.teamHours}h)`);
        return `${d}:\n${lines.join("\n")}`;
      })
      .join("\n");

    return `${header}\n${dailyLog}`;
  }, [selectedGroup, groups, allOccurrences]);

  const handleAsk = async (q: string) => {
    if (!q.trim()) return;
    setQuestion(q);
    setAnswer("");
    setLoading(true);
    try {
      const result = await justifyTask(q, taskDataContext);
      setAnswer(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI error");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-primary" />
            Ask AI about your tasks
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Task scope selector */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Scope — which task to analyze:</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge
                variant={selectedGroup === null ? "default" : "outline"}
                className="cursor-pointer text-xs"
                onClick={() => setSelectedGroup(null)}
              >
                All tasks
              </Badge>
              {groups.slice(0, 15).map((g) => (
                <Badge
                  key={g.id}
                  variant={selectedGroup === g.id ? "default" : "outline"}
                  className="cursor-pointer text-xs max-w-[200px] truncate"
                  onClick={() => setSelectedGroup(g.id)}
                >
                  {g.name}
                </Badge>
              ))}
              {groups.length > 15 && (
                <span className="text-xs text-muted-foreground self-center">+{groups.length - 15} more</span>
              )}
            </div>
          </div>

          {/* Quick question presets */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Quick questions:</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_QUESTIONS.map((pq) => (
                <Button
                  key={pq.label}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={loading}
                  onClick={() => handleAsk(pq.question)}
                >
                  {pq.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Free-form question */}
          <div className="flex gap-2">
            <Textarea
              placeholder="Ask a custom question, e.g. 'Why did the mapping task take 3 days?'"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="min-h-[60px] text-sm resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAsk(question);
                }
              }}
            />
            <Button
              size="sm"
              className="shrink-0 self-end"
              disabled={loading || !question.trim()}
              onClick={() => handleAsk(question)}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ask"}
            </Button>
          </div>

          {/* Answer */}
          {(answer || loading) && (
            <div className={cn(
              "rounded-lg border bg-muted/30 p-4 text-sm whitespace-pre-wrap relative",
              loading && "animate-pulse"
            )}>
              {loading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing your task data…
                </div>
              ) : (
                <>
                  <div className="pr-8">{answer}</div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-7 w-7"
                    onClick={handleCopy}
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
