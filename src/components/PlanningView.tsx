import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { parseTaskInput } from "@/lib/task-parser";
import { PlanData, PlanTask, createPlanTask, getWeekDays, getWeekStart, getPlannedTasksForRange } from "@/lib/plan-types";
import { getToday } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Plus,
  Trash2,
  GripVertical,
  Calendar,
  X,
  Clock,
  Settings2,
  Type,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface PlanningViewProps {
  project: string;
  planData: PlanData;
  onSaveTask: (task: PlanTask) => void;
  onRemoveTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, updates: Partial<PlanTask>) => void;
}

type ViewMode = "week" | "list";
const VIEW_MODE_KEY = "planning-view-mode";

export function PlanningView({ project, planData, onSaveTask, onRemoveTask, onUpdateTask }: PlanningViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) || "week";
  });
  const [currentWeekDate, setCurrentWeekDate] = useState(getToday());
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [bulkTeamHours, setBulkTeamHours] = useState("");
  const [bulkActualHours, setBulkActualHours] = useState("");
  const [bulkRenameText, setBulkRenameText] = useState("");
  const lastCheckedRef = useRef<string | null>(null);

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    setSelectedTaskIds(new Set());
  }, [project, currentWeekDate]);

  const weekDays = useMemo(() => getWeekDays(currentWeekDate), [currentWeekDate]);
  const weekStart = weekDays[0];
  const weekEnd = weekDays[4];

  const weekTasks = useMemo(
    () => getPlannedTasksForRange(planData, project, weekStart, weekEnd),
    [planData, project, weekStart, weekEnd]
  );

  const shiftWeek = (dir: number) => {
    const d = new Date(currentWeekDate);
    d.setDate(d.getDate() + dir * 7);
    setCurrentWeekDate(d.toISOString().split("T")[0]);
  };

  const formatDayHeader = (date: string) => {
    const d = new Date(date + "T00:00:00");
    return {
      weekday: d.toLocaleDateString("en", { weekday: "short" }),
      dayMonth: d.toLocaleDateString("en", { month: "short", day: "numeric" }),
    };
  };

  const isToday = (date: string) => date === getToday();

  const tasksForDay = useCallback(
    (date: string) =>
      weekTasks.filter((t) => t.startDate <= date && t.endDate >= date),
    [weekTasks]
  );

  // Shift-click range select
  const handleToggleTask = useCallback((taskId: string, shiftKey?: boolean) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastCheckedRef.current) {
        // Find range between last checked and current
        const allIds = weekTasks.map(t => t.id);
        const lastIdx = allIds.indexOf(lastCheckedRef.current);
        const currIdx = allIds.indexOf(taskId);
        if (lastIdx !== -1 && currIdx !== -1) {
          const [start, end] = lastIdx < currIdx ? [lastIdx, currIdx] : [currIdx, lastIdx];
          for (let i = start; i <= end; i++) {
            next.add(allIds[i]);
          }
        }
      } else {
        if (next.has(taskId)) next.delete(taskId);
        else next.add(taskId);
      }
      lastCheckedRef.current = taskId;
      return next;
    });
  }, [weekTasks]);

  const selectAllWeekTasks = useCallback(() => {
    setSelectedTaskIds(new Set(weekTasks.map((t) => t.id)));
  }, [weekTasks]);

  const clearSelection = useCallback(() => {
    setSelectedTaskIds(new Set());
  }, []);

  const handleBulkDelete = () => {
    const count = selectedTaskIds.size;
    if (count === 0) return;
    selectedTaskIds.forEach((id) => onRemoveTask(id));
    setSelectedTaskIds(new Set());
    toast.success(`Deleted ${count} task${count > 1 ? "s" : ""}`);
  };

  const handleBulkUpdateHours = () => {
    const updates: Partial<PlanTask> = {};
    if (bulkTeamHours !== "") updates.teamHours = parseFloat(bulkTeamHours) || 0;
    if (bulkActualHours !== "") updates.actualHours = parseFloat(bulkActualHours) || 0;
    if (Object.keys(updates).length === 0) return;
    selectedTaskIds.forEach((id) => onUpdateTask(id, updates));
    toast.success(`Updated hours on ${selectedTaskIds.size} task${selectedTaskIds.size > 1 ? "s" : ""}`);
    setBulkTeamHours("");
    setBulkActualHours("");
  };

  const handleBulkRename = () => {
    const trimmed = bulkRenameText.trim();
    if (!trimmed) return;
    selectedTaskIds.forEach((id) => onUpdateTask(id, { text: trimmed }));
    toast.success(`Renamed ${selectedTaskIds.size} task${selectedTaskIds.size > 1 ? "s" : ""}`);
    setBulkRenameText("");
  };

  // Drag & drop: move task to a different day
  const handleDropOnDay = useCallback((taskId: string, targetDate: string) => {
    const task = weekTasks.find(t => t.id === taskId);
    if (!task) return;
    const duration = Math.round(
      (new Date(task.endDate).getTime() - new Date(task.startDate).getTime()) / 86400000
    );
    const newEnd = new Date(targetDate + "T12:00:00");
    newEnd.setDate(newEnd.getDate() + duration);
    const endStr = newEnd.toISOString().split("T")[0];
    onUpdateTask(taskId, { startDate: targetDate, endDate: endStr });
  }, [weekTasks, onUpdateTask]);

  const viewProps: ViewProps = {
    weekDays,
    tasksForDay,
    weekTasks,
    project,
    formatDayHeader,
    isToday,
    onSaveTask,
    onRemoveTask,
    onUpdateTask,
    selectedTaskIds,
    onToggleTask: handleToggleTask,
    onDropOnDay: handleDropOnDay,
  };

  const hasSelection = selectedTaskIds.size > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              Planning · {project}
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-md border border-border/50 overflow-hidden">
                <button
                  onClick={() => setViewMode("week")}
                  className={cn(
                    "px-2.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1",
                    viewMode === "week"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card hover:bg-muted text-muted-foreground"
                  )}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Week
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "px-2.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1",
                    viewMode === "list"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card hover:bg-muted text-muted-foreground"
                  )}
                >
                  <List className="w-3.5 h-3.5" />
                  List
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftWeek(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium text-muted-foreground">
              {new Date(weekStart).toLocaleDateString("en", { month: "short", day: "numeric" })}
              {" — "}
              {new Date(weekEnd).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftWeek(1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 text-muted-foreground"
              onClick={() => setCurrentWeekDate(getToday())}
            >
              This week
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Bulk actions toolbar — appears when tasks are selected */}
      {hasSelection && (
        <Card className="border-primary/30 bg-primary/5 animate-in slide-in-from-top-2 fade-in duration-200">
          <CardContent className="p-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="secondary" className="font-mono text-xs">
                {selectedTaskIds.size} selected
              </Badge>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={selectAllWeekTasks}>
                  Select all ({weekTasks.length})
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearSelection}>
                  Clear
                </Button>
              </div>
              <div className="h-5 w-px bg-border" />
              {/* Bulk rename */}
              <div className="flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={bulkRenameText}
                  onChange={(e) => setBulkRenameText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleBulkRename()}
                  placeholder="Rename to..."
                  className="h-7 text-xs w-32"
                />
                <Button
                  size="sm" variant="secondary" className="h-7 text-xs"
                  onClick={handleBulkRename}
                  disabled={!bulkRenameText.trim()}
                >
                  Rename
                </Button>
              </div>
              <div className="h-5 w-px bg-border" />
              {/* Bulk hours */}
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="number" step="0.25" min="0.25"
                  placeholder="Team hrs"
                  value={bulkTeamHours}
                  onChange={(e) => setBulkTeamHours(e.target.value)}
                  className="h-7 text-xs w-20"
                />
                <Input
                  type="number" step="0.25" min="0.25"
                  placeholder="Actual hrs"
                  value={bulkActualHours}
                  onChange={(e) => setBulkActualHours(e.target.value)}
                  className="h-7 text-xs w-20"
                />
                <Button
                  size="sm" variant="secondary" className="h-7 text-xs"
                  onClick={handleBulkUpdateHours}
                  disabled={bulkTeamHours === "" && bulkActualHours === ""}
                >
                  Set hours
                </Button>
              </div>
              <div className="h-5 w-px bg-border" />
              <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" onClick={handleBulkDelete}>
                <Trash2 className="w-3 h-3" />
                Delete ({selectedTaskIds.size})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {viewMode === "week" ? (
        <WeekGridView {...viewProps} />
      ) : (
        <DayListView {...viewProps} />
      )}
    </div>
  );
}

/* ─── Inline-editable task row ─── */

interface TaskItemProps {
  task: PlanTask;
  isMultiDay: boolean;
  onUpdate: (taskId: string, updates: Partial<PlanTask>) => void;
  onRemove: (taskId: string) => void;
  isSelected?: boolean;
  onToggle?: (taskId: string, shiftKey?: boolean) => void;
}

function TaskItem({ task, isMultiDay, onUpdate, onRemove, isSelected, onToggle }: TaskItemProps) {
  const [editingName, setEditingName] = useState(false);
  const [editingHours, setEditingHours] = useState(false);
  const [nameValue, setNameValue] = useState(task.text);
  const [hoursValue, setHoursValue] = useState(String(task.teamHours || ""));
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailActualHours, setDetailActualHours] = useState(String(task.actualHours || ""));
  const [detailEndDate, setDetailEndDate] = useState(task.endDate);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const hoursInputRef = useRef<HTMLInputElement>(null);

  // Sync from prop when task changes externally
  useEffect(() => {
    if (!editingName) setNameValue(task.text);
  }, [task.text, editingName]);
  useEffect(() => {
    if (!editingHours) setHoursValue(String(task.teamHours || ""));
  }, [task.teamHours, editingHours]);

  const commitName = () => {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== task.text) {
      onUpdate(task.id, { text: trimmed });
    } else {
      setNameValue(task.text);
    }
    setEditingName(false);
  };

  const commitHours = () => {
    const val = parseFloat(hoursValue);
    if (!isNaN(val) && val !== task.teamHours) {
      onUpdate(task.id, { teamHours: val });
    } else {
      setHoursValue(String(task.teamHours || ""));
    }
    setEditingHours(false);
  };

  const saveDetail = () => {
    onUpdate(task.id, {
      actualHours: parseFloat(detailActualHours) || 0,
      endDate: detailEndDate,
    });
    setDetailOpen(false);
  };

  useEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editingName]);

  useEffect(() => {
    if (editingHours) {
      hoursInputRef.current?.focus();
      hoursInputRef.current?.select();
    }
  }, [editingHours]);

  useEffect(() => {
    if (detailOpen) {
      setDetailActualHours(String(task.actualHours || ""));
      setDetailEndDate(task.endDate);
    }
  }, [detailOpen, task.actualHours, task.endDate]);

  const displayHours = task.teamHours > 0 || task.actualHours > 0;
  const hoursLabel = task.teamHours > 0 && task.actualHours > 0
    ? `${task.teamHours}/${task.actualHours}h`
    : task.teamHours > 0
    ? `${task.teamHours}h`
    : task.actualHours > 0
    ? `~${task.actualHours}h`
    : "";

  return (
    <div
      className={cn(
        "group/task flex items-center gap-1 px-1.5 py-1 rounded text-xs transition-colors",
        "hover:bg-muted/40",
        isMultiDay && "border-l-2 border-primary/60",
        isSelected && "bg-primary/10 ring-1 ring-primary/30"
      )}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      {/* Checkbox: shown on hover or when selected */}
      <div className={cn(
        "flex-shrink-0 w-5 h-5 flex items-center justify-center",
        !isSelected && "opacity-0 group-hover/task:opacity-100 transition-opacity"
      )}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => {}}
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.(task.id, e.shiftKey);
          }}
          className="w-3.5 h-3.5"
        />
      </div>

      {/* Drag handle — visible when not hovering checkbox */}
      <GripVertical className={cn(
        "w-3 h-3 text-muted-foreground/30 flex-shrink-0 cursor-grab",
        "opacity-0 group-hover/task:opacity-100 transition-opacity",
        isSelected && "hidden"
      )} />

      {/* Task name — inline editable */}
      {editingName ? (
        <input
          ref={nameInputRef}
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitName();
            if (e.key === "Escape") { setNameValue(task.text); setEditingName(false); }
          }}
          className="flex-1 bg-transparent border-b border-primary/40 outline-none font-mono text-xs py-0.5 px-0"
        />
      ) : (
        <span
          className="flex-1 truncate font-mono cursor-text hover:text-primary transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            setEditingName(true);
          }}
        >
          {task.text}
        </span>
      )}

      {/* Hours badge — inline editable */}
      {editingHours ? (
        <input
          ref={hoursInputRef}
          type="number"
          step="0.25"
          min="0.25"
          value={hoursValue}
          onChange={(e) => setHoursValue(e.target.value)}
          onBlur={commitHours}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitHours();
            if (e.key === "Escape") { setHoursValue(String(task.teamHours || "")); setEditingHours(false); }
          }}
          className="w-12 bg-secondary/50 border border-border/50 rounded text-[10px] font-mono text-center outline-none focus:ring-1 focus:ring-primary/50 py-0.5"
        />
      ) : displayHours ? (
        <Badge
          variant="secondary"
          className="text-[9px] px-1 py-0 font-mono flex-shrink-0 cursor-pointer hover:bg-secondary/80"
          onClick={(e) => {
            e.stopPropagation();
            setEditingHours(true);
          }}
        >
          {hoursLabel}
        </Badge>
      ) : (
        <span
          className="text-[9px] text-muted-foreground/50 opacity-0 group-hover/task:opacity-100 cursor-pointer px-1"
          onClick={(e) => {
            e.stopPropagation();
            setEditingHours(true);
          }}
        >
          +hrs
        </span>
      )}

      {isMultiDay && (
        <Calendar className="w-3 h-3 text-primary/60 flex-shrink-0" />
      )}

      {/* Detail popover for advanced edits */}
      <Popover open={detailOpen} onOpenChange={setDetailOpen}>
        <PopoverTrigger asChild>
          <button
            className="opacity-0 group-hover/task:opacity-100 transition-opacity flex-shrink-0 p-0.5 rounded hover:bg-muted"
            onClick={(e) => e.stopPropagation()}
          >
            <Settings2 className="w-3 h-3 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2 space-y-2" align="end">
          <p className="text-[10px] font-semibold text-muted-foreground">Advanced</p>
          <div className="flex gap-1.5 items-center">
            <Label className="text-[9px] text-muted-foreground w-12 shrink-0">Actual</Label>
            <Input
              type="number" step="0.25" min="0.25"
              value={detailActualHours}
              onChange={(e) => setDetailActualHours(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveDetail()}
              placeholder="hrs"
              className="h-7 text-xs flex-1"
            />
          </div>
          <div className="flex gap-1.5 items-center">
            <Label className="text-[9px] text-muted-foreground w-12 shrink-0">End</Label>
            <Input
              type="date"
              value={detailEndDate}
              onChange={(e) => setDetailEndDate(e.target.value)}
              className="h-7 text-xs flex-1"
              min={task.startDate}
            />
          </div>
          <div className="flex justify-between">
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
              onClick={() => { onRemove(task.id); setDetailOpen(false); }}
            >
              <Trash2 className="w-3 h-3 text-destructive" />
            </Button>
            <Button size="sm" className="h-6 text-[10px] px-2.5" onClick={saveDetail}>
              Save
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Delete button */}
      <button
        className="opacity-0 group-hover/task:opacity-100 transition-opacity flex-shrink-0 p-0.5"
        onClick={(e) => { e.stopPropagation(); onRemove(task.id); }}
      >
        <Trash2 className="w-3 h-3 text-destructive/70" />
      </button>
    </div>
  );
}

