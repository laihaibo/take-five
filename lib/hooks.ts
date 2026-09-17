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

export function useTimerState() {
  const [state, setState] = useState<TimerState | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const a = api();
    if (!a) {
      setReady(true);
      return;
    }
    let unsub = () => {};
    a.getState().then((s) => {
      setState(s);
      setReady(true);
    });
    unsub = a.onState((s) => setState(s));
    return () => unsub();
  }, []);

  const call = useCallback(
    async (fn: (a: TakeFiveApi) => Promise<unknown>) => {
      const a = api();
      if (!a) return;
      const next = await fn(a);
      if (next && typeof next === 'object' && 'mode' in (next as object)) {
        setState(next as TimerState);
        return;
      }
      // Non-timer results (e.g. alwaysOnTop) — pull fresh snapshot
      if (next && typeof next === 'object') {
        setState(await a.getState());
      }
    },
    []
  );

  return { state, ready, call };
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const a = api();
    if (!a) {
      setLoading(false);
      return;
    }
    const s = await a.getSettings();
    setSettings(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const update = useCallback(async (patch: Partial<Settings>) => {
    const a = api();
    if (!a) return;
    const next = await a.setSettings(patch);
    setSettings(next);
  }, []);

  return { settings, loading, update, reload };
}

export function useStats() {
  const [today, setToday] = useState<TodayStats | null>(null);
  const [week, setWeek] = useState<WeekDay[]>([]);
  const [events, setEvents] = useState<BreakEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const a = api();
    if (!a) {
      setLoading(false);
      return;
    }
    const [t, w, e] = await Promise.all([
      a.getTodayStats(),
      a.getWeekStats(),
      a.listEvents(50),
    ]);
    setToday(t);
    setWeek(w);
    setEvents(e);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
    const id = setInterval(reload, 15000);
    return () => clearInterval(id);
  }, [reload]);

  return { today, week, events, loading, reload };
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
