import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { PlanData, PlanTask, createPlanTask, getWeekDays, getWeekStart, getPlannedTasksForRange } from "@/lib/plan-types";
import { getToday } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

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
    const d = new Date(date);
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

  return (
    <div className="space-y-4">
      {/* Header with controls */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              Planning · {project}
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* View mode toggle */}
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
          {/* Week navigation */}
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

      {viewMode === "week" ? (
        <WeekGridView
          weekDays={weekDays}
          tasksForDay={tasksForDay}
          weekTasks={weekTasks}
          project={project}
          formatDayHeader={formatDayHeader}
          isToday={isToday}
          onSaveTask={onSaveTask}
          onRemoveTask={onRemoveTask}
          onUpdateTask={onUpdateTask}
        />
      ) : (
        <DayListView
          weekDays={weekDays}
          tasksForDay={tasksForDay}
          weekTasks={weekTasks}
          project={project}
          formatDayHeader={formatDayHeader}
          isToday={isToday}
          onSaveTask={onSaveTask}
          onRemoveTask={onRemoveTask}
          onUpdateTask={onUpdateTask}
        />
      )}
    </div>
  );
}

/* ─── Shared task row ─── */

interface TaskItemProps {
  task: PlanTask;
  isMultiDay: boolean;
  onUpdate: (taskId: string, updates: Partial<PlanTask>) => void;
  onRemove: (taskId: string) => void;
}

function TaskItem({ task, isMultiDay, onUpdate, onRemove }: TaskItemProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(task.text);
  const [hours, setHours] = useState(String(task.hours || ""));
  const [endDate, setEndDate] = useState(task.endDate);

  // Reset form when popover opens
  useEffect(() => {
    if (open) {
      setText(task.text);
      setHours(String(task.hours || ""));
      setEndDate(task.endDate);
    }
  }, [open, task]);

  const save = () => {
    onUpdate(task.id, {
      text: text.trim() || task.text,
      hours: parseFloat(hours) || 0,
      endDate,
    });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "group flex items-center gap-1.5 px-2 py-1 rounded text-xs hover:bg-muted/40 transition-colors",
          isMultiDay && "border-l-2 border-primary/60"
        )}
      >
        <GripVertical className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
        <PopoverTrigger asChild>
          <button className="flex-1 text-left truncate font-mono cursor-pointer">
            {task.text}
          </button>
        </PopoverTrigger>
        {task.hours > 0 && (
          <Badge variant="secondary" className="text-[9px] px-1 py-0 font-mono flex-shrink-0">
            {task.hours}h
          </Badge>
        )}
        {isMultiDay && (
          <Calendar className="w-3 h-3 text-primary/60 flex-shrink-0" />
        )}
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(task.id);
          }}
        >
          <Trash2 className="w-3 h-3 text-destructive/70" />
        </button>
      </div>

      <PopoverContent className="w-56 p-2 space-y-1.5" side="right" align="start">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          className="h-7 text-xs"
          placeholder="Task name"
          autoFocus
        />
        <div className="flex gap-1.5">
          <Input
            type="number"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="hrs"
            className="h-7 text-xs w-16"
            step="0.5"
          />
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-7 text-xs flex-1"
            min={task.startDate}
          />
        </div>
        <div className="flex justify-between">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => {
              onRemove(task.id);
              setOpen(false);
            }}
          >
            <Trash2 className="w-3 h-3 text-destructive" />
          </Button>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setOpen(false)}>
              ✕
            </Button>
            <Button size="sm" className="h-6 text-[10px] px-2.5" onClick={save}>
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ─── Add task input ─── */

interface AddTaskProps {
  date: string;
  project: string;
  onSave: (task: PlanTask) => void;
}

