import { useState } from "react";
import { Plus, X, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ProjectTabsProps {
  projects: string[];
  activeProject: string;
  onSelect: (project: string) => void;
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
}

export function ProjectTabs({ projects, activeProject, onSelect, onAdd, onRemove, onRename }: ProjectTabsProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (trimmed && !projects.includes(trimmed)) {
      onAdd(trimmed);
      setNewName("");
      setIsAdding(false);
      onSelect(trimmed);
    }
  };

  const handleRename = () => {
    const trimmed = editName.trim();
    if (trimmed && editingProject && trimmed !== editingProject && !projects.includes(trimmed)) {
      onRename(editingProject, trimmed);
    }
    setEditingProject(null);
    setEditName("");
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {projects.map((project) =>
        editingProject === project ? (
          <div key={project} className="flex items-center gap-1">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              className="h-8 w-36 text-sm"
              autoFocus
            />
            <Button size="sm" variant="ghost" onClick={handleRename} className="h-8 px-2">
              <Check className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingProject(null)} className="h-8 px-2">
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <button
            key={project}
            onClick={() => onSelect(project)}
            className={`group relative px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              activeProject === project
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-secondary text-secondary-foreground hover:bg-muted"
            }`}
          >
            {project}
            <span className="absolute -top-1 -right-1 hidden group-hover:flex items-center gap-0.5">
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingProject(project);
                  setEditName(project);
                }}
                className="flex items-center justify-center w-4 h-4 rounded-full bg-muted text-muted-foreground text-[10px] cursor-pointer"
              >
                <Pencil className="w-2.5 h-2.5" />
              </span>
              {projects.length > 1 && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(project);
                    if (activeProject === project) onSelect(projects.find((p) => p !== project) || "");
                  }}
                  className="flex items-center justify-center w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </span>
              )}
            </span>
          </button>
        )
      )}

      {isAdding ? (
        <div className="flex items-center gap-1">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Project name"
            className="h-8 w-36 text-sm"
            autoFocus
          />
          <Button size="sm" variant="ghost" onClick={handleAdd} className="h-8 px-2">
            <Plus className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)} className="h-8 px-2">
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setIsAdding(true)} className="h-8 px-2 text-muted-foreground">
          <Plus className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
