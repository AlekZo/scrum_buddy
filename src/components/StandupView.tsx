import { Entry } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ListTodo, AlertTriangle, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface StandupViewProps {
  project: string;
  yesterday: Entry | null;
  today: Entry | null;
}

export function StandupView({ project, yesterday, today }: StandupViewProps) {
  const sections = [
    {
      title: "Yesterday",
      content: yesterday?.done || "No entry",
      icon: CheckCircle2,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      title: "Today",
      content: today?.doing || today?.done ? (today?.doing || "See today's entry") : "No entry yet",
      icon: ListTodo,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Blockers",
      content: today?.blockers || yesterday?.blockers || "None 🎉",
      icon: AlertTriangle,
      color: "text-warning",
      bgColor: "bg-warning/10",
      isEmpty: !today?.blockers && !yesterday?.blockers,
    },
  ];

  const copyToClipboard = () => {
    const text = sections
      .map((s) => `**${s.title}:**\n${s.content}`)
      .join("\n\n");
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg font-semibold">Standup · {project}</CardTitle>
        </div>
        <Button variant="ghost" size="sm" onClick={copyToClipboard} className="gap-1.5 text-muted-foreground">
          <Copy className="w-4 h-4" /> Copy
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {sections.map(({ title, content, icon: Icon, color, bgColor, isEmpty }) => (
          <div key={title} className={`rounded-lg p-4 ${bgColor}`}>
            <div className={`flex items-center gap-2 mb-2 ${color}`}>
              <Icon className="w-4 h-4" />
              <span className="font-semibold text-sm">{title}</span>
              {isEmpty && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">clear</Badge>}
            </div>
            <p className="text-sm whitespace-pre-wrap font-mono leading-relaxed text-foreground/80">
              {content}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
