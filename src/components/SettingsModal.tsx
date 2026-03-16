import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useI18n, Locale } from "@/lib/i18n";
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
import { Settings, Unplug, Calendar, Plus, Trash2, UserCircle, Send, Sparkles, AlertTriangle, Clock, FileText, RotateCcw, Download } from "lucide-react";
import {
  getAISettings,
  saveAISettings,
  clearAISettings,
  getAIDefaults,
  PROVIDER_PRESETS,
  type AIProvider,
} from "@/lib/ai-service";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { getStandupSchedule, saveStandupSchedule, StandupSchedule } from "@/lib/standup-scheduler";
import { getCustomPrompts, saveCustomPrompts, resetCustomPrompts, getDefaultPrompts, CustomPrompts } from "@/lib/ai-prompts";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Textarea } from "@/components/ui/textarea";

interface SettingsModalProps {
  onCredentialsChange: () => void;
  projects?: string[];
}

export function SettingsModal({ onCredentialsChange, projects = [] }: SettingsModalProps) {
  const { t, locale, setLocale } = useI18n();
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
  const [standupTimes, setStandupTimes] = useState<Record<string, string>>({});

  // AI state
  const aiDefaults = getAIDefaults();
  const [aiProvider, setAiProvider] = useState<AIProvider>(aiDefaults.provider);
  const [aiBaseUrl, setAiBaseUrl] = useState(aiDefaults.baseUrl);
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState(aiDefaults.model);

  // AI Prompts state
  const [prompts, setPrompts] = useState<CustomPrompts>(getCustomPrompts());
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
    setStandupTimes(getStandupSchedule().times);

    const ai = getAISettings();
    setAiProvider(ai?.provider || aiDefaults.provider);
    setAiBaseUrl(ai?.baseUrl || aiDefaults.baseUrl);
    setAiApiKey(ai?.apiKey || "");
    setAiModel(ai?.model || aiDefaults.model);
    setPrompts(getCustomPrompts());

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
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("settings.title")}</DialogTitle>
            <DialogDescription>
              {t("settings.description")}
            </DialogDescription>
          </DialogHeader>

          {/* Language Switcher */}
          <div className="flex items-center justify-between py-2 px-1">
            <Label className="text-xs font-medium">{t("settings.language")}</Label>
            <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
              {(["en", "ru"] as Locale[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLocale(lang)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    locale === lang
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {lang === "en" ? "🇬🇧 English" : "🇷🇺 Русский"}
                </button>
              ))}
            </div>
          </div>

          <Tabs defaultValue="database" className="mt-2">
            <TabsList className="w-full overflow-x-auto overflow-y-hidden justify-start no-scrollbar h-auto flex-wrap gap-1 p-1">
              <TabsTrigger value="database" className="gap-1.5 text-xs px-3 py-1.5">
                <Unplug className="w-3.5 h-3.5" /> {t("settings.database")}
              </TabsTrigger>
              <TabsTrigger value="calendar" className="gap-1.5 text-xs px-3 py-1.5">
                <Calendar className="w-3.5 h-3.5" /> {t("settings.googleCalendar")}
              </TabsTrigger>
              <TabsTrigger value="telegram" className="gap-1.5 text-xs px-3 py-1.5">
                <Send className="w-3.5 h-3.5" /> {t("settings.telegram")}
              </TabsTrigger>
              <TabsTrigger value="ai" className="gap-1.5 text-xs px-3 py-1.5">
                <Sparkles className="w-3.5 h-3.5" /> {t("settings.ai")}
              </TabsTrigger>
              <TabsTrigger value="prompts" className="gap-1.5 text-xs px-3 py-1.5">
                <FileText className="w-3.5 h-3.5" /> {t("settings.prompts")}
              </TabsTrigger>
              <TabsTrigger value="danger" className="gap-1.5 text-xs px-3 py-1.5 text-destructive">
                <AlertTriangle className="w-3.5 h-3.5" /> {t("settings.data")}
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
                    <Unplug className="w-3.5 h-3.5" /> {t("settings.disconnect")}
                  </Button>
                )}
                <div className="flex-1" />
                <Button size="sm" onClick={handleSaveSupabase}>{t("settings.saveConnect")}</Button>
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

              {/* Standup schedule */}
              <Separator />
              <div className="space-y-2">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Standup Schedule
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Set a standup time per project. The app will auto-send to Telegram 5 minutes before (tab must be open).
                </p>
                {projects.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No projects yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {projects.map((proj) => (
                      <div key={proj} className="flex items-center gap-2">
                        <span className="text-xs font-mono truncate flex-1 max-w-[160px]">{proj}</span>
                        <Input
                          type="time"
                          value={standupTimes[proj] || ""}
                          onChange={(e) =>
                            setStandupTimes((prev) => ({ ...prev, [proj]: e.target.value }))
                          }
                          className="h-7 text-xs w-28"
                        />
                        {standupTimes[proj] && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() =>
                              setStandupTimes((prev) => {
                                const next = { ...prev };
                                delete next[proj];
                                return next;
                              })
                            }
                          >
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!tgBotToken.trim() || !tgChatId.trim()}
                  onClick={async () => {
                    try {
                      const res = await fetch(`https://api.telegram.org/bot${tgBotToken.trim()}/getMe`);
                      const data = await res.json();
                      if (data.ok) {
                        toast.success(`Connected to bot: @${data.result.username}`);
                      } else {
                        toast.error(`Invalid token: ${data.description}`);
                      }
                    } catch {
                      toast.error("Network error — could not reach Telegram API");
                    }
                  }}
                >
                  Test Connection
                </Button>
                <div className="flex-1" />
                <Button
                  size="sm"
                  onClick={() => {
                    if (!tgBotToken.trim() || !tgChatId.trim()) {
                      toast.error("Both Bot Token and Chat ID are required");
                      return;
                    }
                    saveTelegramSettings({ botToken: tgBotToken.trim(), chatId: tgChatId.trim() });
                    saveStandupSchedule({ times: standupTimes });
                    toast.success("Telegram settings saved.");
                  }}
                >
                  Save Settings
                </Button>
              </div>
            </TabsContent>

            {/* ── AI Tab ── */}
            <TabsContent value="ai" className="space-y-4 mt-4">
              {/* Provider selector */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Provider</Label>
                <RadioGroup
                  value={aiProvider}
                  onValueChange={(v: string) => {
                    const provider = v as AIProvider;
                    setAiProvider(provider);
                    const preset = PROVIDER_PRESETS[provider];
                    setAiBaseUrl(preset.baseUrl);
                    setAiModel(preset.model);
                    if (!preset.needsKey) setAiApiKey("");
                  }}
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="openrouter" id="provider-openrouter" />
                    <Label htmlFor="provider-openrouter" className="text-xs cursor-pointer">OpenRouter</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="ollama" id="provider-ollama" />
                    <Label htmlFor="provider-ollama" className="text-xs cursor-pointer">Ollama (Local)</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Base URL</Label>
                <Input
                  value={aiBaseUrl}
                  onChange={(e) => setAiBaseUrl(e.target.value)}
                  placeholder={PROVIDER_PRESETS[aiProvider].baseUrl}
                  className="h-9 font-mono text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  {aiProvider === "ollama"
                    ? "Ollama API endpoint. Default: http://localhost:11434/v1"
                    : "Any OpenAI-compatible API endpoint (OpenRouter, Together, etc.)"}
                </p>
              </div>

              {aiProvider !== "ollama" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">API Key</Label>
                  <Input
                    value={aiApiKey}
                    onChange={(e) => setAiApiKey(e.target.value)}
                    placeholder="sk-..."
                    type="password"
                    className="h-9 font-mono text-xs"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Model</Label>
                <Input
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  placeholder={PROVIDER_PRESETS[aiProvider].model}
                  className="h-9 font-mono text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  {aiProvider === "ollama" ? (
                    <>Run <code className="bg-muted px-1 rounded">ollama list</code> to see installed models.</>
                  ) : (
                    <>For OpenRouter see <a href="https://openrouter.ai/models" target="_blank" rel="noreferrer" className="underline text-primary">available models</a>.</>
                  )}
                </p>
              </div>

              <div className="flex gap-2">
                {!!getAISettings() && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      clearAISettings();
                      const d = getAIDefaults();
                      setAiProvider(d.provider);
                      setAiBaseUrl(d.baseUrl);
                      setAiApiKey("");
                      setAiModel(d.model);
                      toast.success("AI disconnected.");
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
                    const preset = PROVIDER_PRESETS[aiProvider];
                    if (preset.needsKey && !aiApiKey.trim()) {
                      toast.error("API Key is required for OpenRouter");
                      return;
                    }
                    saveAISettings({
                      provider: aiProvider,
                      baseUrl: aiBaseUrl.trim() || preset.baseUrl,
                      apiKey: aiApiKey.trim(),
                      model: aiModel.trim() || preset.model,
                    });
                    toast.success("AI settings saved.");
                  }}
                >
                  Save Settings
                </Button>
              </div>
            </TabsContent>

            {/* ── AI Prompts Tab ── */}
            <TabsContent value="prompts" className="space-y-4 mt-4">
              <p className="text-[10px] text-muted-foreground">
                Customize the AI system prompts used for each feature. This controls tone, style, and behavior per job/persona.
              </p>
              <Accordion type="multiple" className="w-full">
                <AccordionItem value="standupPolish">
                  <AccordionTrigger className="text-xs font-medium py-2">Standup Polish Prompt</AccordionTrigger>
                  <AccordionContent>
                    <Textarea
                      value={prompts.standupPolish}
                      onChange={(e) => setPrompts((p) => ({ ...p, standupPolish: e.target.value }))}
                      className="text-xs font-mono min-h-[100px]"
                    />
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="blockerPolish">
                  <AccordionTrigger className="text-xs font-medium py-2">Blocker Polish Prompt</AccordionTrigger>
                  <AccordionContent>
                    <Textarea
                      value={prompts.blockerPolish}
                      onChange={(e) => setPrompts((p) => ({ ...p, blockerPolish: e.target.value }))}
                      className="text-xs font-mono min-h-[100px]"
                    />
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="taskExpander">
                  <AccordionTrigger className="text-xs font-medium py-2">Task Expander Prompt</AccordionTrigger>
                  <AccordionContent>
                    <Textarea
                      value={prompts.taskExpander}
                      onChange={(e) => setPrompts((p) => ({ ...p, taskExpander: e.target.value }))}
                      className="text-xs font-mono min-h-[100px]"
                    />
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="weeklyRetro">
                  <AccordionTrigger className="text-xs font-medium py-2">Weekly Retro Prompt</AccordionTrigger>
                  <AccordionContent>
                    <Textarea
                      value={prompts.weeklyRetro}
                      onChange={(e) => setPrompts((p) => ({ ...p, weeklyRetro: e.target.value }))}
                      className="text-xs font-mono min-h-[100px]"
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs"
                  onClick={() => {
                    resetCustomPrompts();
                    setPrompts(getDefaultPrompts());
                    toast.success("Prompts reset to defaults.");
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reset to Defaults
                </Button>
                <div className="flex-1" />
                <Button
                  size="sm"
                  onClick={() => {
                    saveCustomPrompts(prompts);
                    toast.success("AI prompts saved.");
                  }}
                >
                  Save Prompts
                </Button>
              </div>
            </TabsContent>


            <TabsContent value="danger" className="space-y-4 mt-4">
              {/* Export All Data */}
              <div className="rounded-md border border-border/50 p-4 space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <Download className="w-4 h-4 text-primary" /> {t("settings.exportAll")}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {t("settings.exportAllDesc")}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => {
                    try {
                      const allData: Record<string, unknown> = {};
                      for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key) {
                          try {
                            allData[key] = JSON.parse(localStorage.getItem(key) || "null");
                          } catch {
                            allData[key] = localStorage.getItem(key);
                          }
                        }
                      }
                      const now = new Date();
                      const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
                      const blob = new Blob([JSON.stringify(allData, null, 2)], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `scrum_buddy_export_${ts}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                      toast.success("Data exported successfully");
                    } catch (err) {
                      toast.error("Export failed");
                      console.error(err);
                    }
                  }}
                >
                  <Download className="w-3.5 h-3.5" /> {t("settings.exportAll")}
                </Button>
              </div>

              <div className="rounded-md border border-destructive/50 p-4 space-y-3">
                <h4 className="text-sm font-semibold text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> Danger Zone
                </h4>
                <p className="text-xs text-muted-foreground">
                  All data is stored in your browser's <strong>localStorage</strong>. If you've configured a Supabase sync, a copy also lives in your remote database. Deleting here removes <em>local</em> data only.
                </p>
                <Separator />
                <div className="space-y-2">
                  <p className="text-xs font-medium">Delete all local data</p>
                  <p className="text-[10px] text-muted-foreground">
                    This will remove all projects, entries, planning data, and settings from this browser. This action cannot be undone.
                  </p>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1"
                    onClick={() => {
                      if (!window.confirm("Are you sure? This will permanently delete ALL local data including entries, projects, and settings.")) return;
                      localStorage.clear();
                      toast.success("All local data deleted. Reloading…");
                      setTimeout(() => window.location.reload(), 500);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete All Local Data
                  </Button>
                </div>
                <Separator />
                <div className="space-y-2">
                  <p className="text-xs font-medium">Delete entries only</p>
                  <p className="text-[10px] text-muted-foreground">
                    Keeps your projects and settings but removes all log entries.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 border-destructive/50 text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      if (!window.confirm("Delete all entries? Projects and settings will be kept.")) return;
                      try {
                        const raw = localStorage.getItem("daily-scrum-logger");
                        if (raw) {
                          const d = JSON.parse(raw);
                          d.entries = {};
                          localStorage.setItem("daily-scrum-logger", JSON.stringify(d));
                        }
                        toast.success("Entries deleted. Reloading…");
                        setTimeout(() => window.location.reload(), 500);
                      } catch {
                        toast.error("Failed to clear entries");
                      }
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Entries Only
                  </Button>
                </div>
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
  const safeItems = items || [];
  return (
    <div className="space-y-1">
      <Label className="text-[10px]">{label}</Label>
      {safeItems.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {safeItems.map((item, i) => (
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
