import { Plus, ClipboardList, BarChart3, Send, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  onAddProject: () => void;
}

export function EmptyState({ onAddProject }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <ClipboardList className="w-8 h-8 text-primary" />
      </div>
      
      <h2 className="text-xl font-semibold mb-2 text-foreground">Welcome to Scrum Logger</h2>
      <p className="text-sm text-muted-foreground max-w-md mb-8 leading-relaxed">
        Create a project to start logging daily standups, tracking time, and generating reports for your team.
      </p>

      <Button onClick={onAddProject} size="lg" className="gap-2 min-h-[48px] px-6">
        <Plus className="w-5 h-5" />
        Create Your First Project
      </Button>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-12 max-w-lg">
        {[
          { icon: ClipboardList, label: "Daily Logs" },
          { icon: Calendar, label: "Sprint Planning" },
          { icon: Send, label: "Telegram Standups" },
          { icon: BarChart3, label: "Timesheets" },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex flex-col items-center gap-2 p-3 rounded-lg bg-muted/50">
            <Icon className="w-5 h-5 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
