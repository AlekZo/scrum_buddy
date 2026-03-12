import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import {
  PlanData,
  PlanTask,
  PlanTaskStatus,
  createPlanTask,
  getWeekDays,
  migratePlanTask,
} from "@/lib/plan-types";
import { getToday } from "@/lib/types";
import { parseTaskInput } from "@/lib/task-parser";
import { isAIConfigured, polishText } from "@/lib/ai-service";
import { stripActualHours } from "@/lib/text-sanitizer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChevronLeft,
  ChevronRight,
  Vault,
  Package,
  Plus,
  Trash2,
  GripVertical,
  Undo2,
  Wand2,
  ClipboardCopy,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const DAILY_CAPACITY = 8;
const HOUR_PX = 32; // compact: px per reported hour for card height

interface MatrixPlanningViewProps {
  project: string;
  planData: PlanData;
  onSaveTask: (task: PlanTask) => void;
  onRemoveTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, updates: Partial<PlanTask>) => void;
}

export function MatrixPlanningView({
  project,
  planData,
  onSaveTask,
  onRemoveTask,
  onUpdateTask,
}: MatrixPlanningViewProps) {
  const [currentWeekDate, setCurrentWeekDate] = useState(getToday());
  const [backlogOpen, setBacklogOpen] = useState(false);
  const [bufferOpen, setBufferOpen] = useState(false);
  const [addBacklogText, setAddBacklogText] = useState("");
  const addBacklogRef = useRef<HTMLInputElement>(null);

  const weekDays = useMemo(() => getWeekDays(currentWeekDate), [currentWeekDate]);
  const weekStart = weekDays[0];
  const weekEnd = weekDays[4];

  const shiftWeek = (dir: number) => {
    const d = new Date(currentWeekDate);
    d.setDate(d.getDate() + dir * 7);
    setCurrentWeekDate(d.toISOString().split("T")[0]);
  };

  // All project tasks
  const allTasks = useMemo(() => {
    return Object.values(planData.tasks)
      .map(migratePlanTask)
      .filter((t) => t.project === project);
  }, [planData, project]);

  const backlogTasks = useMemo(
    () => allTasks.filter((t) => t.status === "backlog"),
    [allTasks]
  );

  const bufferedTasks = useMemo(
    () => allTasks.filter((t) => t.status === "buffered"),
    [allTasks]
  );

  const bufferedHours = useMemo(
    () => bufferedTasks.reduce((s, t) => s + (t.reportedHours ?? t.teamHours), 0),
    [bufferedTasks]
  );

  // Tasks slotted into the current week's matrix
  const matrixTasks = useMemo(() => {
    const slotted: Record<string, PlanTask[]> = {};
    for (const day of weekDays) slotted[day] = [];
    for (const t of allTasks) {
      const status = t.status || "active";
      if (status === "backlog" || status === "buffered") continue;
      const slot = t.slotDay;
      if (slot && slotted[slot]) {
        slotted[slot].push(t);
      } else if (!slot) {
        for (const day of weekDays) {
          if (t.startDate <= day && t.endDate >= day) slotted[day].push(t);
        }
      }
    }
    return slotted;
  }, [allTasks, weekDays]);

  const dayHours = useMemo(() => {
    const result: Record<string, number> = {};
    for (const day of weekDays) {
      result[day] = (matrixTasks[day] || []).reduce(
        (sum, t) => sum + (t.reportedHours ?? t.teamHours),
        0
      );
    }
    return result;
  }, [matrixTasks, weekDays]);

  const formatDayHeader = (date: string) => {
    const d = new Date(date + "T00:00:00");
    return {
      weekday: d.toLocaleDateString("en", { weekday: "short" }),
      dayMonth: d.toLocaleDateString("en", { month: "short", day: "numeric" }),
    };
  };

  const isToday = (date: string) => date === getToday();

  // Add to backlog
  const handleAddBacklog = () => {
    const parsed = parseTaskInput(addBacklogText);
    if (!parsed.name) return;
    onSaveTask(
      createPlanTask(parsed.name, weekStart, weekStart, parsed.teamHours, project, parsed.actualHours, "backlog")
    );
    setAddBacklogText("");
    setTimeout(() => addBacklogRef.current?.focus(), 0);
  };

  const handleBankTask = useCallback(
    (taskId: string) => {
      onUpdateTask(taskId, { status: "buffered", slotDay: undefined });
      toast.success("Task banked! 🏦");
    },
    [onUpdateTask]
  );

  const handleUnbankTask = useCallback(
    (taskId: string) => {
      onUpdateTask(taskId, { status: "backlog" });
      toast.success("Task moved to backlog");
    },
    [onUpdateTask]
  );

  // Auto-fill a day to 8 hours from buffer
  const handleAutoFill = useCallback(
    (day: string) => {
      const current = dayHours[day] || 0;
      const remaining = DAILY_CAPACITY - current;
      if (remaining <= 0) {
        toast.info("Day is already at capacity!");
        return;
      }
      if (bufferedTasks.length === 0) {
        toast.info("Buffer Bank is empty — add tasks first");
        return;
      }

      let filled = 0;
      for (const task of bufferedTasks) {
        if (filled >= remaining) break;
        const hrs = task.reportedHours ?? task.teamHours;
        const assignHrs = Math.min(hrs, remaining - filled);
        onUpdateTask(task.id, {
          status: "reported",
          slotDay: day,
          startDate: day,
          endDate: day,
          reportedHours: assignHrs,
        });
        filled += assignHrs;
      }
      toast.success(`Auto-filled ${filled.toFixed(1)}h from buffer ✨`);
    },
    [dayHours, bufferedTasks, onUpdateTask]
  );

  // Copy standup for a specific day
  const handleCopyStandup = useCallback(
    async (day: string) => {
      const tasks = matrixTasks[day] || [];
      if (tasks.length === 0) {
        toast.info("No tasks for this day");
        return;
      }
      const lines = tasks.map((t) => {
        const hrs = t.reportedHours ?? t.teamHours;
        return `• ${t.text}${hrs > 0 ? ` - ${hrs}h` : ""}`;
      });
      const raw = lines.join("\n");

      // Try AI polish if configured
      let text = raw;
      if (isAIConfigured()) {
        try {
          text = await polishText(raw);
        } catch {
          // fallback to raw
        }
      }
      text = stripActualHours(text);

      try {
        await navigator.clipboard.writeText(text);
        toast.success("Standup copied! 📋");
      } catch {
        toast.error("Failed to copy");
      }
    },
    [matrixTasks]
  );

  // Resize task hours
  const handleResizeHours = useCallback(
    (taskId: string, newHours: number) => {
      const clamped = Math.max(0.25, Math.round(newHours * 4) / 4);
      onUpdateTask(taskId, { reportedHours: clamped });
    },
    [onUpdateTask]
  );

  // DnD handler
  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { draggableId, destination } = result;
      if (!destination) return;
      const destId = destination.droppableId;

      if (destId === "backlog") {
        onUpdateTask(draggableId, { status: "backlog", slotDay: undefined });
      } else if (destId === "buffer") {
        onUpdateTask(draggableId, { status: "buffered", slotDay: undefined });
      } else if (destId.startsWith("day-")) {
        const day = destId.replace("day-", "");
        onUpdateTask(draggableId, {
          status: "active",
          slotDay: day,
          startDate: day,
          endDate: day,
        });
      }
    },
    [onUpdateTask]
  );

  return (
    <TooltipProvider>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="space-y-3">
          {/* Top bar: week nav + drawer toggles */}
          <div className="flex items-center gap-2 flex-wrap">
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
              variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground"
              onClick={() => setCurrentWeekDate(getToday())}
            >
              This week
            </Button>

            <div className="ml-auto flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => setBacklogOpen(true)}
              >
                <Package className="w-3.5 h-3.5" />
                Backlog
                {backlogTasks.length > 0 && (
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-0.5">
                    {backlogTasks.length}
                  </Badge>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => setBufferOpen(true)}
              >
                <Vault className="w-3.5 h-3.5 text-success" />
                Buffer
                {bufferedTasks.length > 0 && (
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-0.5 bg-success/10 text-success">
                    {bufferedTasks.length} · {bufferedHours.toFixed(1)}h
                  </Badge>
                )}
              </Button>
            </div>
          </div>

          {/* ── DAY COLUMNS (the matrix) ── */}
          <div className="grid grid-cols-5 gap-2">
            {weekDays.map((day) => {
              const { weekday, dayMonth } = formatDayHeader(day);
              const tasks = matrixTasks[day] || [];
              const hours = dayHours[day] || 0;
              const capacityPct = Math.min(100, (hours / DAILY_CAPACITY) * 100);
              const isFull = hours >= DAILY_CAPACITY;
              const isOver = hours > DAILY_CAPACITY;
              const deficit = Math.max(0, DAILY_CAPACITY - hours);

              return (
                <Droppable key={day} droppableId={`day-${day}`}>
                  {(provided, snapshot) => (
                    <Card
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        "border-border/50 flex flex-col transition-all",
                        isToday(day) && "ring-1 ring-primary/40",
                        snapshot.isDraggingOver && "ring-2 ring-primary bg-primary/5"
                      )}
                    >
                      {/* Day header */}
                      <CardHeader className="px-2 py-1.5 pb-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-semibold">{weekday}</span>
                            <span className="text-[10px] text-muted-foreground">{dayMonth}</span>
                            {isToday(day) && (
                              <span className="text-[8px] font-mono bg-primary/10 text-primary px-1 rounded">NOW</span>
                            )}
                          </div>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[9px] font-mono px-1 py-0",
                              isFull && !isOver && "bg-success/15 text-success",
                              isOver && "bg-destructive/15 text-destructive"
                            )}
                          >
                            {hours.toFixed(1)}/{DAILY_CAPACITY}h
                          </Badge>
                        </div>
                        <Progress
                          value={capacityPct}
                          className={cn(
                            "h-1",
                            isOver && "[&>div]:bg-destructive",
                            isFull && !isOver && "[&>div]:bg-success"
                          )}
                        />
                        {/* Action buttons row */}
                        <div className="flex items-center gap-1 pt-0.5">
                          {deficit > 0 && bufferedTasks.length > 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => handleAutoFill(day)}
                                  className="p-0.5 rounded hover:bg-accent/20 transition-colors"
                                >
                                  <Wand2 className="w-3 h-3 text-primary" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="text-[10px]">
                                Auto-fill {deficit.toFixed(1)}h from buffer ✨
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {tasks.length > 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => handleCopyStandup(day)}
                                  className="p-0.5 rounded hover:bg-accent/20 transition-colors"
                                >
                                  <ClipboardCopy className="w-3 h-3 text-muted-foreground" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="text-[10px]">
                                📋 Copy standup
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </CardHeader>

                      {/* Task stack */}
                      <CardContent className="px-1.5 py-1 flex-1 space-y-0.5 min-h-[80px]">
                        {tasks.map((task, i) => (
                          <SlimTaskCard
                            key={task.id}
                            task={task}
                            index={i}
                            onRemove={onRemoveTask}
                            onBank={handleBankTask}
                            onResize={handleResizeHours}
                          />
                        ))}
                        {provided.placeholder}
                        {tasks.length === 0 && !snapshot.isDraggingOver && (
                          <div className="flex items-center justify-center h-16 text-muted-foreground/20">
                            <Plus className="w-4 h-4" />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </Droppable>
              );
            })}
          </div>
        </div>

        {/* ── BACKLOG DRAWER ── */}
        <Sheet open={backlogOpen} onOpenChange={setBacklogOpen}>
          <SheetContent side="left" className="w-72 p-4">
            <SheetHeader className="mb-3">
              <SheetTitle className="text-sm flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" />
                Backlog
              </SheetTitle>
              <SheetDescription className="text-[10px]">
                Drag tasks from here into day columns
              </SheetDescription>
            </SheetHeader>

            {/* Add input */}
            <div className="flex gap-1 mb-3">
              <Input
                ref={addBacklogRef}
                value={addBacklogText}
                onChange={(e) => setAddBacklogText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddBacklog()}
                placeholder="Add task - 2h"
                className="h-7 text-xs flex-1"
              />
              {addBacklogText.trim() && (
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleAddBacklog}>
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>

            <Droppable droppableId="backlog">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={cn(
                    "space-y-1 min-h-[100px] rounded-md p-1 transition-colors",
                    snapshot.isDraggingOver && "bg-primary/5 ring-1 ring-primary/20"
                  )}
                >
                  {backlogTasks.map((task, i) => (
                    <DrawerTaskCard
                      key={task.id}
                      task={task}
                      index={i}
                      variant="solid"
                      onRemove={onRemoveTask}
                      onBank={handleBankTask}
                    />
                  ))}
                  {provided.placeholder}
                  {backlogTasks.length === 0 && (
                    <p className="text-[10px] text-muted-foreground/50 text-center py-6">
                      No backlog tasks
                    </p>
                  )}
                </div>
              )}
            </Droppable>
          </SheetContent>
        </Sheet>

        {/* ── BUFFER BANK DRAWER ── */}
        <Sheet open={bufferOpen} onOpenChange={setBufferOpen}>
          <SheetContent side="left" className="w-72 p-4">
            <SheetHeader className="mb-3">
              <SheetTitle className="text-sm flex items-center gap-2">
                <Vault className="w-4 h-4 text-success" />
                Buffer Bank
                <Badge variant="secondary" className="text-[9px] bg-success/10 text-success">
                  {bufferedHours.toFixed(1)}h banked
                </Badge>
              </SheetTitle>
              <SheetDescription className="text-[10px]">
                Completed work ready for reporting
              </SheetDescription>
            </SheetHeader>

            <Droppable droppableId="buffer">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={cn(
                    "space-y-1 min-h-[100px] rounded-md p-1 transition-colors",
                    snapshot.isDraggingOver && "bg-success/5 ring-1 ring-success/20"
                  )}
                >
                  {bufferedTasks.map((task, i) => (
                    <DrawerTaskCard
                      key={task.id}
                      task={task}
                      index={i}
                      variant="ghost"
                      onRemove={onRemoveTask}
                      onUnbank={handleUnbankTask}
                    />
                  ))}
                  {provided.placeholder}
                  {bufferedTasks.length === 0 && (
                    <p className="text-[10px] text-muted-foreground/50 text-center py-6">
                      🏦 Bank completed tasks here
                    </p>
                  )}
                </div>
              )}
            </Droppable>
          </SheetContent>
        </Sheet>
      </DragDropContext>
    </TooltipProvider>
  );
}

