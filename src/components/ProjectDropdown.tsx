import { useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ProjectDropdownProps {
  projects: string[];
  activeProject: string;
  onSelect: (project: string) => void;
  onAdd: (name: string) => void;
}

export function ProjectDropdown({ projects, activeProject, onSelect, onAdd }: ProjectDropdownProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (trimmed && !projects.includes(trimmed)) {
      onAdd(trimmed);
      setNewName("");
      setIsAdding(false);
      onSelect(trimmed);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs min-h-[36px] max-w-[200px]">
          <span className="truncate">{activeProject || "Select project"}</span>
          <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {projects.map((project) => (
          <DropdownMenuItem
            key={project}
            onClick={() => onSelect(project)}
            className={`min-h-[40px] ${activeProject === project ? "bg-accent text-accent-foreground" : ""}`}
          >
            {project}
          </DropdownMenuItem>
        ))}
        {projects.length > 0 && <DropdownMenuSeparator />}
        {isAdding ? (
          <div className="flex items-center gap-1 px-2 py-1.5">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") handleAdd();
              }}
              placeholder="Project name"
              className="h-7 text-xs"
              autoFocus
            />
            <Button size="sm" variant="ghost" onClick={handleAdd} className="h-7 w-7 p-0 shrink-0">
              <Plus className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setIsAdding(false); setNewName(""); }} className="h-7 w-7 p-0 shrink-0">
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <DropdownMenuItem onClick={() => setIsAdding(true)} className="text-muted-foreground min-h-[40px]">
            <Plus className="w-4 h-4 mr-2" />
            Add project
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
