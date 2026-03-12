import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Entry, createEmptyEntry, ParsedTask } from "@/lib/types";
import { parseTasks, findMergeSuggestions, MergeSuggestion } from "@/lib/task-parser";
import { BulletTextarea } from "@/components/BulletTextarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ParsedTasksDisplay } from "@/components/ParsedTasksDisplay";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ListTodo, AlertTriangle, ArrowDownFromLine, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface EntryFormProps {
  entry: Entry | null;
  date: string;
  project: string;
  previousTasks: { task: ParsedTask; date: string }[];
  yesterday: Entry | null;
  onSave: (project: string, entry: Entry) => void;
}

export function EntryForm({ entry, date, project, previousTasks, yesterday, onSave }: EntryFormProps) {
  const [form, setForm] = useState<Entry>(entry || createEmptyEntry(date));
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevDateRef = useRef(date);
  const prevProjectRef = useRef(project);
  const formRef = useRef(form);
  formRef.current = form;

  // Auto-save when switching date or project
  useEffect(() => {
    if (prevDateRef.current !== date || prevProjectRef.current !== project) {
      // Save previous form state
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
  }, [entry, date, project]); // intentionally exclude onSave to avoid loops

  // Debounced auto-save (1.5s after last change)
  const triggerAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const current = formRef.current;
      if (current.done || current.doing || current.blockers) {
        const tasks = [...parseTasks(current.done, "done"), ...parseTasks(current.doing, "doing")];
        const totalHours = tasks.reduce((sum, t) => sum + t.hours, 0);
        onSave(project, { ...current, date, hours: totalHours });
        setSaving(true);
        setTimeout(() => setSaving(false), 1000);
      }
    }, 1500);
  }, [project, date, onSave]);

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const updateField = (key: "done" | "doing" | "blockers", value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
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

  return (
    <div className="space-y-4">
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
              {saving && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground animate-in fade-in">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Saving…
                </span>
              )}
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
        </CardHeader>
        <CardContent className="space-y-4">
          {fields.map(({ key, label, icon: Icon, color, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <label className={`flex items-center gap-1.5 text-sm font-medium ${color}`}>
                <Icon className="w-4 h-4" />
                {label}
              </label>
              <BulletTextarea
                value={form[key]}
                onChange={(val) => updateField(key, val)}
                placeholder={placeholder}
                className="min-h-[80px] resize-none font-mono text-sm bg-muted/30 border-border/50 focus:bg-background transition-colors"
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
