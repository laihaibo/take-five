export type TimerMode = 'idle' | 'focus' | 'break-prompt' | 'break' | 'paused';

export type ActivityId =
  | 'toilet'
  | 'eyes'
  | 'water'
  | 'stretch'
  | 'walk'
  | 'breathe'
  | 'neck'
  | 'eyes20'
  | 'stand'
  | 'face'
  | 'shoulder'
  | 'rest';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ActivityCopy {
  id: ActivityId | string;
  label: string;
  hint: string;
}

export interface Settings {
  focusMinutes: number;
  breakMinutes: number;
  maxPostpones: number;
  postponeOptions: number[];
  activities: string[];
  strictMode: boolean;
  soundEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  quietHoursEnabled: boolean;
  workStart: string;
  workEnd: string;
  workEnabled: boolean;
  weekdaysOnly: boolean;
  theme: ThemeMode;
  autostartFocus: boolean;
  alwaysOnTop: boolean;
}

export interface TimerState {
  mode: TimerMode;
  previousMode: TimerMode | null;
  plannedMinutes: number;
  breakMinutes: number;
  sessionStartedAt: string | null;
  sessionEndsAt: string | null;
  remainingMs: number;
  elapsedMs: number;
  progress: number;
  suggestedActivity: ActivityCopy;
  suggestedActivities: ActivityCopy[];
  postponeCount: number;
  maxPostpones: number;
  activityCopy: Record<string, { label: string; hint: string }>;
  quiet: boolean;
  inWorkHours: boolean;
  cycle: number;
  checkedActivities: string[];
  settings: Settings;
}

export interface TodayStats {
  total: number;
  completed: number;
  postponed: number;
  skipped: number;
  breakSeconds: number;
  streak?: number;
}

export interface WeekDay {
  date: string;
  completed: number;
  postponed: number;
  skipped: number;
}

export interface BreakEvent {
  id: number;
  scheduledAt: string | null;
  promptedAt: string | null;
  resolvedAt: string | null;
  action: 'completed' | 'postponed' | 'skipped' | 'pending';
  activity: string | null;
  postponeMinutes: number | null;
  durationSeconds: number | null;
  postponeCount: number;
  note: string | null;
  completedActivities?: string[];
}

export interface TakeFiveApi {
  getState: () => Promise<TimerState>;
  onState: (cb: (state: TimerState) => void) => () => void;
  onBreakDue: (cb: (state: TimerState) => void) => () => void;
  startFocus: () => Promise<TimerState>;
  pause: () => Promise<TimerState>;
  resume: () => Promise<TimerState>;
  reset: () => Promise<TimerState>;
  startBreak: () => Promise<TimerState>;
  postpone: (minutes: number) => Promise<TimerState>;
  skip: () => Promise<TimerState>;
  completeBreak: (checked?: string[]) => Promise<TimerState>;
  toggleActivity: (id: string) => Promise<TimerState>;
  getSettings: () => Promise<Settings>;
  setSettings: (patch: Partial<Settings>) => Promise<Settings>;
  getTodayStats: () => Promise<TodayStats>;
  getWeekStats: () => Promise<WeekDay[]>;
  listEvents: (limit?: number) => Promise<BreakEvent[]>;
  showMainWindow: () => Promise<void>;
  closeBreakWindow: () => Promise<void>;
  setAlwaysOnTop: (on: boolean) => Promise<{ alwaysOnTop: boolean }>;
  getAlwaysOnTop: () => Promise<{ alwaysOnTop: boolean }>;
  platform: string;
}

declare global {
  interface Window {
    takeFive?: TakeFiveApi;
  }
}