function AddTaskInput({ date, project, onSave }: AddTaskProps) {
  const [text, setText] = useState("");

  const handleAdd = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSave(createPlanTask(trimmed, date, date, 0, project));
    setText("");
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        placeholder="Add task..."
        className="h-7 text-xs flex-1"
      />
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleAdd}>
        <Plus className="w-3.5 h-3.5" />
      </Button>
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
}: ViewProps) {
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [multiTaskText, setMultiTaskText] = useState("");
  const [multiTaskHours, setMultiTaskHours] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleMouseDown = (date: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-task-item], input, button, [data-radix-popper-content-wrapper]")) return;
    e.preventDefault();
    setIsDragging(true);
    setSelectedDays(new Set([date]));
  };

  const handleMouseEnter = (date: string) => {
    if (!isDragging) return;
    setSelectedDays((prev) => new Set([...prev, date]));
  };

  useEffect(() => {
    const up = () => {
      if (isDragging) {
        setIsDragging(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [isDragging]);

  const handleAddMultiTask = () => {
    const trimmed = multiTaskText.trim();
    if (!trimmed || selectedDays.size === 0) return;
    const hours = parseFloat(multiTaskHours) || 0;
    const sorted = [...selectedDays].sort();
    const startDate = sorted[0];
    const endDate = sorted[sorted.length - 1];

    // Check contiguous
    const allContiguous = sorted.every((d, i) => {
      if (i === 0) return true;
      const prev = new Date(sorted[i - 1]);
      const curr = new Date(d);
      const diff = (curr.getTime() - prev.getTime()) / 86400000;
      return diff === 1 || (diff <= 3 && prev.getDay() === 5);
    });

    if (allContiguous && sorted.length > 1) {
      onSaveTask(createPlanTask(trimmed, startDate, endDate, hours, project));
    } else {
      for (const date of sorted) {
        onSaveTask(createPlanTask(trimmed, date, date, hours, project));
      }
    }

    setMultiTaskText("");
    setMultiTaskHours("");
    setSelectedDays(new Set());
    toast.success(`Added "${trimmed}" to ${sorted.length} day${sorted.length > 1 ? "s" : ""}`);
  };

  const clearSelection = () => {
    setSelectedDays(new Set());
    setMultiTaskText("");
    setMultiTaskHours("");
  };

  return (
    <div className="space-y-2">
      {/* Multi-select toolbar */}
      {selectedDays.size > 0 && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20 animate-in fade-in slide-in-from-top-1">
          <Badge variant="secondary" className="text-[10px] font-mono flex-shrink-0">
            {selectedDays.size} day{selectedDays.size > 1 ? "s" : ""}
          </Badge>
          <Input
            ref={inputRef}
            value={multiTaskText}
            onChange={(e) => setMultiTaskText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddMultiTask();
              if (e.key === "Escape") clearSelection();
            }}
            placeholder="Task name..."
            className="h-7 text-xs flex-1"
          />
          <Input
            value={multiTaskHours}
            onChange={(e) => setMultiTaskHours(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddMultiTask();
              if (e.key === "Escape") clearSelection();
            }}
            placeholder="hrs"
            type="number"
            step="0.5"
            className="h-7 text-xs w-16"
          />
          <Button size="sm" className="h-7 text-xs gap-1" onClick={handleAddMultiTask}>
            <Plus className="w-3 h-3" /> Add
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={clearSelection} title="Clear selection">
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {selectedDays.size === 0 && (
        <p className="text-[10px] text-muted-foreground">
          Drag across days to select multiple, then add a task to all at once.
        </p>
      )}

      <div className="grid grid-cols-5 gap-2 select-none">
        {weekDays.map((date) => {
          const { weekday, dayMonth } = formatDayHeader(date);
          const tasks = tasksForDay(date);
          const hasTasks = tasks.length > 0;
          const isSelected = selectedDays.has(date);

          return (
            <Card
              key={date}
              className={cn(
                "border-border/50 min-h-[200px] transition-all",
                isToday(date) && "ring-1 ring-primary/40",
                hasTasks && !isSelected && "border-primary/20",
                isSelected && "ring-2 ring-primary bg-primary/5 border-primary/40",
                !isSelected && "cursor-crosshair"
              )}
              onMouseDown={(e) => handleMouseDown(date, e)}
              onMouseEnter={() => handleMouseEnter(date)}
            >
              <CardHeader className="p-2 pb-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold">{weekday}</span>
                    <span className="text-[10px] text-muted-foreground">{dayMonth}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full bg-primary animate-in zoom-in" />
                    )}
                    {hasTasks && !isSelected && (
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                  </div>
                </div>
                {isToday(date) && (
                  <span className="text-[9px] font-mono bg-primary/10 text-primary px-1 rounded w-fit">
                    TODAY
                  </span>
                )}
              </CardHeader>
              <CardContent className="p-2 pt-0 space-y-1">
                {tasks.map((task) => (
                  <div key={task.id} data-task-item>
                    <TaskItem
                      task={task}
                      isMultiDay={task.startDate !== task.endDate}
                      onUpdate={onUpdateTask}
                      onRemove={onRemoveTask}
                    />
                  </div>
                ))}
                <AddTaskInput date={date} project={project} onSave={onSaveTask} />
              </CardContent>
            </Card>
          );
        })}
      </div>
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
}: ViewProps) {
  return (
    <div className="space-y-3">
      {weekDays.map((date) => {
        const { weekday, dayMonth } = formatDayHeader(date);
        const tasks = tasksForDay(date);
        const hasTasks = tasks.length > 0;

        return (
          <Card
            key={date}
            className={cn(
              "border-border/50",
              isToday(date) && "ring-1 ring-primary/40",
              hasTasks && "border-primary/20"
            )}
          >
            <CardHeader className="p-3 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{weekday}</span>
                <span className="text-xs text-muted-foreground">{dayMonth}</span>
                {isToday(date) && (
                  <span className="text-[9px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    TODAY
                  </span>
                )}
                {hasTasks && (
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-1">
              {tasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  isMultiDay={task.startDate !== task.endDate}
                  onUpdate={onUpdateTask}
                  onRemove={onRemoveTask}
                />
              ))}
              <AddTaskInput date={date} project={project} onSave={onSaveTask} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