/* ── Slim task card for day columns ── */

interface SlimTaskCardProps {
  task: PlanTask;
  index: number;
  onRemove: (id: string) => void;
  onBank: (id: string) => void;
  onResize: (id: string, newHours: number) => void;
}

function SlimTaskCard({ task, index, onRemove, onBank, onResize }: SlimTaskCardProps) {
  const reported = task.reportedHours ?? task.teamHours;
  const isGhost = task.status === "reported" || task.status === "buffered";
  const [resizing, setResizing] = useState(false);
  const resizeStartY = useRef(0);
  const resizeStartHours = useRef(0);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    resizeStartY.current = e.clientY;
    resizeStartHours.current = reported;

    const handleMove = (ev: MouseEvent) => {
      const deltaY = ev.clientY - resizeStartY.current;
      const deltaHours = deltaY / HOUR_PX;
      onResize(task.id, resizeStartHours.current + deltaHours);
    };
    const handleUp = () => {
      setResizing(false);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  // Height proportional to reported hours, min 28px
  const cardHeight = Math.max(28, reported * HOUR_PX);

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              ref={provided.innerRef}
              {...provided.draggableProps}
              {...provided.dragHandleProps}
              style={{
                ...provided.draggableProps.style,
                height: snapshot.isDragging ? undefined : cardHeight,
              }}
              className={cn(
                "group relative rounded text-[11px] cursor-grab overflow-hidden transition-all",
                isGhost
                  ? "bg-success/5 border border-dashed border-success/25 opacity-70"
                  : "bg-card border border-border/40 shadow-sm hover:border-primary/30",
                snapshot.isDragging && "shadow-lg ring-2 ring-primary/30 z-50",
                resizing && "ring-1 ring-accent"
              )}
            >
              <div className="px-1.5 py-1 flex items-center gap-1 h-full">
                <span className="flex-1 truncate font-mono leading-tight">
                  {reported > 0 && (
                    <span className="text-muted-foreground mr-1">{reported}h</span>
                  )}
                  {task.text}
                </span>
                {/* Hover actions */}
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  {!isGhost && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onBank(task.id); }}
                      className="p-0.5 hover:bg-success/10 rounded"
                    >
                      <Vault className="w-2.5 h-2.5 text-success" />
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemove(task.id); }}
                    className="p-0.5 hover:bg-destructive/10 rounded"
                  >
                    <Trash2 className="w-2.5 h-2.5 text-destructive/60" />
                  </button>
                </div>
              </div>
              {/* Resize handle */}
              <div
                className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100 hover:bg-primary/10 transition-opacity"
                onMouseDown={handleResizeStart}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-[10px] max-w-[200px]">
            <p className="font-semibold">{task.text}</p>
            <p className="text-muted-foreground">
              Reported: {reported}h
              {task.actualHours > 0 && task.actualHours !== reported && ` · Real: ${task.actualHours}h`}
            </p>
            {isGhost && <p className="text-success">↑ Buffered task</p>}
          </TooltipContent>
        </Tooltip>
      )}
    </Draggable>
  );
}

