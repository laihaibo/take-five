'use client';

import { GlassPanel } from '@/components/ui';
import { formatDuration, formatTime, hasDesktopApi, useStats } from '@/lib/hooks';
import { ActivityIcon } from '@/components/ui';

const ACTION_LABEL: Record<string, string> = {
  completed: '完成',
  postponed: '推迟',
  skipped: '跳过',
  pending: '进行中',
};

const ACT_LABEL: Record<string, string> = {
  toilet: '上厕所',
  eyes: '远眺',
  water: '喝水',
  stretch: '伸展',
  walk: '走动',
  breathe: '深呼吸',
  neck: '转转脖子',
  eyes20: '20-20-20',
  stand: '站起来',
  face: '洗把脸',
  shoulder: '肩颈放松',
  rest: '闭眼片刻',
};

export default function StatsPage() {
  const { today, week, events, loading } = useStats();

  if (!hasDesktopApi()) {
    return (
      <div className="page">
        <div className="page-narrow">
          <GlassPanel className="section">
            <h2>统计</h2>
            <p className="empty">请在桌面应用中打开以查看记录。</p>
          </GlassPanel>
        </div>
      </div>
    );
  }

  if (loading) return <div className="loading">加载统计…</div>;

  const max = Math.max(
    1,
    ...week.map((d) => d.completed + d.postponed + d.skipped)
  );

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" />
          <div>
            <div>统计</div>
            <div className="brand-sub">诚实记录，不美化</div>
          </div>
        </div>
      </header>

      <div className="page-narrow">
        <GlassPanel className="section" strong>
          <h2>今天</h2>
          <div className="stat-grid">
            <div className="stat">
              <div className="num ok">{today?.completed ?? 0}</div>
              <div className="lab">完成休息</div>
            </div>
            <div className="stat">
              <div className="num accent">{today?.postponed ?? 0}</div>
              <div className="lab">推迟</div>
            </div>
            <div className="stat">
              <div className="num warn">{today?.skipped ?? 0}</div>
              <div className="lab">跳过</div>
            </div>
          </div>
          {typeof today?.streak === 'number' && today.streak > 0 && (
            <p className="empty" style={{ paddingBottom: 0 }}>
              连续完成休息 {today.streak} 天
            </p>
          )}
          <p className="empty" style={{ paddingBottom: 0 }}>
            今日休息累计 {formatDuration(today?.breakSeconds ?? 0)}
          </p>
        </GlassPanel>

        <GlassPanel className="section">
          <h2>近 7 天</h2>
          <div className="week-bars" role="img" aria-label="近七天完成、推迟、跳过对比">
            {week.map((d) => {
              const total = d.completed + d.postponed + d.skipped;
              const h = (v: number) => (v / max) * 100;
              const day = new Date(d.date + 'T12:00:00').toLocaleDateString('zh-CN', {
                weekday: 'short',
              });
              return (
                <div className="week-bar" key={d.date} title={`${d.date} 完成 ${d.completed}`}>
                  <div className="stack">
                    {d.skipped > 0 && (
                      <div className="seg s" style={{ height: `${h(d.skipped)}%` }} />
                    )}
                    {d.postponed > 0 && (
                      <div className="seg p" style={{ height: `${h(d.postponed)}%` }} />
                    )}
                    {d.completed > 0 && (
                      <div className="seg c" style={{ height: `${h(d.completed)}%` }} />
                    )}
                    {total === 0 && <div className="seg s" style={{ height: '4px', opacity: 0.3 }} />}
                  </div>
                  <div className="day">{day}</div>
                </div>
              );
            })}
          </div>
        </GlassPanel>

        <GlassPanel className="section">
          <h2>最近记录</h2>
          {events.length === 0 ? (
            <p className="empty">还没有记录。开始第一轮专注后，这里会诚实记下每一次选择。</p>
          ) : (
            <div className="event-list">
              {events.slice(0, 20).map((e) => (
                <div className="event" key={e.id}>
                  <div className="left">
                    <div className="title">
                      {e.completedActivities?.length ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {e.completedActivities.map((id) => (
                            <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <ActivityIcon id={id} size={14} />
                              {ACT_LABEL[id] || id}
                            </span>
                          ))}
                        </span>
                      ) : e.activity ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <ActivityIcon id={e.activity} size={14} />
                          {ACT_LABEL[e.activity] || e.activity}
                        </span>
                      ) : (
                        '休息'
                      )}
                    </div>
                    <div className="meta">
                      {formatTime(e.resolvedAt || e.promptedAt || e.scheduledAt)}
                      {e.postponeMinutes ? ` · 推迟 ${e.postponeMinutes} 分` : ''}
                      {e.durationSeconds ? ` · ${formatDuration(e.durationSeconds)}` : ''}
                      {e.postponeCount > 0 ? ` · 第 ${e.postponeCount} 次推迟` : ''}
                      {e.note === 'quiet-hours' ? ' · 午休顺延' : ''}
                      {e.note === 'outside-work-hours' ? ' · 非工作时段' : ''}
                    </div>
                  </div>
                  <span className={`badge ${e.action}`}>
                    {ACTION_LABEL[e.action] || e.action}
                  </span>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
