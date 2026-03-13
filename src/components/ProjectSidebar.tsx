import { useState } from "react";
import { Plus, X, Pencil, Check, FolderKanban, Hash } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const PROJECT_COLORS = [
  "hsl(172, 66%, 45%)",  // teal/primary
  "hsl(262, 52%, 56%)",  // purple
  "hsl(38, 92%, 50%)",   // amber
  "hsl(340, 65%, 55%)",  // rose
  "hsl(210, 68%, 52%)",  // blue
  "hsl(152, 60%, 42%)",  // green
  "hsl(25, 75%, 55%)",   // orange
  "hsl(290, 45%, 55%)",  // violet
];

function getProjectColor(name: string, index: number) {
  return PROJECT_COLORS[index % PROJECT_COLORS.length];
}

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
        {/* Branding / label area */}
        <div className={`px-3 pt-4 pb-2 ${collapsed ? "px-2" : ""}`}>
          {!collapsed && (
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-foreground/40">
              {t("sidebar.projects")}
            </span>
          )}
        </div>

        <SidebarGroup className="px-2">
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {projects.map((project, index) => {
                const isActive = activeProject === project;
                const color = getProjectColor(project, index);

                return (
                  <SidebarMenuItem key={project}>
                    {editingProject === project ? (
                      <div className="flex items-center gap-1 px-2 py-1">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleRename()}
                          className="h-8 text-xs"
                          autoFocus
                        />
                        <Button size="sm" variant="ghost" onClick={handleRename} className="h-8 w-8 p-0 shrink-0">
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingProject(null)} className="h-8 w-8 p-0 shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <SidebarMenuButton
                        onClick={() => onSelect(project)}
                        isActive={isActive}
                        className={`group/item relative rounded-lg transition-all duration-150 min-h-[44px] text-sm ${
                          isActive
                            ? "bg-sidebar-accent font-medium"
                            : "hover:bg-sidebar-accent/50"
                        }`}
                        tooltip={project}
                      >
                        {/* Color dot indicator */}
                        <span
                          className={`shrink-0 rounded-md flex items-center justify-center transition-all ${
                            collapsed ? "w-7 h-7" : "w-7 h-7"
                          }`}
                          style={{ backgroundColor: isActive ? color : `${color}22` }}
                        >
                          <Hash
                            className="w-3.5 h-3.5 transition-colors"
                            style={{ color: isActive ? "hsl(220, 20%, 7%)" : color }}
                          />
                        </span>

                        {!collapsed && (
                          <>
                            <span className="truncate flex-1">{project}</span>

                            {/* Active indicator bar */}
                            {isActive && (
                              <span
                                className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                                style={{ backgroundColor: color }}
                              />
                            )}

                            {/* Actions on hover */}
                            <span className="hidden group-hover/item:flex items-center gap-0.5 shrink-0">
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingProject(project);
                                  setEditName(project);
                                }}
                                className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-sidebar-accent cursor-pointer transition-colors"
                              >
                                <Pencil className="w-3 h-3 text-sidebar-foreground/50" />
                              </span>
                              {projects.length > 1 && (
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRemove(project);
                                  }}
                                  className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-destructive/10 cursor-pointer transition-colors"
                                >
                                  <X className="w-3 h-3 text-destructive/70" />
                                </span>
                              )}
                            </span>
                          </>
                        )}
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                );
              })}

              {/* Divider */}
              {projects.length > 0 && !collapsed && (
                <div className="mx-2 my-2 border-t border-sidebar-border/50" />
              )}

              {/* Add project */}
              <SidebarMenuItem>
                {isAdding ? (
                  <div className="flex items-center gap-1 px-2 py-1">
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                      placeholder="Project name"
                      className="h-8 text-xs"
                      autoFocus
                    />
                    <Button size="sm" variant="ghost" onClick={handleAdd} className="h-8 w-8 p-0 shrink-0">
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setIsAdding(false); setNewName(""); }} className="h-8 w-8 p-0 shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <SidebarMenuButton
                    onClick={() => setIsAdding(true)}
                    className="text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 min-h-[40px] text-xs rounded-lg transition-all duration-150"
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
