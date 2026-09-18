'use client';

import { GlassPanel, Toggle } from '@/components/ui';
import { useTheme } from '@/components/theme-provider';
import { hasDesktopApi, useSettings } from '@/lib/hooks';

const ALL_ACTIVITIES: { id: string; label: string }[] = [
  { id: 'toilet', label: '上厕所' },
  { id: 'eyes', label: '远眺' },
  { id: 'water', label: '喝水' },
  { id: 'stretch', label: '伸展' },
  { id: 'walk', label: '走动' },
  { id: 'breathe', label: '深呼吸' },
  { id: 'neck', label: '转转脖子' },
  { id: 'eyes20', label: '20-20-20' },
  { id: 'stand', label: '站起来' },
  { id: 'face', label: '洗把脸' },
  { id: 'shoulder', label: '肩颈放松' },
  { id: 'rest', label: '闭眼片刻' },
];

const THEME_OPTIONS = [
  { id: 'system', label: '跟随系统' },
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
] as const;

export default function SettingsPage() {
  const { settings, loading, update } = useSettings();
  const { theme, setTheme } = useTheme();

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

  if (loading || !settings) return <div className="loading">加载设置…</div>;

  const toggleActivity = async (id: string) => {
    const has = settings.activities.includes(id);
    const next = has
      ? settings.activities.filter((a) => a !== id)
      : [...settings.activities, id];
    if (next.length === 0) return;
    await update({ activities: next });
  };

  const activeTheme = settings.theme || theme;

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
                  onClick={() => {
                    setTheme(t.id);
                    update({ theme: t.id });
                  }}
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
              onChange={(v) => update({ workEnabled: v })}
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
                <input
                  type="time"
                  value={settings.workStart}
                  onChange={(e) => update({ workStart: e.target.value || '09:00' })}
                  aria-label="上班时间"
                />
              </div>
              <div className="field">
                <div className="label">
                  <span>下班</span>
                  <small>默认 18:00</small>
                </div>
                <input
                  type="time"
                  value={settings.workEnd}
                  onChange={(e) => update({ workEnd: e.target.value || '18:00' })}
                  aria-label="下班时间"
                />
              </div>
              <div className="field">
                <div className="label">
                  <span>仅工作日</span>
                  <small>周一至周五</small>
                </div>
                <Toggle
                  checked={settings.weekdaysOnly}
                  onChange={(v) => update({ weekdaysOnly: v })}
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
              onChange={(v) => update({ quietHoursEnabled: v })}
              label="安静时段"
            />
          </div>
          {settings.quietHoursEnabled && (
            <div className="field">
              <div className="label">
                <span>时段范围</span>
                <small>默认 11:30–13:30</small>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="time"
                  value={settings.quietHoursStart}
                  onChange={(e) =>
                    update({ quietHoursStart: e.target.value || '11:30' })
                  }
                  aria-label="安静时段开始"
                />
                <span style={{ color: 'var(--text-faint)' }}>–</span>
                <input
                  type="time"
                  value={settings.quietHoursEnd}
                  onChange={(e) =>
                    update({ quietHoursEnd: e.target.value || '13:30' })
                  }
                  aria-label="安静时段结束"
                />
              </div>
            </div>
          )}
        </GlassPanel>

        <GlassPanel className="section">
          <h2>时间</h2>

          <div className="field">
            <div className="label">
              <span>专注时长</span>
              <small>默认 50 分钟</small>
            </div>
            <input
              type="number"
              min={5}
              max={180}
              value={settings.focusMinutes}
              onChange={(e) => update({ focusMinutes: Number(e.target.value) || 50 })}
              aria-label="专注时长（分钟）"
            />
          </div>

          <div className="field">
            <div className="label">
              <span>休息时长</span>
              <small>建议 5 分钟</small>
            </div>
            <input
              type="number"
              min={1}
              max={60}
              value={settings.breakMinutes}
              onChange={(e) => update({ breakMinutes: Number(e.target.value) || 5 })}
              aria-label="休息时长（分钟）"
            />
          </div>

          <div className="field">
            <div className="label">
              <span>推迟上限</span>
              <small>超过后会温和提醒</small>
            </div>
            <input
              type="number"
              min={0}
              max={10}
              value={settings.maxPostpones}
              onChange={(e) => update({ maxPostpones: Number(e.target.value) || 0 })}
              aria-label="推迟上限"
            />
          </div>
        </GlassPanel>

        <GlassPanel className="section">
          <h2>休息动作</h2>
          <p className="empty" style={{ padding: '0 0 8px', textAlign: 'left' }}>
            至少保留一项。休息时可勾选完成的动作。
          </p>
          <div className="act-toggles">
            {ALL_ACTIVITIES.map((a) => (
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
              onChange={(v) => update({ alwaysOnTop: v })}
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
              onChange={(v) => update({ autostartFocus: v })}
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
              onChange={(v) => update({ soundEnabled: v })}
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
              onChange={(v) => update({ strictMode: v })}
              label="严格模式"
            />
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
