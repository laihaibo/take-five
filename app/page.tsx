'use client';

import { memo, Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  GlassPanel,
  ProgressRing,
  ActivityIcon,
  PinIcon,
  SunIcon,
  MoonIcon,
  SystemThemeIcon,
  CheckMark,
} from '@/components/ui';
import { useTheme } from '@/components/theme-provider';
import {
  formatClock,
  hasDesktopApi,
  modeLabel,
  useTimerState,
} from '@/lib/hooks';
import type { ActivityCopy, TakeFiveApi, TimerState } from '@/types';

type CallFn = (fn: (a: TakeFiveApi) => Promise<unknown>) => Promise<void>;

function ThemeCycleButton() {
  const { theme, setTheme } = useTheme();
  const label =
    theme === 'system' ? '跟随系统' : theme === 'light' ? '浅色' : '深色';
  const next =
    theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  const nextLabel =
    next === 'system' ? '跟随系统' : next === 'light' ? '浅色' : '深色';
  return (
    <button
      type="button"
      className={`icon-btn theme-btn is-${theme}`}
      title={`主题：${label}（点击切换为${nextLabel}）`}
      aria-label={`主题：${label}，点击切换为${nextLabel}`}
      onClick={() => setTheme(next)}
    >
      {theme === 'light' && <SunIcon />}
      {theme === 'dark' && <MoonIcon />}
      {theme === 'system' && <SystemThemeIcon />}
    </button>
  );
}

// 250ms 状态推送会让整棵树重渲染；chips 用稳定 props + memo，
// 只有勾选集/推荐位真正变化时才重画
const ActivityChips = memo(function ActivityChips({
  activities,
  suggestedId,
  checkedKey,
  selectable = false,
  onToggle,
}: {
  activities: ActivityCopy[];
  suggestedId: string;
  checkedKey: string;
  selectable?: boolean;
  onToggle?: (id: string) => void;
}) {
  const checked = useMemo(
    () => new Set(checkedKey ? checkedKey.split(',') : []),
    [checkedKey]
  );
  return (
    <div className="chips" aria-label="休息动作">
      {activities.map((a) => {
        const on = selectable ? checked.has(a.id) : a.id === suggestedId;
        return (
          <button
            key={a.id}
            type="button"
            className={`chip ${on ? 'active' : ''}`}
            aria-pressed={on}
            onClick={() => onToggle?.(a.id)}
            disabled={!selectable}
          >
            {selectable ? (
              <span className="check">{on ? <CheckMark /> : null}</span>
            ) : (
              <ActivityIcon id={a.id} size={14} />
            )}
            {a.label}
          </button>
        );
      })}
    </div>
  );
});

function BreakOverlay({ state, call }: { state: TimerState; call: CallFn }) {
  const s = state.settings;
  const overLimit = state.postponeCount >= s.maxPostpones;
  const panelRef = useRef<HTMLDivElement>(null);

  // 打开时聚焦主按钮，Tab 焦点锁在对话框内
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.querySelector<HTMLButtonElement>('.btn-break')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener('keydown', onKey);
    return () => panel.removeEventListener('keydown', onKey);
  }, []);

  const onToggle = useCallback(
    (id: string) => call((a) => a.toggleActivity(id)),
    [call]
  );

  return (
    <div
      className="break-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="break-title"
    >
      <GlassPanel className="break-card" breakMode strong>
        <div ref={panelRef} className="break-card-inner">
          <div className="mode-pill break">
            <span className="dot" />
            休息提示
          </div>
          <h1 id="break-title">休息一下</h1>
          <p className="hint">
            已专注 {state.plannedMinutes} 分钟。勾选你完成的动作，再点「完成休息」。
            <br />
            建议：<strong>{state.suggestedActivity.label}</strong> ——{' '}
            {state.suggestedActivity.hint}
          </p>

          <ActivityChips
            activities={state.suggestedActivities}
            suggestedId={state.suggestedActivity.id}
            checkedKey={state.checkedActivities.join(',')}
            selectable
            onToggle={onToggle}
          />

          <div className="btn-row">
            <button
              type="button"
              className="btn btn-break"
              onClick={() => call((a) => a.completeBreak(state.checkedActivities))}
            >
              完成休息 · {s.breakMinutes} 分钟
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => call((a) => a.startBreak())}
            >
              先倒计时
            </button>
          </div>

          <div className="postpone-row">
            {s.postponeOptions.map((m) => (
              <button
                key={m}
                type="button"
                className="btn btn-ghost"
                disabled={s.strictMode || overLimit}
                onClick={() => call((a) => a.postpone(m))}
              >
                推迟 {m} 分
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => call((a) => a.skip())}
          >
            跳过这次
          </button>

          <p className={`postpone-note ${overLimit ? 'warn' : ''}`}>
            {s.strictMode
              ? '严格模式已开启，暂不可推迟'
              : overLimit
                ? `已推迟 ${state.postponeCount} 次，尽量起来动一下`
                : `已推迟 ${state.postponeCount} / ${s.maxPostpones} 次`}
          </p>
        </div>
      </GlassPanel>
    </div>
  );
}

