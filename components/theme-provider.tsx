'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ThemeMode } from '@/types';

const ThemeCtx = createContext<{
  theme: ThemeMode;
  resolved: 'light' | 'dark';
  setTheme: (t: ThemeMode) => Promise<void>;
}>({
  theme: 'system',
  resolved: 'dark',
  setTheme: async () => {},
});

export function useTheme() {
  return useContext(ThemeCtx);
}

function resolveTheme(theme: ThemeMode, systemDark: boolean): 'light' | 'dark' {
  if (theme === 'system') return systemDark ? 'dark' : 'light';
  return theme;
}

function applyDom(theme: ThemeMode, systemDark: boolean) {
  const resolved = resolveTheme(theme, systemDark);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('dark');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    const sync = async (t: ThemeMode) => {
      if (!alive) return;
      setThemeState(t);
      setResolved(applyDom(t, mq.matches));
      setReady(true);
    };

    window.takeFive
      ?.getSettings()
      .then((s) => sync((s.theme as ThemeMode) || 'system'))
      .catch(() => sync('system'));

    const onSys = () => {
      setThemeState((t) => {
        setResolved(applyDom(t, mq.matches));
        return t;
      });
    };
    mq.addEventListener('change', onSys);
    return () => {
      alive = false;
      mq.removeEventListener('change', onSys);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setResolved(applyDom(theme, mq.matches));
  }, [theme, ready]);

  const setTheme = useCallback(async (t: ThemeMode) => {
    setThemeState(t);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setResolved(applyDom(t, mq.matches));
    try {
      await window.takeFive?.setSettings({ theme: t });
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ theme, resolved, setTheme }),
    [theme, resolved, setTheme]
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}
