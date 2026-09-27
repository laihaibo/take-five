'use client';

import { useEffect, useState } from 'react';
import { GlassPanel, Toggle } from '@/components/ui';
import { useTheme } from '@/components/theme-provider';
import { hasDesktopApi, useSettings } from '@/lib/hooks';
import { ACTIVITIES } from '@/lib/activities';
import type { Settings } from '@/types';

const THEME_OPTIONS = [
  { id: 'system', label: '跟随系统' },
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
] as const;

const NUM_BOUNDS: Record<'focusMinutes' | 'breakMinutes' | 'maxPostpones', [number, number]> = {
  focusMinutes: [1, 180],
  breakMinutes: [1, 60],
  maxPostpones: [0, 10],
};

const HM_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

export default function SettingsPage() {
  const { settings, loading, error, update, reload } = useSettings();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  // 静态导出预渲染与客户端首帧必须落在同一分支，避免 hydration mismatch
  if (!mounted) {
    return <div className="loading page">加载设置…</div>;
  }

  if (!hasDesktopApi()) {
    return (
      <div className="page">
        <div className="page-narrow">
          <GlassPanel className="section">
            <h2>设置</h2>
            <p className="empty">请在桌面应用中打开以修改设置。</p>
          </GlassPanel>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="page-narrow">
          <GlassPanel className="section">
            <h2>设置</h2>
            <p className="empty">设置加载失败：{error}</p>
            <div className="btn-row">
              <button type="button" className="btn btn-ghost" onClick={() => reload()}>
                重试
              </button>
            </div>
          </GlassPanel>
        </div>
      </div>
    );
  }

  if (loading || !settings) {
    return <div className="loading page">加载设置…</div>;
  }

  const setDraft = (key: string, value: string) =>
    setDrafts((d) => ({ ...d, [key]: value }));
  const clearDraft = (key: string) =>
    setDrafts((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
  const draftOf = (key: string, fallback: string) => drafts[key] ?? fallback;

  const commit = async (patch: Partial<Settings>) => {
    try {
      await update(patch);
      setSaveError(null);
    } catch (err) {
      setSaveError(String(err));
    }
  };

  // 草稿在 blur/Enter 时统一提交并钳制范围，不再逐键写库
  const commitNumber = (
    key: 'focusMinutes' | 'breakMinutes' | 'maxPostpones',
    raw: string
  ) => {
    const [min, max] = NUM_BOUNDS[key];
    const n = Math.round(Number(raw));
    clearDraft(key);
    if (raw.trim() === '' || !Number.isFinite(n)) return; // 无效输入回落到当前值
    const clamped = Math.min(max, Math.max(min, n));
    if (clamped !== settings[key]) void commit({ [key]: clamped });
  };

  const commitTime = (
    key: 'workStart' | 'workEnd' | 'quietHoursStart' | 'quietHoursEnd',
    raw: string
  ) => {
    clearDraft(key);
    if (HM_RE.test(raw) && raw !== settings[key]) void commit({ [key]: raw });
  };

  const numberField = (
    key: 'focusMinutes' | 'breakMinutes' | 'maxPostpones',
    label: string,
    small: string,
    ariaLabel: string
  ) => {
    const [min, max] = NUM_BOUNDS[key];
    const value = draftOf(key, String(settings[key]));
    return (
      <div className="field">
        <div className="label">
          <span>{label}</span>
          <small>{small}</small>
        </div>
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => setDraft(key, e.target.value)}
          onBlur={() => commitNumber(key, value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          aria-label={ariaLabel}
        />
      </div>
    );
  };

  const timeField = (
    key: 'workStart' | 'workEnd' | 'quietHoursStart' | 'quietHoursEnd',
    label: string,
    small: string,
    ariaLabel: string
  ) => {
    const value = draftOf(key, settings[key]);
    return (
      <input
        type="time"
        value={value}
        onChange={(e) => setDraft(key, e.target.value)}
        onBlur={() => commitTime(key, value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        aria-label={ariaLabel}
      />
    );
  };

  const toggleActivity = async (id: string) => {
    const has = settings.activities.includes(id);
    const next = has
      ? settings.activities.filter((a) => a !== id)
      : [...settings.activities, id];
    if (next.length === 0) return; // 至少保留一项
    await commit({ activities: next });
  };

  const activeTheme = theme;

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" />
          <div>
            <div>设置</div>
            <div className="brand-sub">按你的节奏来</div>
          </div>
        </div>
      </header>

      {saveError && (
        <div className="banner work-banner" role="alert">
          保存失败：{saveError}
        </div>
      )}

      <div className="page-narrow">
        <GlassPanel className="section" strong>
          <h2>外观</h2>
          <div className="field">
            <div className="label">
              <span>主题</span>
              <small>浅色 / 深色 / 跟随系统</small>
            </div>
            <div className="theme-seg" role="group" aria-label="主题模式">
              {THEME_OPTIONS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={activeTheme === t.id}
                  onClick={() => setTheme(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="section">
          <h2>工作时段</h2>

          <div className="field">
            <div className="label">
              <span>启用工作时段</span>
              <small>只在上班时间提醒休息</small>
            </div>
            <Toggle
              checked={settings.workEnabled}
              onChange={(v) => commit({ workEnabled: v })}
              label="启用工作时段"
            />
          </div>

          {settings.workEnabled && (
            <>
              <div className="field">
                <div className="label">
                  <span>上班</span>
                  <small>默认 09:00</small>
                </div>
                {timeField('workStart', '上班', '默认 09:00', '上班时间')}
              </div>
              <div className="field">
                <div className="label">
                  <span>下班</span>
                  <small>默认 18:00</small>
                </div>
                {timeField('workEnd', '下班', '默认 18:00', '下班时间')}
              </div>
              <div className="field">
                <div className="label">
                  <span>仅工作日</span>
                  <small>周一至周五</small>
                </div>
                <Toggle
                  checked={settings.weekdaysOnly}
                  onChange={(v) => commit({ weekdaysOnly: v })}
                  label="仅工作日"
                />
              </div>
            </>
          )}
        </GlassPanel>

        <GlassPanel className="section">
          <h2>午休 / 安静时段</h2>
          <div className="field">
            <div className="label">
              <span>启用安静时段</span>
              <small>午休时不弹窗，自动顺延</small>
            </div>
            <Toggle
              checked={settings.quietHoursEnabled}
              onChange={(v) => commit({ quietHoursEnabled: v })}
              label="安静时段"
            />
          </div>
          {settings.quietHoursEnabled && (
            <div className="field">
              <div className="label">
                <span>时段范围</span>
                <small>默认 11:30–13:30</small>
              </div>
              <div className="time-pair">
                {timeField('quietHoursStart', '时段范围', '', '安静时段开始')}
                <span aria-hidden>–</span>
                {timeField('quietHoursEnd', '时段范围', '', '安静时段结束')}
              </div>
            </div>
          )}
        </GlassPanel>

        <GlassPanel className="section">
          <h2>时间</h2>

          {numberField('focusMinutes', '专注时长', '默认 50 分钟', '专注时长（分钟）')}

          {numberField('breakMinutes', '休息时长', '建议 5 分钟', '休息时长（分钟）')}

          {numberField('maxPostpones', '推迟上限', '超过后会温和提醒', '推迟上限')}
        </GlassPanel>

        <GlassPanel className="section">
          <h2>休息动作</h2>
          <p className="empty" style={{ padding: '0 0 8px', textAlign: 'left' }}>
            至少保留一项。休息时可勾选完成的动作。
          </p>
          <div className="act-toggles">
            {ACTIVITIES.map((a) => (
              <button
                key={a.id}
                type="button"
                className="act-toggle"
                aria-pressed={settings.activities.includes(a.id)}
                onClick={() => toggleActivity(a.id)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="section">
          <h2>行为</h2>

          <div className="field">
            <div className="label">
              <span>钉在桌面最前端</span>
              <small>窗口始终置顶</small>
            </div>
            <Toggle
              checked={settings.alwaysOnTop}
              onChange={(v) => commit({ alwaysOnTop: v })}
              label="钉在桌面最前端"
            />
          </div>

          <div className="field">
            <div className="label">
              <span>启动后自动开始专注</span>
              <small>默认关；上班后手动点开始。开启后仅工作时段自动进</small>
            </div>
            <Toggle
              checked={settings.autostartFocus}
              onChange={(v) => commit({ autostartFocus: v })}
              label="启动后自动开始专注"
            />
          </div>

          <div className="field">
            <div className="label">
              <span>提示音</span>
              <small>系统通知声音</small>
            </div>
            <Toggle
              checked={settings.soundEnabled}
              onChange={(v) => commit({ soundEnabled: v })}
              label="提示音"
            />
          </div>

          <div className="field">
            <div className="label">
              <span>严格模式</span>
              <small>关闭推迟按钮</small>
            </div>
            <Toggle
              checked={settings.strictMode}
              onChange={(v) => commit({ strictMode: v })}
              label="严格模式"
            />
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
