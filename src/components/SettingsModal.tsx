import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Unplug, Calendar, Plus, Trash2, UserCircle, Send } from "lucide-react";
import {
  getTelegramSettings,
  saveTelegramSettings,
  clearTelegramSettings,
} from "@/lib/telegram-service";
import {
  getCredentials,
  saveCredentials,
  clearCredentials,
  resetClient,
  SupabaseCredentials,
} from "@/lib/sync-service";
import {
  getGCalSettings,
  saveGCalSettings,
  clearGCalSettings,
  getGCalTokens,
  removeGCalToken,
  startGoogleAuth,
  getDefaultFilters,
  GCalSettings,
  GCalFilters,
} from "@/lib/gcal-service";
import { toast } from "sonner";

interface SettingsModalProps {
  onCredentialsChange: () => void;
}

export function SettingsModal({ onCredentialsChange }: SettingsModalProps) {
  const [open, setOpen] = useState(false);

  // Supabase state
  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");

  // GCal state
  const [clientId, setClientId] = useState("");
  const [redirectUri, setRedirectUri] = useState(window.location.origin + "/");
  const [filters, setFilters] = useState<GCalFilters>(getDefaultFilters());
  const [tokens, setTokens] = useState(getGCalTokens());

  // Filter input helpers
  const [newNameKw, setNewNameKw] = useState("");
  const [newExcludeKw, setNewExcludeKw] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [newAttendeeKw, setNewAttendeeKw] = useState("");

  // Telegram state
  const [tgBotToken, setTgBotToken] = useState("");
  const [tgChatId, setTgChatId] = useState("");

  const handleOpen = () => {
    const creds = getCredentials();
    setUrl(creds?.url || "");
    setAnonKey(creds?.anonKey || "");

    const gcal = getGCalSettings();
    setClientId(gcal?.clientId || "");
    setRedirectUri(gcal?.redirectUri || window.location.origin + "/");
    setFilters(gcal?.filters || getDefaultFilters());
    setTokens(getGCalTokens());

    const tg = getTelegramSettings();
    setTgBotToken(tg?.botToken || "");
    setTgChatId(tg?.chatId || "");

    setOpen(true);
  };

  // ── Supabase handlers ──
  const handleSaveSupabase = () => {
    const trimmedUrl = url.trim();
    const trimmedKey = anonKey.trim();
    if (!trimmedUrl || !trimmedKey) {
      toast.error("Both URL and Anon Key are required");
      return;
    }
    if (!trimmedUrl.startsWith("https://")) {
      toast.error("URL must start with https://");
      return;
    }
    saveCredentials({ url: trimmedUrl, anonKey: trimmedKey });
    resetClient();
    onCredentialsChange();
    toast.success("Database connection saved.");
  };

  const handleDisconnectSupabase = () => {
    clearCredentials();
    resetClient();
    onCredentialsChange();
    toast.success("Database disconnected.");
  };

  // ── GCal handlers ──
  const handleSaveGCal = () => {
    if (!clientId.trim()) {
      toast.error("Client ID is required");
      return;
    }
    if (!redirectUri.trim()) {
      toast.error("Redirect URI is required");
      return;
    }
    const settings: GCalSettings = {
      clientId: clientId.trim(),
      redirectUri: redirectUri.trim(),
      filters,
    };
    saveGCalSettings(settings);
    toast.success("Google Calendar settings saved.");
  };

  const handleConnectAccount = () => {
    handleSaveGCal();
    const settings = getGCalSettings();
    if (!settings) {
      toast.error("Save settings first");
      return;
    }
    startGoogleAuth(settings);
  };

  const handleRemoveAccount = (accountId: string) => {
    removeGCalToken(accountId);
    setTokens(getGCalTokens());
    toast.success("Account removed.");
  };

  const handleDisconnectGCal = () => {
    clearGCalSettings();
    setClientId("");
    setFilters(getDefaultFilters());
    setTokens([]);
    toast.success("Google Calendar disconnected.");
  };

  const addToList = (
    key: keyof Pick<GCalFilters, "nameKeywords" | "excludeNameKeywords" | "attendeeDomains" | "attendeeKeywords">,
    value: string,
    setter: (v: string) => void
  ) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setFilters((prev) => ({
      ...prev,
      [key]: [...prev[key], trimmed],
    }));
    setter("");
  };

  const removeFromList = (
    key: keyof Pick<GCalFilters, "nameKeywords" | "excludeNameKeywords" | "attendeeDomains" | "attendeeKeywords">,
    index: number
  ) => {
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key].filter((_, i) => i !== index),
    }));
  };

  const isSupabaseConnected = !!getCredentials();
  const isGCalConfigured = !!getGCalSettings()?.clientId;

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={handleOpen}
        className="h-8 w-8 p-0 text-muted-foreground"
        title="Settings"
      >
        <Settings className="w-4 h-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Configure database sync, calendar, and Telegram integrations.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="database" className="mt-2">
            <TabsList className="w-full">
              <TabsTrigger value="database" className="flex-1 gap-1 text-xs">
                <Unplug className="w-3.5 h-3.5" /> Database
              </TabsTrigger>
              <TabsTrigger value="calendar" className="flex-1 gap-1 text-xs">
                <Calendar className="w-3.5 h-3.5" /> Google Calendar
              </TabsTrigger>
              <TabsTrigger value="telegram" className="flex-1 gap-1 text-xs">
                <Send className="w-3.5 h-3.5" /> Telegram
              </TabsTrigger>
            </TabsList>

            {/* ── Database Tab ── */}
            <TabsContent value="database" className="space-y-4 mt-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Supabase API URL</Label>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://your-project.supabase.co"
                  className="h-9 font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Supabase Anon / Service Key</Label>
                <Input
                  value={anonKey}
                  onChange={(e) => setAnonKey(e.target.value)}
                  placeholder="eyJ..."
                  type="password"
                  className="h-9 font-mono text-xs"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Run <code className="bg-muted px-1 rounded">schema.sql</code> in your Supabase SQL Editor first.
              </p>
              <div className="flex gap-2">
                {isSupabaseConnected && (
                  <Button variant="destructive" size="sm" onClick={handleDisconnectSupabase} className="gap-1">
                    <Unplug className="w-3.5 h-3.5" /> Disconnect
                  </Button>
                )}
                <div className="flex-1" />
                <Button size="sm" onClick={handleSaveSupabase}>Save & Connect</Button>
              </div>
            </TabsContent>

            {/* ── Google Calendar Tab ── */}
            <TabsContent value="calendar" className="space-y-4 mt-4">
              {/* Credentials */}
              <div className="space-y-1.5">
                <Label className="text-xs">Google OAuth Client ID</Label>
                <Input
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="123456.apps.googleusercontent.com"
                  className="h-9 font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Redirect URI</Label>
                <Input
                  value={redirectUri}
                  onChange={(e) => setRedirectUri(e.target.value)}
                  placeholder={window.location.origin + "/"}
                  className="h-9 font-mono text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  Must match the authorized redirect URI in your Google Cloud Console.
                </p>
              </div>

              {/* Connected accounts */}
              <Separator />
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Connected Accounts</Label>
                {tokens.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No accounts connected.</p>
                ) : (
                  <div className="space-y-1.5">
                    {tokens.map((t) => (
                      <div key={t.accountId} className="flex items-center gap-2 p-2 rounded-md bg-muted/30 border border-border/50">
                        <UserCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs font-mono flex-1 truncate">{t.email}</span>
                        {Date.now() > t.expiresAt ? (
                          <Badge variant="destructive" className="text-[9px]">Expired</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[9px]">Active</Badge>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => handleRemoveAccount(t.accountId)}
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={handleConnectAccount}>
                  <Plus className="w-3.5 h-3.5" /> Connect Google Account
                </Button>
              </div>

              {/* Filters */}
              <Separator />
              <div className="space-y-3">
                <Label className="text-xs font-semibold">Event Filters</Label>

                {/* Name keywords */}
                <FilterList
                  label="Include events with keywords"
                  items={filters.nameKeywords}
                  inputValue={newNameKw}
                  onInputChange={setNewNameKw}
                  onAdd={() => addToList("nameKeywords", newNameKw, setNewNameKw)}
                  onRemove={(i) => removeFromList("nameKeywords", i)}
                  placeholder="e.g. standup, planning"
                />

                <FilterList
                  label="Exclude events with keywords"
                  items={filters.excludeNameKeywords}
                  inputValue={newExcludeKw}
                  onInputChange={setNewExcludeKw}
                  onAdd={() => addToList("excludeNameKeywords", newExcludeKw, setNewExcludeKw)}
                  onRemove={(i) => removeFromList("excludeNameKeywords", i)}
                  placeholder="e.g. lunch, ooo"
                />

                <FilterList
                  label="Attendee domains"
                  items={filters.attendeeDomains}
                  inputValue={newDomain}
                  onInputChange={setNewDomain}
                  onAdd={() => addToList("attendeeDomains", newDomain, setNewDomain)}
                  onRemove={(i) => removeFromList("attendeeDomains", i)}
                  placeholder="e.g. company.com"
                />

                <FilterList
                  label="Attendee keywords"
                  items={filters.attendeeKeywords}
                  inputValue={newAttendeeKw}
                  onInputChange={setNewAttendeeKw}
                  onAdd={() => addToList("attendeeKeywords", newAttendeeKw, setNewAttendeeKw)}
                  onRemove={(i) => removeFromList("attendeeKeywords", i)}
                  placeholder="e.g. john, manager"
                />

                {/* Duration filters */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Min duration (min)</Label>
                    <Input
                      type="number"
                      value={filters.minDurationMinutes || ""}
                      onChange={(e) =>
                        setFilters((p) => ({ ...p, minDurationMinutes: parseInt(e.target.value) || 0 }))
                      }
                      placeholder="0"
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Max duration (min)</Label>
                    <Input
                      type="number"
                      value={filters.maxDurationMinutes || ""}
                      onChange={(e) =>
                        setFilters((p) => ({ ...p, maxDurationMinutes: parseInt(e.target.value) || 0 }))
                      }
                      placeholder="0 (no limit)"
                      className="h-7 text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                {isGCalConfigured && (
                  <Button variant="destructive" size="sm" onClick={handleDisconnectGCal} className="gap-1">
                    <Unplug className="w-3.5 h-3.5" /> Disconnect
                  </Button>
                )}
                <div className="flex-1" />
                <Button size="sm" onClick={handleSaveGCal}>Save Settings</Button>
              </div>
            </TabsContent>

            {/* ── Telegram Tab ── */}
            <TabsContent value="telegram" className="space-y-4 mt-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Bot Token</Label>
                <Input
                  value={tgBotToken}
                  onChange={(e) => setTgBotToken(e.target.value)}
                  placeholder="123456:ABC-DEF..."
                  type="password"
                  className="h-9 font-mono text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  Get from <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="underline text-primary">@BotFather</a> on Telegram.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Chat ID</Label>
                <Input
                  value={tgChatId}
                  onChange={(e) => setTgChatId(e.target.value)}
                  placeholder="-1001234567890"
                  className="h-9 font-mono text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  Group/channel ID (starts with -100) or your personal chat ID. Use <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" className="underline text-primary">@userinfobot</a> to find yours.
                </p>
              </div>
              <div className="flex gap-2">
                {!!getTelegramSettings() && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      clearTelegramSettings();
                      setTgBotToken("");
                      setTgChatId("");
                      toast.success("Telegram disconnected.");
                    }}
                    className="gap-1"
                  >
                    <Unplug className="w-3.5 h-3.5" /> Disconnect
                  </Button>
                )}
                <div className="flex-1" />
                <Button
                  size="sm"
                  onClick={() => {
                    if (!tgBotToken.trim() || !tgChatId.trim()) {
                      toast.error("Both Bot Token and Chat ID are required");
                      return;
                    }
                    saveTelegramSettings({ botToken: tgBotToken.trim(), chatId: tgChatId.trim() });
                    toast.success("Telegram settings saved.");
                  }}
                >
                  Save Settings
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ── Filter list component ── */

function FilterList({
  label,
  items,
  inputValue,
  onInputChange,
  onAdd,
  onRemove,
  placeholder,
}: {
  label: string;
  items: string[];
  inputValue: string;
  onInputChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px]">{label}</Label>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {items.map((item, i) => (
            <Badge key={i} variant="secondary" className="text-[10px] gap-0.5 pr-0.5">
              {item}
              <button onClick={() => onRemove(i)} className="ml-0.5 hover:text-destructive">
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex gap-1">
        <Input
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onAdd())}
          placeholder={placeholder}
          className="h-7 text-xs flex-1"
        />
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onAdd}>
          <Plus className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