/* ── Drawer task card (backlog / buffer panels) ── */

interface DrawerTaskCardProps {
  task: PlanTask;
  index: number;
  variant: "solid" | "ghost";
  onRemove: (id: string) => void;
  onBank?: (id: string) => void;
  onUnbank?: (id: string) => void;
}

function DrawerTaskCard({ task, index, variant, onRemove, onBank, onUnbank }: DrawerTaskCardProps) {
  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={cn(
            "group flex items-center gap-1 px-2 py-1.5 rounded-md text-xs transition-all cursor-grab",
            variant === "solid"
              ? "bg-card border border-border/50 hover:border-primary/30 shadow-sm"
              : "bg-success/5 border border-dashed border-success/20 hover:border-success/40 opacity-75",
            snapshot.isDragging && "shadow-lg ring-2 ring-primary/30 rotate-1"
          )}
        >
          <GripVertical className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
          <span className="flex-1 truncate font-mono text-[11px]">{task.text}</span>
          {(task.reportedHours ?? task.teamHours) > 0 && (
            <Badge variant="secondary" className="text-[9px] px-1 py-0 font-mono flex-shrink-0">
              {(task.reportedHours ?? task.teamHours)}h
            </Badge>
          )}
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {onBank && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={() => onBank(task.id)} className="p-0.5 hover:bg-success/10 rounded">
                    <Vault className="w-3 h-3 text-success" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-[10px]">Bank it 🏦</TooltipContent>
              </Tooltip>
            )}
            {onUnbank && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={() => onUnbank(task.id)} className="p-0.5 hover:bg-muted rounded">
                    <Undo2 className="w-3 h-3 text-muted-foreground" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-[10px]">Move to backlog</TooltipContent>
              </Tooltip>
            )}
            <button onClick={() => onRemove(task.id)} className="p-0.5 hover:bg-destructive/10 rounded">
              <Trash2 className="w-3 h-3 text-destructive/60" />
            </button>
          </div>
        </div>
      )}
    </Draggable>
  );
}
