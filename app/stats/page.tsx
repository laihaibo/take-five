'use client';

import { useEffect, useState } from 'react';
import { GlassPanel, ActivityIcon } from '@/components/ui';
import { formatDuration, formatTime, hasDesktopApi, useStats } from '@/lib/hooks';
import { ACTIVITY_LABEL } from '@/lib/activities';

const ACTION_LABEL: Record<string, string> = {
  completed: '完成',
  postponed: '推迟',
  skipped: '跳过',
  pending: '进行中',
};

export default function StatsPage() {
  const { today, week, events, loading, error, reload } = useStats();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // 静态导出预渲染与客户端首帧必须落在同一分支，避免 hydration mismatch
  if (!mounted) {
    return <div className="loading page">加载统计…</div>;
  }

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

  if (error) {
    return (
      <div className="page">
        <div className="page-narrow">
          <GlassPanel className="section">
            <h2>统计</h2>
            <p className="empty">统计加载失败：{error}</p>
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

  if (loading) return <div className="loading page">加载统计…</div>;

  const max = Math.max(
    1,
    ...week.map((d) => d.completed + d.postponed + d.skipped)
  );

  const weekTotal = week.reduce(
    (acc, d) => ({
      completed: acc.completed + d.completed,
      postponed: acc.postponed + d.postponed,
      skipped: acc.skipped + d.skipped,
    }),
    { completed: 0, postponed: 0, skipped: 0 }
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
            <p className="empty tight">连续完成休息 {today.streak} 天</p>
          )}
          <p className="empty tight">
            今日休息累计 {formatDuration(today?.breakSeconds ?? 0)}
          </p>
        </GlassPanel>

        <GlassPanel className="section">
          <h2>近 7 天</h2>
          <div
            className="week-bars"
            role="img"
            aria-label={`近 7 天共完成休息 ${weekTotal.completed} 次、推迟 ${weekTotal.postponed} 次、跳过 ${weekTotal.skipped} 次`}
          >
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
                    {total === 0 && <div className="seg s seg-empty" />}
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
              {events.map((e) => (
                <div className="event" key={e.id}>
                  <div className="left">
                    <div className="title">
                      {e.completedActivities?.length ? (
                        <span className="acts">
                          {e.completedActivities.map((id) => (
                            <span className="act" key={id}>
                              <ActivityIcon id={id} size={14} />
                              {ACTIVITY_LABEL[id] || id}
                            </span>
                          ))}
                        </span>
                      ) : e.activity ? (
                        <span className="acts">
                          <span className="act">
                            <ActivityIcon id={e.activity} size={14} />
                            {ACTIVITY_LABEL[e.activity] || e.activity}
                          </span>
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
