import { useState } from "react";
import { Plus, X, Pencil, Check, FolderKanban } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

interface ProjectSidebarProps {
  projects: string[];
  activeProject: string;
  onSelect: (project: string) => void;
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
}

export function ProjectSidebar({ projects, activeProject, onSelect, onAdd, onRemove, onRename }: ProjectSidebarProps) {
  const { t } = useI18n();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
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
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">
            {!collapsed && t("sidebar.projects")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects.map((project) => (
                <SidebarMenuItem key={project}>
                  {editingProject === project ? (
                    <div className="flex items-center gap-1 px-2 py-1">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleRename()}
                        className="h-7 text-xs"
                        autoFocus
                      />
                      <Button size="sm" variant="ghost" onClick={handleRename} className="h-7 w-7 p-0 shrink-0">
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingProject(null)} className="h-7 w-7 p-0 shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <SidebarMenuButton
                      onClick={() => onSelect(project)}
                      isActive={activeProject === project}
                      className="group/item min-h-[40px]"
                      tooltip={project}
                    >
                      <FolderKanban className="w-4 h-4 shrink-0" />
                      {!collapsed && (
                        <>
                          <span className="truncate flex-1">{project}</span>
                          <span className="hidden group-hover/item:flex items-center gap-0.5 shrink-0">
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingProject(project);
                                setEditName(project);
                              }}
                              className="flex items-center justify-center w-5 h-5 rounded hover:bg-sidebar-accent cursor-pointer"
                            >
                              <Pencil className="w-3 h-3 text-sidebar-foreground/60" />
                            </span>
                            {projects.length > 1 && (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemove(project);
                                }}
                                className="flex items-center justify-center w-5 h-5 rounded hover:bg-destructive/10 cursor-pointer"
                              >
                                <X className="w-3 h-3 text-destructive" />
                              </span>
                            )}
                          </span>
                        </>
                      )}
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}

              {/* Add project */}
              <SidebarMenuItem>
                {isAdding ? (
                  <div className="flex items-center gap-1 px-2 py-1">
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAdd()}
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
                  <SidebarMenuButton
                    onClick={() => setIsAdding(true)}
                    className="text-sidebar-foreground/50 hover:text-sidebar-foreground min-h-[40px]"
                    tooltip={t("sidebar.addProject")}
                  >
                    <Plus className="w-4 h-4" />
                    {!collapsed && <span>{t("sidebar.addProject")}</span>}
                  </SidebarMenuButton>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
