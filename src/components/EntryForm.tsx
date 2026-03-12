import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Entry, createEmptyEntry, ParsedTask } from "@/lib/types";
import { PlanData } from "@/lib/plan-types";
import { parseTasks, findMergeSuggestions, MergeSuggestion, getHistoricalTaskNames } from "@/lib/task-parser";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ParsedTasksDisplay } from "@/components/ParsedTasksDisplay";
import { PlannedPanel } from "@/components/PlannedPanel";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ListTodo, AlertTriangle, ArrowDownFromLine, Loader2, Check, RefreshCw, Calendar, Sparkles, Wand2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  isGCalConfigured,
  hasValidTokens,
  getGCalSettings,
  getFilteredEvents,
  eventsToDoingText,
} from "@/lib/gcal-service";
import { isAIConfigured, mergeTasks, polishText, polishBlockers } from "@/lib/ai-service";

interface EntryFormProps {
  entry: Entry | null;
  date: string;
  project: string;
  previousTasks: { task: ParsedTask; date: string }[];
  yesterday: Entry | null;
  planData: PlanData;
  onSave: (project: string, entry: Entry) => void;
  onUpdateDuplicateVersions?: (sourceEntry: Entry, version: string) => number;
}

export function EntryForm({ entry, date, project, previousTasks, yesterday, planData, onSave, onUpdateDuplicateVersions }: EntryFormProps) {
  const [form, setForm] = useState<Entry>(entry || createEmptyEntry(date));
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [merging, setMerging] = useState(false);
  const [polishing, setPolishing] = useState<string | null>(null);
  const [prePolishText, setPrePolishText] = useState<Record<string, string>>({});
  const [lastError, setLastError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevDateRef = useRef(date);
  const prevProjectRef = useRef(project);
  const formRef = useRef(form);
  formRef.current = form;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Sync form state ONLY when date or project changes (not when entry prop changes)
  // This prevents the "cursor jump" bug where auto-save triggers parent re-render
  // which passes a new entry ref, wiping out in-flight keystrokes.
  useEffect(() => {
    if (prevDateRef.current !== date || prevProjectRef.current !== project) {
      const prevForm = formRef.current;
      if (prevForm.done || prevForm.doing || prevForm.blockers) {
        const tasks = [...parseTasks(prevForm.done, "done"), ...parseTasks(prevForm.doing, "doing")];
        const totalHours = tasks.reduce((sum, t) => sum + t.hours, 0);
        onSaveRef.current(prevProjectRef.current, { ...prevForm, hours: totalHours });
      }
      prevDateRef.current = date;
      prevProjectRef.current = project;
      setForm(entry || createEmptyEntry(date));
      setDismissed(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, project]);

  const doSave = useCallback((proj: string, entryToSave: Entry) => {
    try {
      onSave(proj, entryToSave);
      setSaveState("saved");
      setLastError(null);
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (err) {
      setSaveState("error");
      setLastError(err instanceof Error ? err.message : "Save failed");
      toast.error("Failed to save. Click retry or changes will be retried.");
    }
  }, [onSave]);

  // Debounced auto-save
  const triggerAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const current = formRef.current;
      if (current.done || current.doing || current.blockers) {
        setSaveState("saving");
        const tasks = [...parseTasks(current.done, "done"), ...parseTasks(current.doing, "doing")];
        const totalHours = tasks.reduce((sum, t) => sum + t.hours, 0);
        doSave(project, { ...current, date, hours: totalHours });
      }
    }, 1500);
  }, [project, date, doSave]);

  const handleRetry = () => {
    setSaveState("saving");
    const current = formRef.current;
    const tasks = [...parseTasks(current.done, "done"), ...parseTasks(current.doing, "doing")];
    const totalHours = tasks.reduce((sum, t) => sum + t.hours, 0);
    doSave(project, { ...current, date, hours: totalHours });
  };

  // Force save pending changes on unmount — uses refs to avoid stale closures
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        const current = formRef.current;
        if (current.done || current.doing || current.blockers) {
          const tasks = [...parseTasks(current.done, "done"), ...parseTasks(current.doing, "doing")];
          const totalHours = tasks.reduce((sum, t) => sum + t.hours, 0);
          onSaveRef.current(prevProjectRef.current, { ...current, hours: totalHours });
        }
      }
    };
  }, []);

  const updateField = (key: "done" | "doing" | "blockers", value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    triggerAutoSave();
  };

  const updateVersion = (version: string) => {
    setForm((prev) => ({ ...prev, version }));
    triggerAutoSave();
  };

  const handleAIMerge = async (field: "done" | "doing") => {
    const text = form[field];
    if (!text.trim()) return;
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) {
      toast.info("Need at least 2 lines to merge");
      return;
    }
    setMerging(true);
    try {
      const merged = await mergeTasks(lines);
      setForm((prev) => ({ ...prev, [field]: merged }));
      triggerAutoSave();
      toast.success("Tasks merged by AI");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI merge failed");
    } finally {
      setMerging(false);
    }
  };

  const handleAIPolish = async (field: "done" | "doing") => {
    const text = form[field];
    if (!text.trim()) return;
    // Save pre-polish text for undo
    setPrePolishText((prev) => ({ ...prev, [field]: text }));
    setPolishing(field);
    try {
      const polished = await polishText(text);
      setForm((prev) => ({ ...prev, [field]: polished }));
      triggerAutoSave();
      toast.success("Text polished by AI ✨ — Click Undo to revert", { duration: 5000 });
    } catch (err) {
      setPrePolishText((prev) => { const n = { ...prev }; delete n[field]; return n; });
      toast.error(err instanceof Error ? err.message : "AI polish failed");
    } finally {
      setPolishing(null);
    }
  };

  const handleUndoPolish = (field: "done" | "doing" | "blockers") => {
    const original = prePolishText[field];
    if (!original) return;
    setForm((prev) => ({ ...prev, [field]: original }));
    setPrePolishText((prev) => { const n = { ...prev }; delete n[field]; return n; });
    triggerAutoSave();
    toast.success("Reverted to original text");
  };

  const handleBlockerPolish = async () => {
    const text = form.blockers;
    if (!text.trim()) return;
    setPrePolishText((prev) => ({ ...prev, blockers: text }));
    setPolishing("blockers");
    try {
      const polished = await polishBlockers(text);
      setForm((prev) => ({ ...prev, blockers: polished }));
      triggerAutoSave();
      toast.success("Blockers polished ✨ — Click Undo to revert", { duration: 5000 });
    } catch (err) {
      setPrePolishText((prev) => { const n = { ...prev }; delete n.blockers; return n; });
      toast.error(err instanceof Error ? err.message : "AI polish failed");
    } finally {
      setPolishing(null);
    }
  };

  const appendToField = (key: "done" | "doing", text: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: prev[key] ? prev[key] + "\n" + text : text,
    }));
    triggerAutoSave();
  };

  const parsedTasks = useMemo(
    () => [...parseTasks(form.done, "done"), ...parseTasks(form.doing, "doing")],
    [form.done, form.doing]
  );

  const totalHours = useMemo(
    () => parsedTasks.reduce((sum, t) => sum + t.hours, 0),
    [parsedTasks]
  );

  const mergeSuggestions = useMemo(
    () =>
      findMergeSuggestions(parsedTasks, previousTasks).filter(
        (s) => !dismissed.has(s.currentTask.text)
      ),
    [parsedTasks, previousTasks, dismissed]
  );

  const historicalNames = useMemo(
    () => getHistoricalTaskNames(previousTasks),
    [previousTasks]
  );

  const handlePrefillFromYesterday = () => {
    if (!yesterday) return;
    setForm((prev) => ({
      ...prev,
      done: yesterday.doing ? yesterday.doing : prev.done,
    }));
    triggerAutoSave();
    toast.success("Prefilled 'What I did' from yesterday's planned tasks");
  };

  const handleMerge = (suggestion: MergeSuggestion) => {
    const field = suggestion.currentTask.source;
    const currentText = form[field];
    const lines = currentText.split("\n");
    const updatedLines = lines.map((line) => {
      const trimmed = line.trim().replace(/^[-•*]\s*/, "");
      if (!trimmed) return line;
      const tasks = parseTasks(trimmed, field);
      if (tasks.length > 0 && tasks[0].text === suggestion.currentTask.text) {
        const hours = suggestion.currentTask.hours > 0
          ? ` - ${suggestion.currentTask.hours}h`
          : suggestion.previousTask.hours > 0
          ? ` - ${suggestion.previousTask.hours}h`
          : "";
        return `• ${suggestion.previousTask.text}${hours}`;
      }
      return line;
    });
    setForm((prev) => ({ ...prev, [field]: updatedLines.join("\n") }));
    triggerAutoSave();
    toast.success("Task text updated from previous entry");
  };

  const handleDismiss = (suggestion: MergeSuggestion) => {
    setDismissed((prev) => new Set([...prev, suggestion.currentTask.text]));
  };

  const fields = [
    { key: "done" as const, label: "What I did", icon: CheckCircle2, color: "text-success", placeholder: "Fixed auth bug - 2h\nCode review - 1.5h\nStandup 30m" },
    { key: "doing" as const, label: "What I'm doing next", icon: ListTodo, color: "text-primary", placeholder: "Deploy pipeline - 3h\nWrite tests - 2h" },
    { key: "blockers" as const, label: "Blockers", icon: AlertTriangle, color: "text-warning", placeholder: "Waiting on API access..." },
  ];

  const SaveIndicator = () => {
    if (saveState === "saving") {
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground animate-in fade-in">
          <Loader2 className="w-3 h-3 animate-spin" />
          Saving…
        </span>
      );
    }
    if (saveState === "saved") {
      return (
        <span className="flex items-center gap-1 text-xs text-success animate-in fade-in">
          <Check className="w-3 h-3" />
          Saved ✓
        </span>
      );
    }
    if (saveState === "error") {
      return (
        <span className="flex items-center gap-1 text-xs text-destructive animate-in fade-in">
          Save failed
          <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] gap-0.5" onClick={handleRetry}>
            <RefreshCw className="w-3 h-3" />
            Retry
          </Button>
        </span>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Plan reference panel */}
      <PlannedPanel
        planData={planData}
        project={project}
        date={date}
        onPushToDone={(text) => appendToField("done", text)}
        onPushToDoing={(text) => appendToField("doing", text)}
      />

      <Card className="border-border/50">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">{date}</span>
              <span className="text-muted-foreground">·</span>
              <span>{project}</span>
            </CardTitle>
            <div className="flex items-center gap-2">
              {totalHours > 0 && (
                <Badge variant="secondary" className="font-mono text-xs">
                  {totalHours.toFixed(1)}h
                </Badge>
              )}
              <SaveIndicator />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Hours: <span className="font-mono bg-muted px-1 rounded">task - 2h</span> · Dual: <span className="font-mono bg-muted px-1 rounded">task - 1h/3h</span> <span className="text-[10px]">(actual/team)</span> · Also: <span className="font-mono bg-muted px-1 rounded">30m</span> <span className="font-mono bg-muted px-1 rounded">3ч</span>
          </p>
          {yesterday?.doing && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs mt-1"
              onClick={handlePrefillFromYesterday}
            >
              <ArrowDownFromLine className="w-3.5 h-3.5" />
              Prefill "What I did" from yesterday's plan
            </Button>
          )}
          {isGCalConfigured() && hasValidTokens() && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs mt-1"
              onClick={async () => {
                try {
                  const settings = getGCalSettings();
                  if (!settings) return;
                  const events = await getFilteredEvents(date, settings.filters);
                  if (events.length === 0) {
                    toast.info("No matching events found for this date.");
                    return;
                  }
                  const text = eventsToDoingText(events);
                  appendToField("doing", text);
                  toast.success(`Pulled ${events.length} events from Google Calendar`);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed to fetch calendar events");
                }
              }}
            >
              <Calendar className="w-3.5 h-3.5" />
              Pull from Google Calendar
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Version input */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground shrink-0">Version:</label>
            <input
              value={form.version || ""}
              onChange={(e) => updateVersion(e.target.value)}
              placeholder="e.g. v2, sprint-3"
              className="h-6 text-xs font-mono bg-muted/30 border border-border/50 rounded px-2 w-32 focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            {form.version && onUpdateDuplicateVersions && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] gap-1 text-muted-foreground px-2"
                onClick={() => {
                  const count = onUpdateDuplicateVersions(form, form.version!);
                  if (count > 0) {
                    toast.success(`Updated version on ${count} similar entr${count === 1 ? "y" : "ies"}`);
                  } else {
                    toast.info("No similar entries found to update");
                  }
                }}
              >
                <RefreshCw className="w-3 h-3" />
                Update duplicates
              </Button>
            )}
          </div>

          {fields.map(({ key, label, icon: Icon, color, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className={`flex items-center gap-1.5 text-sm font-medium ${color}`}>
                  <Icon className="w-4 h-4" />
                  {label}
                </label>
                {isAIConfigured() && key !== "blockers" && (
                  <div className="flex items-center gap-0.5">
                    {prePolishText[key] && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px] gap-1 text-warning px-1.5 min-w-[44px]"
                        onClick={() => handleUndoPolish(key)}
                        title="Revert to original text"
                      >
                        <Undo2 className="w-3 h-3" />
                        Undo
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] gap-1 text-muted-foreground px-1.5 min-w-[44px]"
                      disabled={polishing === key}
                      onClick={() => handleAIPolish(key)}
                      title="Rewrite shorthand into professional text"
                    >
                      {polishing === key ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                      Polish
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] gap-1 text-muted-foreground px-1.5 min-w-[44px]"
                      disabled={merging}
                      onClick={() => handleAIMerge(key)}
                      title="Merge & deduplicate tasks with AI"
                    >
                      {merging ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      Merge
                    </Button>
                  </div>
                )}
                {isAIConfigured() && key === "blockers" && (
                  <div className="flex items-center gap-0.5">
                    {prePolishText.blockers && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px] gap-1 text-warning px-1.5 min-w-[44px]"
                        onClick={() => handleUndoPolish("blockers")}
                        title="Revert to original text"
                      >
                        <Undo2 className="w-3 h-3" />
                        Undo
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] gap-1 text-muted-foreground px-1.5 min-w-[44px]"
                      disabled={polishing === "blockers"}
                      onClick={handleBlockerPolish}
                      title="Polish blockers into professional language"
                    >
                      {polishing === "blockers" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                      ✨ Polish
                    </Button>
                  </div>
                )}
              </div>
              {polishing === key ? (
                <div className="rounded-md border border-border/50 bg-muted/30 p-3 space-y-2 animate-pulse">
                  <div className="h-3 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                  <div className="h-3 bg-muted rounded w-5/6" />
                  <p className="text-[10px] text-muted-foreground text-center mt-2">AI is polishing your text…</p>
                </div>
              ) : (
                <RichTextEditor
                  value={form[key]}
                  onChange={(val) => updateField(key, val)}
                  placeholder={placeholder}
                  suggestions={key !== "blockers" ? historicalNames : undefined}
                  className="bg-muted/30 border-border/50 focus-within:bg-background transition-colors"
                />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <ParsedTasksDisplay
        tasks={parsedTasks}
        mergeSuggestions={mergeSuggestions}
        onMerge={handleMerge}
        onDismiss={handleDismiss}
      />
    </div>
  );
}
