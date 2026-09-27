'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ThemeMode } from '@/types';

const ThemeCtx = createContext<{
  theme: ThemeMode;
  resolved: 'light' | 'dark';
  setTheme: (t: ThemeMode) => void;
}>({
  theme: 'system',
  resolved: 'dark',
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeCtx);
}

const THEME_KEY = 'tf-theme';

function systemDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** 唯一的 DOM 应用点；同时写 localStorage 镜像供 pre-paint 脚本防首帧闪变 */
function applyDom(theme: ThemeMode) {
  const resolved = theme === 'system' ? (systemDark() ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  try {
    localStorage.setItem(THEME_KEY, resolved);
  } catch {
    /* ignore */
  }
  return resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('dark');
  const themeRef = useRef<ThemeMode>('system');

  const change = useCallback((t: ThemeMode, persist: boolean) => {
    themeRef.current = t;
    setThemeState(t);
    setResolved(applyDom(t));
    if (persist) {
      window.takeFive?.setSettings({ theme: t }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => {
      if (themeRef.current === 'system') {
        setResolved(applyDom('system'));
      }
    };
    mq.addEventListener('change', onSystemChange);

    // 设置库是主题的真源；首帧外观已由 layout 的 pre-paint 脚本兜住
    window.takeFive
      ?.getSettings()
      .then((s) => change((s.theme as ThemeMode) || 'system', false))
      .catch(() => change('system', false));

    return () => mq.removeEventListener('change', onSystemChange);
  }, [change]);

  const setTheme = useCallback((t: ThemeMode) => change(t, true), [change]);

  const value = useMemo(
    () => ({ theme, resolved, setTheme }),
    [theme, resolved, setTheme]
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}
