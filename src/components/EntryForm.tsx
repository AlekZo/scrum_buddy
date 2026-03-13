import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import { Entry, createEmptyEntry, ParsedTask } from "@/lib/types";
import { PlanData } from "@/lib/plan-types";
import { parseTasks, findMergeSuggestions, MergeSuggestion, getHistoricalTaskNames } from "@/lib/task-parser";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ParsedTasksDisplay } from "@/components/ParsedTasksDisplay";
import { PlannedPanel } from "@/components/PlannedPanel";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { CheckCircle2, ListTodo, AlertTriangle, ArrowDownFromLine, Loader2, Check, RefreshCw, Calendar, Sparkles, Wand2, Undo2, HelpCircle, Lock, Unlock } from "lucide-react";
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
  const { t } = useI18n();
  const [form, setForm] = useState<Entry>(entry || createEmptyEntry(date));
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [merging, setMerging] = useState(false);
  const [polishing, setPolishing] = useState<Set<string>>(new Set());
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
        const doneTasks = parseTasks(prevForm.done, "done");
        const doingTasks = parseTasks(prevForm.doing, "doing");
        const allTasks = [...doneTasks, ...doingTasks];
        onSaveRef.current(prevProjectRef.current, {
          ...prevForm,
          hours: allTasks.reduce((s, t) => s + t.hours, 0),
          actualHours: allTasks.reduce((s, t) => s + t.actualHours, 0),
          teamHours: allTasks.reduce((s, t) => s + t.teamHours, 0),
          doneTaskCount: doneTasks.length,
          doingTaskCount: doingTasks.length,
        });
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

  // Debounced auto-save (skips if reported)
  const triggerAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const current = formRef.current;
      if (current.reported) return; // Don't auto-save frozen entries
      if (current.done || current.doing || current.blockers) {
        setSaveState("saving");
        const doneTasks = parseTasks(current.done, "done");
        const doingTasks = parseTasks(current.doing, "doing");
        const allTasks = [...doneTasks, ...doingTasks];
        const totalHours = allTasks.reduce((sum, t) => sum + t.hours, 0);
        const actualHours = allTasks.reduce((sum, t) => sum + t.actualHours, 0);
        const teamHours = allTasks.reduce((sum, t) => sum + t.teamHours, 0);
        doSave(project, {
          ...current,
          date,
          hours: totalHours,
          actualHours,
          teamHours,
          doneTaskCount: doneTasks.length,
          doingTaskCount: doingTasks.length,
        });
      }
    }, 1500);
  }, [project, date, doSave]);

  const handleRetry = () => {
    setSaveState("saving");
    const current = formRef.current;
    const doneTasks = parseTasks(current.done, "done");
    const doingTasks = parseTasks(current.doing, "doing");
    const allTasks = [...doneTasks, ...doingTasks];
    doSave(project, {
      ...current, date,
      hours: allTasks.reduce((s, t) => s + t.hours, 0),
      actualHours: allTasks.reduce((s, t) => s + t.actualHours, 0),
      teamHours: allTasks.reduce((s, t) => s + t.teamHours, 0),
      doneTaskCount: doneTasks.length,
      doingTaskCount: doingTasks.length,
    });
  };

  // Helper: build entry with cached metadata from current form
  const buildSaveEntry = (current: Entry): Entry => {
    const doneTasks = parseTasks(current.done, "done");
    const doingTasks = parseTasks(current.doing, "doing");
    const allTasks = [...doneTasks, ...doingTasks];
    return {
      ...current,
      hours: allTasks.reduce((s, t) => s + t.hours, 0),
      actualHours: allTasks.reduce((s, t) => s + t.actualHours, 0),
      teamHours: allTasks.reduce((s, t) => s + t.teamHours, 0),
      doneTaskCount: doneTasks.length,
      doingTaskCount: doingTasks.length,
    };
  };

  // Force save pending changes on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        const current = formRef.current;
        if (current.done || current.doing || current.blockers) {
          onSaveRef.current(prevProjectRef.current, buildSaveEntry(current));
        }
      }
    };
  }, []);

  // Flush pending save on tab close / navigation
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        const current = formRef.current;
        if (current.done || current.doing || current.blockers) {
          onSaveRef.current(prevProjectRef.current, buildSaveEntry(current));
        }
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const updateField = (key: "done" | "doing" | "blockers", value: string) => {
    if (formRef.current.reported && key !== "blockers") return; // Protect frozen fields
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
    setPrePolishText((prev) => ({ ...prev, [field]: text }));
    setPolishing((prev) => new Set(prev).add(field));
    try {
      const polished = await polishText(text);
      setForm((prev) => ({ ...prev, [field]: polished }));
      triggerAutoSave();
      toast.success("Text polished by AI ✨ — Click Undo to revert", { duration: 5000 });
    } catch (err) {
      setPrePolishText((prev) => { const n = { ...prev }; delete n[field]; return n; });
      toast.error(err instanceof Error ? err.message : "AI polish failed");
    } finally {
      setPolishing((prev) => { const n = new Set(prev); n.delete(field); return n; });
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
    setPolishing((prev) => new Set(prev).add("blockers"));
    try {
      const polished = await polishBlockers(text);
      setForm((prev) => ({ ...prev, blockers: polished }));
      triggerAutoSave();
      toast.success("Blockers polished ✨ — Click Undo to revert", { duration: 5000 });
    } catch (err) {
      setPrePolishText((prev) => { const n = { ...prev }; delete n.blockers; return n; });
      toast.error(err instanceof Error ? err.message : "AI polish failed");
    } finally {
      setPolishing((prev) => { const n = new Set(prev); n.delete("blockers"); return n; });
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

  // Per-field hours for inline pill display
  const fieldHours = useMemo(() => {
    const doneT = parseTasks(form.done, "done");
    const doingT = parseTasks(form.doing, "doing");
    return {
      done: { actual: doneT.reduce((s, t) => s + t.actualHours, 0), team: doneT.reduce((s, t) => s + t.teamHours, 0) },
      doing: { actual: doingT.reduce((s, t) => s + t.actualHours, 0), team: doingT.reduce((s, t) => s + t.teamHours, 0) },
    };
  }, [form.done, form.doing]);

  const isReported = form.reported ?? false;

  const toggleReported = () => {
    setForm((prev) => ({ ...prev, reported: !prev.reported }));
    triggerAutoSave();
  };

  const unlockReported = () => {
    setForm((prev) => ({ ...prev, reported: false }));
    triggerAutoSave();
  };

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
    if (!yesterday || isReported) return; // Block prefill when reported
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
    { key: "done" as const, label: t("entry.whatIDid"), icon: CheckCircle2, color: "text-success", placeholder: "Fixed auth bug - 2h\nCode review - 1.5h\nStandup 30m" },
    { key: "doing" as const, label: t("entry.whatImDoing"), icon: ListTodo, color: "text-primary", placeholder: "Deploy pipeline - 3h\nWrite tests - 2h" },
    { key: "blockers" as const, label: t("entry.blockers"), icon: AlertTriangle, color: "text-warning", placeholder: "Waiting on API access..." },
  ];

  const SaveIndicator = () => {
    if (saveState === "saving") {
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground animate-in fade-in">
          <Loader2 className="w-3 h-3 animate-spin" />
          {t("entry.saving")}
        </span>
      );
    }
    if (saveState === "saved") {
      return (
        <span className="flex items-center gap-1 text-xs text-success animate-in fade-in">
          <Check className="w-3 h-3" />
          {t("entry.saved")}
        </span>
      );
    }
    if (saveState === "error") {
      return (
        <span className="flex items-center gap-1 text-xs text-destructive animate-in fade-in">
          {t("entry.saveFailed")}
          <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] gap-0.5" onClick={handleRetry}>
            <RefreshCw className="w-3 h-3" />
            {t("entry.retry")}
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
          <div className="flex items-center justify-between">
            <Popover>
              <PopoverTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground transition-colors" title="Formatting help">
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="text-xs text-muted-foreground w-72" side="bottom" align="start">
                <p>
                  Hours: <span className="font-mono bg-muted px-1 rounded">task - 2h</span> · Dual: <span className="font-mono bg-muted px-1 rounded">task - 1h/3h</span> or <span className="font-mono bg-muted px-1 rounded">1h-3h</span> <span className="text-xs">(actual/team)</span> · Also: <span className="font-mono bg-muted px-1 rounded">30m</span> <span className="font-mono bg-muted px-1 rounded">3ч</span>
                </p>
              </PopoverContent>
            </Popover>

            {/* Reported toggle */}
            <div className="flex items-center gap-2">
              {isReported ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs gap-1.5 text-muted-foreground"
                  onClick={unlockReported}
                >
                  <Unlock className="w-3.5 h-3.5" />
                  {t("entry.unlock")}
                </Button>
              ) : null}
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Switch
                  checked={isReported}
                  onCheckedChange={toggleReported}
                  className="scale-75"
                />
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  {isReported && <Lock className="w-3 h-3" />}
                  {t("entry.reported")}
                </span>
              </label>
            </div>
          </div>
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
            <label htmlFor="version-input" className="text-xs text-muted-foreground shrink-0">{t("entry.version")}</label>
            <input
              id="version-input"
              value={form.version || ""}
              onChange={(e) => updateVersion(e.target.value)}
              placeholder="e.g. v2, sprint-3"
              className="h-7 text-base sm:text-xs font-mono bg-muted/30 border border-border/50 rounded px-2 w-32 focus:outline-none focus:ring-1 focus:ring-primary/50"
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
                {t("entry.updateDuplicates")}
              </Button>
            )}
          </div>

          {fields.map(({ key, label, icon: Icon, color, placeholder }) => {
            const fh = key !== "blockers" ? fieldHours[key] : null;
            const hasDual = fh && fh.actual !== fh.team && fh.actual > 0;
            return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className={`flex items-center gap-1.5 text-sm font-medium ${color}`}>
                  <Icon className="w-4 h-4" />
                  {label}
                  {/* Inline hours pill */}
                  {fh && fh.actual > 0 && (
                    <span className="flex items-center gap-1 ml-1">
                      {hasDual ? (
                        <>
                          <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">{fh.actual.toFixed(1)}h actual</Badge>
                          <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">{fh.team.toFixed(1)}h team</Badge>
                        </>
                      ) : (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">{fh.actual.toFixed(1)}h</Badge>
                      )}
                    </span>
                  )}
                </label>
                {isAIConfigured() && key !== "blockers" && (
                   <div className="flex items-center gap-1">
                    {prePolishText[key] && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 sm:h-7 text-xs gap-1 text-warning px-2 min-w-[44px]"
                        onClick={() => handleUndoPolish(key)}
                        title="Revert to original text"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{t("entry.undo")}</span>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 sm:h-7 text-xs gap-1 text-muted-foreground px-2 min-w-[44px]"
                      disabled={polishing.has(key)}
                      onClick={() => handleAIPolish(key)}
                      title="Rewrite shorthand into professional text"
                    >
                      {polishing.has(key) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                      <span className="hidden sm:inline">{t("entry.polish")}</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 sm:h-7 text-xs gap-1 text-muted-foreground px-2 min-w-[44px]"
                      disabled={merging}
                      onClick={() => handleAIMerge(key)}
                      title="Merge & deduplicate tasks with AI"
                    >
                      {merging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      <span className="hidden sm:inline">{t("entry.merge")}</span>
                    </Button>
                  </div>
                )}
                {isAIConfigured() && key === "blockers" && (
                   <div className="flex items-center gap-1">
                    {prePolishText.blockers && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 sm:h-7 text-xs gap-1 text-warning px-2 min-w-[44px]"
                        onClick={() => handleUndoPolish("blockers")}
                        title="Revert to original text"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{t("entry.undo")}</span>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 sm:h-7 text-xs gap-1 text-muted-foreground px-2 min-w-[44px]"
                      disabled={polishing.has("blockers")}
                      onClick={handleBlockerPolish}
                      title="Polish blockers into professional language"
                    >
                      {polishing.has("blockers") ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                      <span className="hidden sm:inline">✨ {t("entry.polish")}</span>
                    </Button>
                  </div>
                )}
              </div>
              {polishing.has(key) ? (
                <div className="rounded-md border border-border/50 bg-muted/30 p-3 space-y-2 animate-pulse">
                  <div className="h-3 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                  <div className="h-3 bg-muted rounded w-5/6" />
                  <p className="text-[10px] text-muted-foreground text-center mt-2">AI is polishing your text…</p>
                </div>
              ) : (
                <div className={isReported && key !== "blockers" ? "relative" : ""}>
                  {isReported && key !== "blockers" && (
                    <div className="absolute inset-0 z-10 rounded-md bg-muted/20 cursor-not-allowed flex items-center justify-center">
                      <Lock className="w-4 h-4 text-muted-foreground/40" />
                    </div>
                  )}
                  <RichTextEditor
                    value={form[key]}
                    onChange={(val) => updateField(key, val)}
                    placeholder={placeholder}
                    suggestions={key !== "blockers" ? historicalNames : undefined}
                    disabled={merging || polishing.has(key) || (isReported && key !== "blockers")}
                    className={`bg-muted/30 border-border/50 focus-within:bg-background transition-colors ${isReported && key !== "blockers" ? "opacity-60" : ""}`}
                  />
                </div>
              )}
            </div>
          );
          })}
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
