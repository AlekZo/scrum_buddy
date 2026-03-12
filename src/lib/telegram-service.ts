/**
 * Telegram integration service
 * Sends standup reports directly via Telegram Bot API
 */

const TG_SETTINGS_KEY = "tg-settings";

export interface TelegramSettings {
  botToken: string;
  chatId: string;
}

export function getTelegramSettings(): TelegramSettings | null {
  try {
    const raw = localStorage.getItem(TG_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.botToken || !parsed.chatId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveTelegramSettings(settings: TelegramSettings): void {
  localStorage.setItem(TG_SETTINGS_KEY, JSON.stringify(settings));
}

export function clearTelegramSettings(): void {
  localStorage.removeItem(TG_SETTINGS_KEY);
}

export function isTelegramConfigured(): boolean {
  return !!getTelegramSettings();
}

function escapeHTML(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendTelegramMessage(text: string): Promise<void> {
  const settings = getTelegramSettings();
  if (!settings) throw new Error("Telegram not configured");

  // Escape user content but preserve our own <b> tags
  // Strategy: escape everything, then restore <b> and </b>
  const escaped = escapeHTML(text)
    .replace(/&lt;b&gt;/g, "<b>")
    .replace(/&lt;\/b&gt;/g, "</b>");

  try {
    const res = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: settings.chatId,
        text: escaped,
        parse_mode: "HTML",
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.description || "Failed to send message");
    }
  } catch (err) {
    if (err instanceof TypeError && err.message.includes("fetch")) {
      throw new Error("Network error — check your internet connection");
    }
    throw err;
  }
}
