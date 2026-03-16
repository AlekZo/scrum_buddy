import { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Sparkles,
  Upload,
  FileText,
  X,
  Clock,
  Zap,
  ArrowRight,
  Package,
} from "lucide-react";
import { isAIConfigured, generateProjectBreakdown, AIError, type BreakdownTask } from "@/lib/ai-service";
import { readFileAsText, extractFileContent, isSupportedFile } from "@/lib/file-utils";
import { createPlanTask, type PlanTask } from "@/lib/plan-types";
import { getToday } from "@/lib/types";

interface AIBreakdownModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: string;
  onSaveTasks: (tasks: PlanTask[]) => void;
}

interface ReviewTask extends BreakdownTask {
  selected: boolean;
}

type Step = "input" | "loading" | "review";

export function AIBreakdownModal({
  open,
  onOpenChange,
  project,
  onSaveTasks,
}: AIBreakdownModalProps) {
  const [step, setStep] = useState<Step>("input");
  const [description, setDescription] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [reviewTasks, setReviewTasks] = useState<ReviewTask[]>([]);
  const [loadingText, setLoadingText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep("input");
    setDescription("");
    setFileContent("");
    setFileName("");
    setReviewTasks([]);
    setLoadingText("");
  }, []);

  const handleClose = useCallback(
    (val: boolean) => {
      if (!val) reset();
      onOpenChange(val);
    },
    [onOpenChange, reset]
  );

  const handleFile = useCallback(async (file: File) => {
    if (!isSupportedFile(file)) {
      toast.error("Unsupported file. Use .txt, .md, .csv, or .json");
      return;
    }
    try {
      const text = await readFileAsText(file);
      setFileContent(extractFileContent(text));
      setFileName(file.name);
      toast.success(`Loaded ${file.name}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to read file");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleGenerate = useCallback(async () => {
    if (!description.trim() && !fileContent.trim()) {
      toast.error("Describe the project or upload a spec file");
      return;
    }
    if (!isAIConfigured()) {
      toast.error("Configure AI in Settings first (API key required)");
      return;
    }

    setStep("loading");
    const phrases = [
      "Analyzing requirements…",
      "Synthesizing standup tasks…",
      "Calculating standard vs. accelerated timelines…",
      "Generating dual estimates…",
    ];
    let i = 0;
    setLoadingText(phrases[0]);
    const interval = setInterval(() => {
      i = (i + 1) % phrases.length;
      setLoadingText(phrases[i]);
    }, 1800);

    try {
      const tasks = await generateProjectBreakdown(description, fileContent);
      clearInterval(interval);
      if (tasks.length === 0) {
        toast.error("AI returned no tasks. Try adding more detail.");
        setStep("input");
        return;
      }
      setReviewTasks(tasks.map((t) => ({ ...t, selected: true })));
      setStep("review");
    } catch (err: any) {
      clearInterval(interval);
      if (err instanceof AIError && err.provider !== "ollama") {
        toast.error(err.message, {
          description: "💡 Tip: Try switching to Ollama (local) in Settings → AI",
          duration: 8000,
        });
      } else {
        toast.error(err.message || "AI generation failed");
      }
      setStep("input");
    }
  }, [description, fileContent]);

  const toggleTask = useCallback((idx: number) => {
    setReviewTasks((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, selected: !t.selected } : t))
    );
  }, []);

  const updateTaskField = useCallback(
    (idx: number, field: keyof BreakdownTask, value: string | number) => {
      setReviewTasks((prev) =>
        prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t))
      );
    },
    []
  );

  const handleBankIt = useCallback(() => {
    const selected = reviewTasks.filter((t) => t.selected);
    if (selected.length === 0) {
      toast.error("Select at least one task");
      return;
    }
    const today = getToday();
    const planTasks = selected.map((t) =>
      createPlanTask(
        t.taskName,
        today,
        today,
        typeof t.teamHours === "string" ? parseFloat(t.teamHours) || 1 : t.teamHours,
        project,
        typeof t.actualHours === "string" ? parseFloat(t.actualHours) || 0.25 : t.actualHours,
        "backlog"
      )
    );
    onSaveTasks(planTasks);
    const totalTeam = selected.reduce((s, t) => s + (typeof t.teamHours === "string" ? parseFloat(t.teamHours) || 0 : t.teamHours), 0);
    const totalActual = selected.reduce((s, t) => s + (typeof t.actualHours === "string" ? parseFloat(t.actualHours) || 0 : t.actualHours), 0);
    toast.success(
      `Banked ${selected.length} tasks → ${totalTeam}h team / ${totalActual}h actual`
    );
    handleClose(false);
  }, [reviewTasks, project, onSaveTasks, handleClose]);

  const selectedCount = reviewTasks.filter((t) => t.selected).length;
  const totalTeamH = reviewTasks
    .filter((t) => t.selected)
    .reduce((s, t) => s + (typeof t.teamHours === "string" ? parseFloat(t.teamHours) || 0 : t.teamHours), 0);
  const totalActualH = reviewTasks
    .filter((t) => t.selected)
    .reduce((s, t) => s + (typeof t.actualHours === "string" ? parseFloat(t.actualHours) || 0 : t.actualHours), 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="w-5 h-5 text-primary" />
            AI Project Breakdown
          </DialogTitle>
          <DialogDescription>
            Describe a project or paste specs — AI generates standup-ready tasks
            with dual time estimates.
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 1: Input ── */}
        {step === "input" && (
          <div className="space-y-4">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the project, feature, or epic…&#10;&#10;e.g. Build a Jira integration that syncs tickets bi-directionally, with OAuth2 auth, webhook listeners, and a mapping UI for custom fields."
              className="min-h-[120px] font-mono text-sm"
            />

            {/* File drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border/60 hover:border-primary/40 hover:bg-muted/30"
              )}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md,.csv,.json,.markdown"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
              {fileName ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="font-medium">{fileName}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFileName("");
                      setFileContent("");
                    }}
                    className="ml-1 p-0.5 rounded hover:bg-destructive/10"
                  >
                    <X className="w-3 h-3 text-destructive" />
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  <Upload className="w-6 h-6 mx-auto text-muted-foreground/60" />
                  <p className="text-sm text-muted-foreground">
                    Drop a spec file or{" "}
                    <span className="text-primary font-medium">browse</span>
                  </p>
                  <p className="text-xs text-muted-foreground/60">
                    .txt, .md, .csv, .json — max 5MB
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={!description.trim() && !fileContent.trim()}
                className="gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                Generate Breakdown
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step 2: Loading ── */}
        {step === "loading" && (
          <div className="py-8 space-y-4">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground animate-pulse">
              <Sparkles className="w-4 h-4 text-primary" />
              {loadingText}
            </div>
            <div className="space-y-3 px-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-4 h-4 rounded" />
                  <Skeleton className="flex-1 h-8 rounded" />
                  <Skeleton className="w-14 h-6 rounded-full" />
                  <Skeleton className="w-14 h-6 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 3: Review ── */}
        {step === "review" && (
          <div className="space-y-4">
            {/* Summary bar */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-3 text-sm">
                <Badge variant="secondary" className="font-mono">
                  {selectedCount}/{reviewTasks.length} selected
                </Badge>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  Team: <strong className="text-foreground">{totalTeamH.toFixed(1)}h</strong>
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Zap className="w-3.5 h-3.5" />
                  Actual: <strong className="text-success">{totalActualH.toFixed(1)}h</strong>
                </span>
              </div>
              <Badge className="bg-primary/10 text-primary border-primary/20">
                Buffer: +{(totalTeamH - totalActualH).toFixed(1)}h
              </Badge>
            </div>

            {/* Task cards */}
            <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
              {reviewTasks.map((task, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border transition-all",
                    task.selected
                      ? "border-border/60 bg-card"
                      : "border-transparent bg-muted/30 opacity-50"
                  )}
                >
                  <Checkbox
                    checked={task.selected}
                    onCheckedChange={() => toggleTask(idx)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    <Input
                      value={task.taskName}
                      onChange={(e) =>
                        updateTaskField(idx, "taskName", e.target.value)
                      }
                      className="h-8 text-sm font-medium border-none bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 text-destructive border-destructive/30"
                        >
                          TEAM
                        </Badge>
                        <Input
                          type="number"
                          step="0.25"
                          min="0.25"
                          value={task.teamHours}
                          onChange={(e) =>
                            updateTaskField(
                              idx,
                              "teamHours",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="h-6 w-16 text-xs font-mono text-center"
                        />
                        <span className="text-xs text-muted-foreground">h</span>
                      </div>
                      <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 text-success border-success/30"
                        >
                          ACTUAL
                        </Badge>
                        <Input
                          type="number"
                          step="0.25"
                          min="0.25"
                          value={task.actualHours}
                          onChange={(e) =>
                            updateTaskField(
                              idx,
                              "actualHours",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="h-6 w-16 text-xs font-mono text-center"
                        />
                        <span className="text-xs text-muted-foreground">h</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter className="flex-row justify-between sm:justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep("input")}
                className="text-xs"
              >
                ← Back to input
              </Button>
              <Button
                onClick={handleBankIt}
                disabled={selectedCount === 0}
                className="gap-1.5"
              >
                <Package className="w-4 h-4" />
                Bank {selectedCount} Task{selectedCount !== 1 ? "s" : ""} to
                Backlog
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
