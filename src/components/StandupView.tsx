import { Entry } from "@/lib/types";
import { stripActualHours } from "@/lib/text-sanitizer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ListTodo, AlertTriangle, Copy, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { isTelegramConfigured, sendTelegramMessage } from "@/lib/telegram-service";
import { useState } from "react";

interface StandupViewProps {
  project: string;
  yesterday: Entry | null;
  today: Entry | null;
  allProjectsStandup?: { project: string; yesterday: Entry | null; today: Entry | null }[];
}

function buildSections(yesterday: Entry | null, today: Entry | null) {
  return [
    {
      title: "Yesterday",
      content: yesterday?.done ? stripActualHours(yesterday.done) : "No entry",
      icon: CheckCircle2,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      title: "Today",
      content: (today?.doing || today?.done)
        ? stripActualHours(today?.doing || "See today's entry")
        : "No entry yet",
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
}

function formatStandupText(project: string, yesterday: Entry | null, today: Entry | null): string {
  const clean = (text: string) => text.replace(/•/g, "·").replace(/[<>]/g, "");
  const sections = buildSections(yesterday, today);
  const lines = sections.map((s) => `<b>${s.title}:</b>\n${clean(s.content)}`).join("\n\n");
  return `📋 <b>${project}</b>\n\n${lines}`;
}

export function StandupView({ project, yesterday, today, allProjectsStandup }: StandupViewProps) {
  const [sending, setSending] = useState(false);
  const sections = buildSections(yesterday, today);

  const copyToClipboard = async () => {
    const plain = sections
      .map((s) => `${s.title}:\n${s.content}`)
      .join("\n\n");
    const html = sections
      .map((s) => `<b>${s.title}:</b><br>${s.content.replace(/\n/g, "<br>")}`)
      .join("<br><br>");

    try {
      // Try writing rich text (HTML) + plain text fallback
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
    } catch {
      // Fallback: plain text only
      await navigator.clipboard.writeText(plain);
    }
    toast.success("Copied to clipboard!");
  };

  const handleSendTelegram = async () => {
    if (!isTelegramConfigured()) {
      toast.error("Configure Telegram in Settings first (⚙️ → Telegram)");
      return;
    }

    setSending(true);
    try {
      if (allProjectsStandup && allProjectsStandup.length > 0) {
        // Send all projects as one message
        const parts = allProjectsStandup.map((p) =>
          formatStandupText(p.project, p.yesterday, p.today)
        );
        const date = new Date().toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" });
        const fullMessage = `🗓 <b>Daily Standup — ${date}</b>\n\n${parts.join("\n\n─────────────\n\n")}`;
        await sendTelegramMessage(fullMessage);
        toast.success(`Standup sent for ${allProjectsStandup.length} project(s)!`);
      } else {
        await sendTelegramMessage(formatStandupText(project, yesterday, today));
        toast.success("Standup sent to Telegram!");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg font-semibold">Standup · {project}</CardTitle>
        </div>
        <div className="flex items-center gap-1.5">
          {isTelegramConfigured() && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSendTelegram}
              disabled={sending}
              className="gap-1.5 text-xs"
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {allProjectsStandup && allProjectsStandup.length > 1
                ? `Send all (${allProjectsStandup.length})`
                : "Send to TG"}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={copyToClipboard} className="gap-1.5 text-muted-foreground">
            <Copy className="w-4 h-4" /> Copy
          </Button>
        </div>
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

        {!isTelegramConfigured() && (
          <p className="text-[10px] text-muted-foreground text-center">
            💡 Configure Telegram in ⚙️ Settings to send standups directly to a chat.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
