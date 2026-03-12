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
import { CheckCircle2, ListTodo, AlertTriangle, ArrowDownFromLine, Loader2, Check, RefreshCw, Calendar } from "lucide-react";
import { toast } from "sonner";
import {
  isGCalConfigured,
  hasValidTokens,
  getGCalSettings,
  getFilteredEvents,
  eventsToDoingText,
} from "@/lib/gcal-service";

interface EntryFormProps {
  entry: Entry | null;
  date: string;
  project: string;
  previousTasks: { task: ParsedTask; date: string }[];
  yesterday: Entry | null;
  planData: PlanData;
  onSave: (project: string, entry: Entry) => void;
}

export function EntryForm({ entry, date, project, previousTasks, yesterday, planData, onSave }: EntryFormProps) {
  const [form, setForm] = useState<Entry>(entry || createEmptyEntry(date));
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevDateRef = useRef(date);
  const prevProjectRef = useRef(project);
  const formRef = useRef(form);
  formRef.current = form;

  // Auto-save when switching date or project
  useEffect(() => {
    if (prevDateRef.current !== date || prevProjectRef.current !== project) {
      const prevForm = formRef.current;
      if (prevForm.done || prevForm.doing || prevForm.blockers) {
        const tasks = [...parseTasks(prevForm.done, "done"), ...parseTasks(prevForm.doing, "doing")];
        const totalHours = tasks.reduce((sum, t) => sum + t.hours, 0);
        onSave(prevProjectRef.current, { ...prevForm, hours: totalHours });
      }
      prevDateRef.current = date;
      prevProjectRef.current = project;
    }
    setForm(entry || createEmptyEntry(date));
    setDismissed(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, date, project]);

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

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const updateField = (key: "done" | "doing" | "blockers", value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    triggerAutoSave();
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
            Add hours inline: <span className="font-mono bg-muted px-1 rounded">task - 2h</span> or <span className="font-mono bg-muted px-1 rounded">task - 3ч</span> or <span className="font-mono bg-muted px-1 rounded">task (30m)</span>
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
          {fields.map(({ key, label, icon: Icon, color, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <label className={`flex items-center gap-1.5 text-sm font-medium ${color}`}>
                <Icon className="w-4 h-4" />
                {label}
              </label>
              <RichTextEditor
                value={form[key]}
                onChange={(val) => updateField(key, val)}
                placeholder={placeholder}
                suggestions={key !== "blockers" ? historicalNames : undefined}
                className="bg-muted/30 border-border/50 focus-within:bg-background transition-colors"
              />
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