function HomeApp() {
  const { state, ready, call } = useTimerState();
  const search = useSearchParams();
  const isBreakView = search.get('view') === 'break';
  const onToggle = useCallback(
    (id: string) => call((a) => a.toggleActivity(id)),
    [call]
  );

  useEffect(() => {
    document.title = isBreakView ? '休息一下' : 'Take Five';
  }, [isBreakView]);

  if (!ready) return <div className="loading">正在启动…</div>;

  if (!hasDesktopApi() || !state) {
    return (
      <div className="page">
        <div className="page-narrow">
          <GlassPanel className="section">
            <h2>Take Five</h2>
            <p className="empty">
              请通过 Electron 桌面应用打开本界面。
              <br />
              开发命令：<code>pnpm dev</code>
            </p>
          </GlassPanel>
        </div>
      </div>
    );
  }

  if (isBreakView || state.mode === 'break-prompt') {
    return <BreakOverlay state={state} call={call} />;
  }

  const isBreak = state.mode === 'break';
  const isPaused = state.mode === 'paused';
  const isFocus =
    state.mode === 'focus' || (isPaused && state.previousMode === 'focus');
  const isIdle = state.mode === 'idle';
  const s = state.settings;

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" />
          <div>
            <div>Take Five</div>
            <div className="brand-sub">
              {s.workStart}–{s.workEnd} · 认真休息
            </div>
          </div>
        </div>
        <div className="topbar-actions">
          <ThemeCycleButton />
          <button
            type="button"
            className={`btn btn-ghost pin-btn ${s.alwaysOnTop ? 'is-on' : ''}`}
            aria-pressed={s.alwaysOnTop}
            title={s.alwaysOnTop ? '取消置顶' : '钉在桌面最前端'}
            onClick={() => call((a) => a.setAlwaysOnTop(!s.alwaysOnTop))}
          >
            <PinIcon on={s.alwaysOnTop} />
            {s.alwaysOnTop ? '已置顶' : '置顶'}
          </button>
        </div>
      </header>

      {state.quiet && (
        <div className="banner quiet-banner" role="status">
          午休 / 安静时段（{s.quietHoursStart}–{s.quietHoursEnd}）
          ，提醒会自动顺延
        </div>
      )}
      {!state.quiet && s.workEnabled && !state.inWorkHours && (
        <div className="banner work-banner" role="status">
          当前不在工作时间（{s.workStart}–{s.workEnd}
          {s.weekdaysOnly ? '，仅工作日' : ''}）· 到点自动清空，上班后点「开始专注」即可
        </div>
      )}

      <div className="page-narrow">
        <GlassPanel className="hero" strong breakMode={isBreak}>
          <div
            className={`mode-pill ${
              isBreak ? 'break' : isFocus ? 'focus' : isPaused ? 'paused' : ''
            }`}
          >
            <span className="dot" />
            {modeLabel(state.mode)}
            {state.cycle > 0 ? ` · 第 ${state.cycle + 1} 轮` : ''}
          </div>

          <div className="ring-wrap">
            <ProgressRing progress={state.progress} mode={state.mode} />
            <div className="ring-inner">
              <div className="time-display" role="timer">
                {formatClock(state.remainingMs)}
              </div>
              <div className="time-label">
                {isBreak
                  ? `休息 · ${state.suggestedActivity.label}`
                  : isIdle
                    ? `专注 ${state.plannedMinutes} 分钟`
                    : '专注中 · 还剩'}
              </div>
            </div>
          </div>

          <div className="btn-row">
            {isIdle && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => call((a) => a.startFocus())}
              >
                开始专注
              </button>
            )}
            {isFocus && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => call((a) => a.pause())}
              >
                暂停
              </button>
            )}
            {isPaused && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => call((a) => a.resume())}
              >
                继续
              </button>
            )}
            {isBreak && (
              <button
                type="button"
                className="btn btn-break"
                onClick={() => call((a) => a.completeBreak(state.checkedActivities))}
              >
                休息结束
              </button>
            )}
            {!isIdle && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => call((a) => a.reset())}
              >
                重置
              </button>
            )}
          </div>
        </GlassPanel>

        <GlassPanel className="section">
          <h2>{isBreak ? '本次休息动作（可勾选）' : '可用休息动作'}</h2>
          <ActivityChips
            activities={state.suggestedActivities}
            suggestedId={state.suggestedActivity.id}
            checkedKey={state.checkedActivities.join(',')}
            selectable={isBreak}
            onToggle={onToggle}
          />
          <p className="empty" style={{ paddingTop: 12 }}>
            {state.suggestedActivity.hint}
          </p>
        </GlassPanel>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="loading">加载中…</div>}>
      <HomeApp />
    </Suspense>
  );
}
