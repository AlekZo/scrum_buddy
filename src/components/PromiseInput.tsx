import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Promise } from "@/lib/promise-types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HandHeart, Plus, Trash2, CalendarClock, Pencil, Check, X, ChevronDown, Undo2 } from "lucide-react";

interface PromiseInputProps {
  activePromises: Promise[];
  completedPromises: Promise[];
  onAdd: (text: string, project?: string) => void;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
  onUpdate: (id: string, text: string) => void;
  onUpdateDeadline: (id: string, deadline: string) => void;
  onRemove: (id: string) => void;
  project?: string;
}

export function PromiseInput({
  activePromises, completedPromises, onAdd, onComplete, onUncomplete, onUpdate, onUpdateDeadline, onRemove, project,
}: PromiseInputProps) {
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [showDone, setShowDone] = useState(false);

  const handleAdd = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onAdd(trimmed, project);
    setInput("");
  };

  const startEdit = (p: Promise) => {
    setEditingId(p.id);
    setEditText(p.text);
  };

  const saveEdit = () => {
    if (editingId && editText.trim()) {
      onUpdate(editingId, editText.trim());
    }
    setEditingId(null);
    setEditText("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const projectFilter = (p: Promise) => !project || !p.project || p.project === project;
  const filteredActive = activePromises.filter(projectFilter);
  const filteredDone = completedPromises.filter(projectFilter);

  const isOverdue = (deadline: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(deadline) < today;
  };

  const formatDeadline = (deadline: string) => {
    const d = new Date(deadline + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return t("promise.today");
    if (diff === 1) return t("promise.tomorrow");
    if (diff < 0) return `${Math.abs(diff)}d ${t("promise.overdue")}`;
    if (diff <= 7) return `${diff}d`;
    return d.toLocaleDateString("en", { month: "short", day: "numeric" });
  };

  const renderPromiseItem = (p: Promise, isDone: boolean) => {
    const isEditing = editingId === p.id;

    return (
      <div
        key={p.id}
        className={`flex items-start gap-2 px-2 py-1.5 rounded-md border border-border/30 group ${
          isDone ? "bg-muted/10 opacity-70" : "bg-muted/30"
        }`}
      >
        <Checkbox
          checked={isDone}
          onCheckedChange={() => isDone ? onUncomplete(p.id) : onComplete(p.id)}
          className="mt-0.5"
        />
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex gap-1">
              <Input
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit();
                  if (e.key === "Escape") cancelEdit();
                }}
                className="text-base sm:text-xs h-6 flex-1"
                autoFocus
              />
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={saveEdit}>
                <Check className="w-3 h-3 text-primary" />
              </Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={cancelEdit}>
                <X className="w-3 h-3 text-muted-foreground" />
              </Button>
            </div>
          ) : (
            <>
              <p
                className={`text-xs leading-tight ${isDone ? "line-through text-muted-foreground" : "cursor-pointer"}`}
                onDoubleClick={() => !isDone && startEdit(p)}
              >
                {p.text}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity">
                      <CalendarClock className="w-3 h-3 text-muted-foreground" />
                      <Badge
                        variant={!isDone && isOverdue(p.deadline) ? "destructive" : "secondary"}
                        className="text-[9px] px-1 py-0 cursor-pointer"
                      >
                        {formatDeadline(p.deadline)}
                      </Badge>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="start">
                    <Input
                      type="date"
                      defaultValue={p.deadline}
                      onChange={(e) => {
                        if (e.target.value) onUpdateDeadline(p.id, e.target.value);
                      }}
                      className="text-xs h-7 w-auto"
                    />
                  </PopoverContent>
                </Popover>
                {p.project && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    {p.project}
                  </Badge>
                )}
              </div>
            </>
          )}
        </div>
        {!isEditing && !isDone && (
          <Button
            size="sm"
            variant="ghost"
            className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => startEdit(p)}
          >
            <Pencil className="w-3 h-3 text-muted-foreground" />
          </Button>
        )}
        {isDone && (
          <Button
            size="sm"
            variant="ghost"
            className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onUncomplete(p.id)}
            title="Restore"
          >
            <Undo2 className="w-3 h-3 text-muted-foreground" />
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onRemove(p.id)}
        >
          <Trash2 className="w-3 h-3 text-destructive" />
        </Button>
      </div>
    );
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
          <HandHeart className="w-4 h-4" />
          {t("promise.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Quick add */}
        <div className="flex gap-1.5">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder={t("promise.placeholder")}
            className="text-base sm:text-xs h-8 flex-1"
          />
          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={handleAdd} disabled={!input.trim()}>
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Active promises */}
        {filteredActive.length > 0 && (
          <div className="space-y-1.5">
            {filteredActive.map((p) => renderPromiseItem(p, false))}
          </div>
        )}

        {/* Completed promises (collapsible) */}
        {filteredDone.length > 0 && (
          <Collapsible open={showDone} onOpenChange={setShowDone}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-full justify-start gap-1.5 text-xs text-muted-foreground px-1">
                <ChevronDown className={`w-3 h-3 transition-transform ${showDone ? "" : "-rotate-90"}`} />
                {t("promise.done")} ({filteredDone.length})
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1.5 mt-1">
              {filteredDone.map((p) => renderPromiseItem(p, true))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
