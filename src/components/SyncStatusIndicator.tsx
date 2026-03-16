import { useEffect, useState } from "react";
import { SyncStatus, onSyncStatus } from "@/lib/sync-service";
import { isVolumeStorageActive } from "@/lib/storage";
import { Cloud, CloudOff, Loader2, AlertCircle, CloudCog, HardDrive } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const statusConfig: Record<SyncStatus, { icon: typeof Cloud; label: string; color: string }> = {
  unconfigured: { icon: CloudCog, label: "No database configured", color: "text-muted-foreground" },
  offline: { icon: CloudOff, label: "Offline · Changes saved locally", color: "text-warning" },
  syncing: { icon: Loader2, label: "Syncing…", color: "text-primary" },
  synced: { icon: Cloud, label: "Synced with database", color: "text-success" },
  error: { icon: AlertCircle, label: "Sync error", color: "text-destructive" },
};

export function SyncStatusIndicator() {
  const [status, setStatus] = useState<SyncStatus>("unconfigured");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const volumeActive = isVolumeStorageActive();

  useEffect(() => {
    return onSyncStatus((s, msg) => {
      setStatus(s);
      setErrorMsg(msg || null);
    });
  }, []);

  const config = statusConfig[status];
  const Icon = config.icon;
  const isSpinning = status === "syncing";

  return (
    <div className="flex items-center gap-1.5">
      {volumeActive && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 text-xs text-success cursor-default">
              <HardDrive className="w-3.5 h-3.5" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">Volume storage active · Data persisted to disk</p>
          </TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center gap-1 text-xs ${config.color} cursor-default`}>
            <Icon className={`w-3.5 h-3.5 ${isSpinning ? "animate-spin" : ""}`} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">{config.label}</p>
          {errorMsg && <p className="text-[10px] text-destructive mt-0.5">{errorMsg}</p>}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
