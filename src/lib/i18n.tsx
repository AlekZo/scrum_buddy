import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type Locale = "en" | "ru";

const LANG_KEY = "app-language";

const translations = {
  // Header & Navigation
  "app.title": { en: "Scrum Logger", ru: "Scrum Логгер" },
  "nav.log": { en: "Log", ru: "Журнал" },
  "nav.planning": { en: "Planning", ru: "Планирование" },
  "nav.standup": { en: "Standup", ru: "Стендап" },
  "nav.timesheet": { en: "Timesheet", ru: "Табель" },
  "nav.insights": { en: "AI Insights", ru: "AI Аналитика" },
  "nav.promises": { en: "Promises", ru: "Обещания" },

  // Sidebar
  "sidebar.projects": { en: "PROJECTS", ru: "ПРОЕКТЫ" },
  "sidebar.addProject": { en: "Add project", ru: "Добавить проект" },

  // Entry Form
  "entry.whatIDid": { en: "What I did", ru: "Что сделал" },
  "entry.whatImDoing": { en: "What I'm doing next", ru: "Что буду делать" },
  "entry.blockers": { en: "Blockers", ru: "Блокеры" },
  "entry.version": { en: "Version:", ru: "Версия:" },
  "entry.hours": { en: "Hours", ru: "Часы" },
  "entry.prefillFromYesterday": { en: "Prefill \"What I did\" from yesterday's plan", ru: "Заполнить \"Что сделал\" из вчерашнего плана" },
  "entry.pullCalendar": { en: "Pull from Google Calendar", ru: "Загрузить из Google Calendar" },
  "entry.updateDuplicates": { en: "Update duplicates", ru: "Обновить дубликаты" },
  "entry.saving": { en: "Saving…", ru: "Сохранение…" },
  "entry.saved": { en: "Saved ✓", ru: "Сохранено ✓" },
  "entry.saveFailed": { en: "Save failed", ru: "Ошибка сохранения" },
  "entry.retry": { en: "Retry", ru: "Повторить" },
  "entry.polish": { en: "Polish", ru: "Улучшить" },
  "entry.merge": { en: "Merge", ru: "Объединить" },
  "entry.undo": { en: "Undo", ru: "Отменить" },
  "entry.reported": { en: "Reported to team", ru: "Сообщено команде" },
  "entry.unlock": { en: "Unlock to edit", ru: "Разблокировать" },

  // Planning
  "planning.title": { en: "Planning", ru: "Планирование" },
  "planning.thisWeek": { en: "This week", ru: "Эта неделя" },
  "planning.aiBreakdown": { en: "AI Breakdown", ru: "AI Разбивка" },
  "planning.matrix": { en: "Matrix", ru: "Матрица" },
  "planning.week": { en: "Week", ru: "Неделя" },
  "planning.list": { en: "List", ru: "Список" },
  "planning.addTask": { en: "Add task... (e.g. review - 2h)", ru: "Добавить задачу... (напр. ревью - 2ч)" },
  "planning.backlog": { en: "Backlog", ru: "Бэклог" },
  "planning.bufferBank": { en: "Buffer Bank", ru: "Банк буфера" },

  // Standup
  "standup.title": { en: "Standup", ru: "Стендап" },
  "standup.yesterday": { en: "Yesterday", ru: "Вчера" },
  "standup.today": { en: "Today", ru: "Сегодня" },
  "standup.copy": { en: "Copy", ru: "Копировать" },
  "standup.send": { en: "Send to TG", ru: "Отправить в TG" },
  "standup.allProjects": { en: "All Projects", ru: "Все проекты" },
  "standup.singleProject": { en: "Single Project", ru: "Один проект" },

  // Timesheet
  "timesheet.title": { en: "Timesheet", ru: "Табель" },
  "timesheet.entries": { en: "entries", ru: "записей" },
  "timesheet.workdays": { en: "workdays", ru: "рабочих дней" },
  "timesheet.target": { en: "Target", ru: "Цель" },
  "timesheet.logged": { en: "Logged", ru: "Записано" },
  "timesheet.utilization": { en: "Utilization", ru: "Утилизация" },
  "timesheet.hoursNote": { en: "Hours are calculated from", ru: "Часы рассчитаны из" },
  "timesheet.date": { en: "Date", ru: "Дата" },
  "timesheet.done": { en: "Done", ru: "Выполнено" },
  "timesheet.doing": { en: "Doing", ru: "В работе" },
  "timesheet.team": { en: "Team", ru: "Команда" },
  "timesheet.actual": { en: "Actual", ru: "Факт" },
  "timesheet.taskBreakdown": { en: "Task Breakdown", ru: "Разбивка задач" },
  "timesheet.thisWeek": { en: "This Week", ru: "Эта неделя" },
  "timesheet.lastWeek": { en: "Last Week", ru: "Прошлая неделя" },
  "timesheet.thisMonth": { en: "This Month", ru: "Этот месяц" },
  "timesheet.last30": { en: "Last 30 Days", ru: "30 дней" },
  "timesheet.custom": { en: "Custom", ru: "Другой" },
  "timesheet.all": { en: "All", ru: "Все" },
  "timesheet.teamVsActual": { en: "Team vs Actual", ru: "Команда / Факт" },

  // Calendar
  "calendar.title": { en: "Calendar", ru: "Календарь" },
  "calendar.total": { en: "total", ru: "всего" },
  "calendar.logged": { en: "Logged", ru: "Записано" },
  "calendar.missing": { en: "Missing", ru: "Пусто" },
  "calendar.blocker": { en: "Blocker", ru: "Блокер" },
  "calendar.actual": { en: "Actual", ru: "Факт" },
  "calendar.team": { en: "Team", ru: "Команда" },
  "calendar.promise": { en: "Promise", ru: "Обещание" },

  // Yesterday Panel
  "yesterday.title": { en: "Yesterday", ru: "Вчера" },
  "yesterday.noEntry": { en: "No entry for this date", ru: "Нет записи за эту дату" },

  // Promises
  "promise.title": { en: "Promises", ru: "Обещания" },
  "promise.placeholder": { en: "Promise... (e.g. deploy by Friday)", ru: "Обещание... (напр. деплой к пятнице)" },
  "promise.today": { en: "Today", ru: "Сегодня" },
  "promise.tomorrow": { en: "Tomorrow", ru: "Завтра" },
  "promise.overdue": { en: "overdue", ru: "просрочено" },
  "promise.due": { en: "Due", ru: "Срок" },
  "promise.done": { en: "Done", ru: "Выполнено" },

  // Settings
  "settings.title": { en: "Settings", ru: "Настройки" },
  "settings.description": { en: "Configure database sync, calendar, and Telegram integrations.", ru: "Настройка синхронизации с базой данных, календарём и Telegram." },
  "settings.database": { en: "Database", ru: "База данных" },
  "settings.googleCalendar": { en: "Google Calendar", ru: "Google Calendar" },
  "settings.telegram": { en: "Telegram", ru: "Telegram" },
  "settings.ai": { en: "AI", ru: "AI" },
  "settings.prompts": { en: "Prompts", ru: "Промпты" },
  "settings.data": { en: "Data", ru: "Данные" },
  "settings.language": { en: "Language", ru: "Язык" },
  "settings.save": { en: "Save", ru: "Сохранить" },
  "settings.disconnect": { en: "Disconnect", ru: "Отключить" },
  "settings.saveConnect": { en: "Save & Connect", ru: "Сохранить" },
  "settings.saveSettings": { en: "Save Settings", ru: "Сохранить" },
  "settings.testConnection": { en: "Test Connection", ru: "Тест соединения" },
  "settings.dangerZone": { en: "Danger Zone", ru: "Опасная зона" },
  "settings.deleteAll": { en: "Delete All Local Data", ru: "Удалить все данные" },
  "settings.deleteEntries": { en: "Delete Entries Only", ru: "Удалить только записи" },
  "settings.resetDefaults": { en: "Reset to Defaults", ru: "Сбросить по умолчанию" },
  "settings.savePrompts": { en: "Save Prompts", ru: "Сохранить промпты" },
  "settings.standupSchedule": { en: "Standup Schedule", ru: "Расписание стендапов" },
  "settings.exportAll": { en: "Export All Data", ru: "Экспорт всех данных" },
  "settings.exportAllDesc": { en: "Download all your data as a JSON backup file.", ru: "Скачать все данные как JSON-файл." },

  // Empty State
  "empty.title": { en: "No projects yet", ru: "Проектов пока нет" },
  "empty.add": { en: "Add your first project", ru: "Добавьте первый проект" },

  // Command Palette
  "command.placeholder": { en: "Add task, switch project, or buffer...", ru: "Добавить задачу, сменить проект..." },
  "command.quickActions": { en: "Quick Actions", ru: "Быстрые действия" },
  "command.addTo": { en: "Add to", ru: "Добавить в" },
  "command.addToBacklog": { en: "Add to backlog", ru: "В бэклог" },
  "command.bankIt": { en: "Bank it (buffer)", ru: "В банк (буфер)" },
  "command.switchProject": { en: "Switch Project", ru: "Сменить проект" },

  // Tasks History
  "tasks.whatIDid": { en: "What I did", ru: "Что сделал" },
  "tasks.whatImDoing": { en: "What I'm doing next", ru: "Что буду делать" },
  "tasks.blockers": { en: "Blockers", ru: "Блокеры" },
  "tasks.fullLog": { en: "Full log for", ru: "Полный лог за" },
  "tasks.reported": { en: "Reported", ru: "Отправлено" },
  "tasks.done": { en: "Did", ru: "Сделано" },
  "tasks.doing": { en: "Next", ru: "Далее" },

  // Weekly Retro
  "retro.title": { en: "AI Weekly Retrospective", ru: "AI Еженедельная ретроспектива" },
  "retro.generate": { en: "Generate Retro", ru: "Генерировать ретро" },

  // Common
  "common.copy": { en: "Copy", ru: "Копировать" },
  "common.export": { en: "Export", ru: "Экспорт" },
  "common.import": { en: "Import", ru: "Импорт" },
  "common.today": { en: "TODAY", ru: "СЕГОДНЯ" },
  "common.active": { en: "active", ru: "актив" },
  "common.noProjects": { en: "No projects yet.", ru: "Проектов пока нет." },
  "common.selectProject": { en: "Select a project from the sidebar.", ru: "Выберите проект из боковой панели." },
  "common.cancel": { en: "Cancel", ru: "Отмена" },

  // Days of week
  "day.mon": { en: "Mon", ru: "Пн" },
  "day.tue": { en: "Tue", ru: "Вт" },
  "day.wed": { en: "Wed", ru: "Ср" },
  "day.thu": { en: "Thu", ru: "Чт" },
  "day.fri": { en: "Fri", ru: "Пт" },
  "day.sat": { en: "Sat", ru: "Сб" },
  "day.sun": { en: "Sun", ru: "Вс" },
} as const;

export type TranslationKey = keyof typeof translations;

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: "en",
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "ru" || saved === "en") return saved;
    const browserLang = navigator.language.toLowerCase();
    return browserLang.startsWith("ru") ? "ru" : "en";
  });

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(LANG_KEY, newLocale);
  }, []);

  const t = useCallback(
    (key: TranslationKey, fallback?: string): string => {
      const entry = translations[key];
      if (!entry) return fallback || key;
      return entry[locale] || entry.en || fallback || key;
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