/* ─── Quick add input (top-positioned, continuous entry) ─── */

interface AddTaskProps {
  date: string;
  project: string;
  onSave: (task: PlanTask) => void;
}

function AddTaskInput({ date, project, onSave }: AddTaskProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    const parsed = parseTaskInput(text);
    if (!parsed.name) return;
    onSave(createPlanTask(parsed.name, date, date, parsed.teamHours, project, parsed.actualHours));
    setText("");
    // Keep focus for continuous entry
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        placeholder="Add task... (e.g. review - 2h)"
        className="h-7 text-xs flex-1"
      />
      {text.trim() && (
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleAdd}>
          <Plus className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}

/* ─── Week Grid ─── */

interface ViewProps {
  weekDays: string[];
  tasksForDay: (date: string) => PlanTask[];
  weekTasks: PlanTask[];
  project: string;
  formatDayHeader: (date: string) => { weekday: string; dayMonth: string };
  isToday: (date: string) => boolean;
  onSaveTask: (task: PlanTask) => void;
  onRemoveTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, updates: Partial<PlanTask>) => void;
  selectedTaskIds: Set<string>;
  onToggleTask: (taskId: string, shiftKey?: boolean) => void;
  onDropOnDay: (taskId: string, targetDate: string) => void;
}

function WeekGridView({
  weekDays,
  tasksForDay,
  project,
  formatDayHeader,
  isToday,
  onSaveTask,
  onRemoveTask,
  onUpdateTask,
  selectedTaskIds,
  onToggleTask,
  onDropOnDay,
}: ViewProps) {
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const [multiTaskText, setMultiTaskText] = useState("");
  const [multiTaskHours, setMultiTaskHours] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  // Contextual popover position
  const [floatingPos, setFloatingPos] = useState<{ x: number; y: number } | null>(null);
  const floatingRef = useRef<HTMLDivElement>(null);
  const floatingInputRef = useRef<HTMLInputElement>(null);

  const handleMouseDown = (date: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-task-item], input, button, [data-radix-popper-content-wrapper]")) return;
    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    setSelectedDays(new Set([date]));
    setFloatingPos(null);
  };

  const handleMouseEnter = (date: string) => {
    if (!isDraggingRef.current) return;
    setSelectedDays((prev) => new Set([...prev, date]));
  };

  useEffect(() => {
    const up = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
        // Show contextual floating popover at mouse position
        setFloatingPos({ x: e.clientX, y: e.clientY });
        setTimeout(() => floatingInputRef.current?.focus(), 50);
      }
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  // Close floating popover on click outside
  useEffect(() => {
    if (!floatingPos) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (floatingRef.current && !floatingRef.current.contains(e.target as Node)) {
        setFloatingPos(null);
        setSelectedDays(new Set());
      }
    };
    setTimeout(() => document.addEventListener("mousedown", handleClickOutside), 100);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [floatingPos]);

  const handleAddMultiTask = () => {
    const rawText = multiTaskText.trim();
    if (!rawText || selectedDays.size === 0) return;

    // Parse hours from text (like Log view: "task - 2h" or "task - 1h/3h")
    const parsed = parseTaskInput(rawText);
    const name = parsed.name || rawText;
    // Explicit hours field overrides parsed hours
    const explicitHours = parseFloat(multiTaskHours);
    const teamHours = !isNaN(explicitHours) && explicitHours > 0 ? explicitHours : parsed.teamHours;
    const actualHours = parsed.actualHours;

    const sorted = [...selectedDays].sort();
    const startDate = sorted[0];
    const endDate = sorted[sorted.length - 1];

    const allContiguous = sorted.every((d, i) => {
      if (i === 0) return true;
      const prev = new Date(sorted[i - 1]);
      const curr = new Date(d);
      const diff = (curr.getTime() - prev.getTime()) / 86400000;
      return diff === 1 || (diff <= 3 && prev.getDay() === 5);
    });

    if (allContiguous && sorted.length > 1) {
      onSaveTask(createPlanTask(name, startDate, endDate, teamHours, project, actualHours));
    } else {
      for (const date of sorted) {
        onSaveTask(createPlanTask(name, date, date, teamHours, project, actualHours));
      }
    }

    setMultiTaskText("");
    setMultiTaskHours("");
    setSelectedDays(new Set());
    setFloatingPos(null);
    toast.success(`Added "${name}" to ${sorted.length} day${sorted.length > 1 ? "s" : ""}`);
  };

  const clearSelection = () => {
    setSelectedDays(new Set());
    setMultiTaskText("");
    setMultiTaskHours("");
    setFloatingPos(null);
  };

  // Drag & drop handlers for task movement
  const handleDragOver = (e: React.DragEvent, date: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDay(date);
  };

  const handleDragLeave = () => {
    setDragOverDay(null);
  };

  const handleDrop = (e: React.DragEvent, date: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) {
      onDropOnDay(taskId, date);
    }
    setDragOverDay(null);
  };

  return (
    <div className="space-y-2">
      {/* Hint text */}
      {selectedDays.size === 0 && (
        <p className="text-[10px] text-muted-foreground py-1">
          Click a task name to edit inline · Drag tasks between days · Drag across empty day areas to multi-add
        </p>
      )}

      {/* Day columns */}
      <div
        className="grid gap-2 select-none"
        style={{ gridTemplateColumns: `repeat(${weekDays.length}, minmax(0, 1fr))` }}
      >
        {weekDays.map((date) => {
          const { weekday, dayMonth } = formatDayHeader(date);
          const tasks = tasksForDay(date);
          const hasTasks = tasks.length > 0;
          const isSelected = selectedDays.has(date);
          const isDragTarget = dragOverDay === date;

          return (
            <Card
              key={date}
              className={cn(
                "border-border/50 min-h-[200px] transition-all",
                isToday(date) && "ring-1 ring-primary/40",
                hasTasks && !isSelected && "border-primary/20",
                isSelected && "ring-2 ring-primary bg-primary/5 border-primary/40",
                isDragTarget && "ring-2 ring-accent bg-accent/10",
                !isSelected && "cursor-crosshair"
              )}
              onMouseDown={(e) => handleMouseDown(date, e)}
              onMouseEnter={() => handleMouseEnter(date)}
              onDragOver={(e) => handleDragOver(e, date)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, date)}
            >
              <CardHeader className="p-2 pb-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold">{weekday}</span>
                    <span className="text-[10px] text-muted-foreground">{dayMonth}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {isSelected && <div className="w-2 h-2 rounded-full bg-primary animate-in zoom-in" />}
                    {hasTasks && !isSelected && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                  </div>
                </div>
                {isToday(date) && (
                  <span className="text-[9px] font-mono bg-primary/10 text-primary px-1 rounded w-fit">TODAY</span>
                )}
              </CardHeader>
              <CardContent className="p-2 pt-0 space-y-0.5">
                {/* Quick add at TOP */}
                <AddTaskInput date={date} project={project} onSave={onSaveTask} />
                {tasks.map((task) => (
                  <div key={task.id} data-task-item>
                    <TaskItem
                      task={task}
                      isMultiDay={task.startDate !== task.endDate}
                      onUpdate={onUpdateTask}
                      onRemove={onRemoveTask}
                      isSelected={selectedTaskIds.has(task.id)}
                      onToggle={onToggleTask}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Contextual floating popover after drag-select */}
      {floatingPos && selectedDays.size > 0 && (
        <div
          ref={floatingRef}
          className="fixed z-50 bg-popover border border-border rounded-lg shadow-lg p-3 space-y-2 animate-in fade-in zoom-in-95 duration-150"
          style={{
            left: Math.min(floatingPos.x, window.innerWidth - 280),
            top: Math.min(floatingPos.y + 8, window.innerHeight - 120),
            width: 260,
          }}
        >
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px] font-mono">
              {selectedDays.size} day{selectedDays.size > 1 ? "s" : ""}
            </Badge>
            <button onClick={clearSelection} className="ml-auto p-0.5 hover:bg-muted rounded">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
          <Input
            ref={floatingInputRef}
            value={multiTaskText}
            onChange={(e) => setMultiTaskText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddMultiTask();
              if (e.key === "Escape") clearSelection();
            }}
            placeholder="e.g. Review - 2h or API - 1h/3h"
            className="h-8 text-xs"
          />
          <div className="flex gap-1.5">
            <Input
              value={multiTaskHours}
              onChange={(e) => setMultiTaskHours(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddMultiTask();
                if (e.key === "Escape") clearSelection();
              }}
              placeholder="hrs"
              type="number" step="0.25" min="0.25"
              className="h-8 text-xs w-20"
            />
            <Button size="sm" className="h-8 text-xs gap-1 flex-1" onClick={handleAddMultiTask}>
              <Plus className="w-3 h-3" /> Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Day List ─── */

function DayListView({
  weekDays,
  tasksForDay,
  project,
  formatDayHeader,
  isToday,
  onSaveTask,
  onRemoveTask,
  onUpdateTask,
  selectedTaskIds,
  onToggleTask,
  onDropOnDay,
}: ViewProps) {
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {weekDays.map((date) => {
        const { weekday, dayMonth } = formatDayHeader(date);
        const tasks = tasksForDay(date);
        const hasTasks = tasks.length > 0;
        const isDragTarget = dragOverDay === date;

        return (
          <Card
            key={date}
            className={cn(
              "border-border/50",
              isToday(date) && "ring-1 ring-primary/40",
              hasTasks && "border-primary/20",
              isDragTarget && "ring-2 ring-accent bg-accent/10"
            )}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverDay(date); }}
            onDragLeave={() => setDragOverDay(null)}
            onDrop={(e) => {
              e.preventDefault();
              const taskId = e.dataTransfer.getData("text/plain");
              if (taskId) onDropOnDay(taskId, date);
              setDragOverDay(null);
            }}
          >
            <CardHeader className="p-3 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{weekday}</span>
                <span className="text-xs text-muted-foreground">{dayMonth}</span>
                {isToday(date) && (
                  <span className="text-[9px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">TODAY</span>
                )}
                {hasTasks && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-0.5">
              {/* Quick add at TOP */}
              <AddTaskInput date={date} project={project} onSave={onSaveTask} />
              {tasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  isMultiDay={task.startDate !== task.endDate}
                  onUpdate={onUpdateTask}
                  onRemove={onRemoveTask}
                  isSelected={selectedTaskIds.has(task.id)}
                  onToggle={onToggleTask}
                />
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
