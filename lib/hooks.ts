'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BreakEvent, Settings, TakeFiveApi, TimerState, TodayStats, WeekDay } from '@/types';

function api(): TakeFiveApi | null {
  if (typeof window === 'undefined') return null;
  return window.takeFive ?? null;
}

export function hasDesktopApi() {
  return Boolean(api());
}

function isTimerState(v: unknown): v is TimerState {
  return (
    typeof v === 'object' &&
    v !== null &&
    'mode' in v &&
    'remainingMs' in v &&
    'settings' in v
  );
}

export function useTimerState() {
  const [state, setState] = useState<TimerState | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const a = api();
    if (!a) {
      setReady(true);
      return;
    }
    let alive = true;
    a.getState()
      .then((s) => {
        if (!alive) return;
        setState(s);
        setReady(true);
      })
      .catch(() => {
        if (alive) setReady(true);
      });
    const unsub = a.onState((s) => setState(s));
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  const call = useCallback(
    async (fn: (a: TakeFiveApi) => Promise<unknown>) => {
      const a = api();
      if (!a) return;
      try {
        const next = await fn(a);
        if (isTimerState(next)) {
          setState(next);
        } else if (next && typeof next === 'object') {
          // 非 TimerState 结果（如 alwaysOnTop）— 拉一份最新快照保持真实
          setState(await a.getState());
        }
      } catch (err) {
        console.error('[take-five] 调用失败:', err);
        // 动作失败时回读真实状态，避免 UI 与主进程脱节
        try {
          setState(await a.getState());
        } catch {
          /* ignore */
        }
      }
    },
    []
  );

  return { state, ready, call };
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const a = api();
    if (!a) {
      setLoading(false);
      return;
    }
    try {
      const s = await a.getSettings();
      setSettings(s);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // 写入失败向上抛，由页面展示保存错误
  const update = useCallback(async (patch: Partial<Settings>) => {
    const a = api();
    if (!a) return;
    const next = await a.setSettings(patch);
    setSettings(next);
  }, []);

  return { settings, loading, error, update, reload };
}

export function useStats() {
  const [today, setToday] = useState<TodayStats | null>(null);
  const [week, setWeek] = useState<WeekDay[]>([]);
  const [events, setEvents] = useState<BreakEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const a = api();
    if (!a) {
      setLoading(false);
      return;
    }
    try {
      const [t, w, e] = await Promise.all([
        a.getTodayStats(),
        a.getWeekStats(),
        a.listEvents(20),
      ]);
      setToday(t);
      setWeek(w);
      setEvents(e);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    // 托盘常驻时窗口处于 hidden，暂停轮询；回到前台立即刷新一次
    const id = setInterval(() => {
      if (!document.hidden) reload();
    }, 15000);
    const onVisible = () => {
      if (!document.hidden) reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);

  return { today, week, events, loading, error, reload };
}

export function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  return `${m} 分钟`;
}

export function formatTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export function modeLabel(mode: TimerState['mode']) {
  switch (mode) {
    case 'focus':
      return '专注中';
    case 'break':
      return '休息中';
    case 'break-prompt':
      return '该休息了';
    case 'paused':
      return '已暂停';
    default:
      return '待开始';
  }
}
