import {
  getSettings,
  insertFocusSession,
  updateFocusSession,
  insertBreakEvent,
  isInQuietHours,
  isInWorkHours,
} from './db.mjs';

export const ACTIVITY_COPY = {
  toilet: { label: '上厕所', hint: '起来走动，让身体松一松' },
  eyes: { label: '远眺', hint: '看向窗外最远处，眨眨眼 20 秒' },
  water: { label: '喝水', hint: '接一杯水，慢慢喝完' },
  stretch: { label: '伸展', hint: '站起来，肩颈腰背各拉一下' },
  walk: { label: '走动', hint: '在工位附近走两圈，2 分钟即可' },
  breathe: { label: '深呼吸', hint: '吸 4 秒 · 屏 4 秒 · 呼 6 秒，做 5 组' },
  neck: { label: '转转脖子', hint: '缓慢左右转头，别猛甩' },
  eyes20: { label: '20-20-20', hint: '每 20 分钟看 20 英尺外 20 秒' },
  stand: { label: '站起来', hint: '离开椅子 1 分钟，膝盖微屈' },
  face: { label: '洗把脸', hint: '用冷水清醒一下，顺便看看窗外' },
  shoulder: { label: '肩颈放松', hint: '耸肩再放下，前后绕环各 8 次' },
  rest: { label: '闭眼片刻', hint: '闭眼 1 分钟，让屏幕休息一下' },
};

function pick(list) {
  return list?.length ? list[Math.floor(Math.random() * list.length)] : 'eyes';
}

function minutesUntilQuietEnd(s, now = new Date()) {
  if (!s.quietHoursEnabled) return 0;
  const [sh, sm] = s.quietHoursStart.split(':').map(Number);
  const [eh, em] = s.quietHoursEnd.split(':').map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  const mins = now.getHours() * 60 + now.getMinutes();
  if (start <= end) {
    if (mins >= start && mins < end) return end - mins;
    return 0;
  }
  if (mins >= start) return 24 * 60 - mins + end;
  if (mins < end) return end - mins;
  return 0;
}

export function createBreakTimer(onState) {
  const listeners = new Set(onState ? [onState] : []);
  const state = {
    mode: 'idle',
    previousMode: null,
    plannedMinutes: 50,
    breakMinutes: 5,
    sessionStartedAt: null,
    sessionEndsAt: null,
    remainingMs: 0,
    elapsedMs: 0,
    focusSessionId: null,
    suggestedActivity: 'eyes',
    postponeCount: 0,
    maxPostpones: 3,
    afterPostpone: false,
    cycle: 0,
    checkedActivities: new Set(['eyes']),
  };

  let interval = null;
  let lastTick = Date.now();
  let lastInWorkHours = null;

  function getActCopy(id) {
    return ACTIVITY_COPY[id] || ACTIVITY_COPY.eyes;
  }

  function snapshot() {
    const s = getSettings();
    const acts = (s.activities || ['eyes']).map((id) => ({
      id,
      ...getActCopy(id),
    }));
    const total =
      state.mode === 'break'
        ? state.breakMinutes * 60_000
        : state.plannedMinutes * 60_000;
    return {
      mode: state.mode,
      previousMode: state.previousMode,
      plannedMinutes: state.plannedMinutes,
      breakMinutes: state.breakMinutes,
      sessionStartedAt: state.sessionStartedAt,
      sessionEndsAt: state.sessionEndsAt,
      remainingMs: Math.max(0, state.remainingMs),
      elapsedMs: state.elapsedMs,
      progress: total ? Math.min(1, state.elapsedMs / total) : 0,
      suggestedActivity: {
        id: state.suggestedActivity,
        ...getActCopy(state.suggestedActivity),
      },
      suggestedActivities: acts,
      postponeCount: state.postponeCount,
      maxPostpones: s.maxPostpones,
      activityCopy: ACTIVITY_COPY,
      quiet: isInQuietHours(s),
      inWorkHours: isInWorkHours(s),
      cycle: state.cycle,
      checkedActivities: Array.from(state.checkedActivities),
      settings: {
        focusMinutes: s.focusMinutes,
        breakMinutes: s.breakMinutes,
        maxPostpones: s.maxPostpones,
        postponeOptions: s.postponeOptions,
        activities: s.activities,
        strictMode: s.strictMode,
        soundEnabled: s.soundEnabled,
        quietHoursEnabled: s.quietHoursEnabled,
        quietHoursStart: s.quietHoursStart,
        quietHoursEnd: s.quietHoursEnd,
        workStart: s.workStart,
        workEnd: s.workEnd,
        workEnabled: s.workEnabled,
        weekdaysOnly: s.weekdaysOnly,
        theme: s.theme,
        autostartFocus: s.autostartFocus,
        alwaysOnTop: s.alwaysOnTop,
      },
    };
  }

  function emit() {
    const snap = snapshot();
    for (const fn of listeners) fn(snap);
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function stopInterval() {
    if (interval) clearInterval(interval);
    interval = null;
  }

  function startInterval() {
    stopInterval();
    lastTick = Date.now();
    interval = setInterval(tick, 250);
  }

  function cleanupFocus(status = 'interrupted') {
    if (!state.focusSessionId) return;
    updateFocusSession(state.focusSessionId, {
      endedAt: new Date().toISOString(),
      actualSeconds: Math.round(state.elapsedMs / 1000),
      status,
    });
    state.focusSessionId = null;
  }

  function enterBreakPrompt() {
    stopInterval();
    cleanupFocus('completed');
    const s = getSettings();

    // 午休等安静时段：不弹窗，顺延到安静结束
    if (isInQuietHours(s)) {
      const wait = Math.max(5, minutesUntilQuietEnd(s));
      insertBreakEvent({
        scheduledAt: new Date().toISOString(),
        promptedAt: new Date().toISOString(),
        resolvedAt: new Date().toISOString(),
        action: 'postponed',
        activity: state.suggestedActivity,
        postponeMinutes: wait,
        postponeCount: state.postponeCount + 1,
        note: 'quiet-hours',
      });
      state.postponeCount += 1;
      state.plannedMinutes = wait;
      state.mode = 'focus';
      state.afterPostpone = true;
      state.sessionStartedAt = new Date().toISOString();
      state.sessionEndsAt = new Date(Date.now() + wait * 60_000).toISOString();
      state.remainingMs = wait * 60_000;
      state.elapsedMs = 0;
      state.focusSessionId = null;
      startInterval();
      emit();
      return;
    }

    // 非工作时间：不打扰，回到待开始
    if (!isInWorkHours(s)) {
      insertBreakEvent({
        scheduledAt: new Date().toISOString(),
        promptedAt: new Date().toISOString(),
        resolvedAt: new Date().toISOString(),
        action: 'skipped',
        activity: state.suggestedActivity,
        postponeCount: state.postponeCount,
        note: 'outside-work-hours',
      });
      state.mode = 'idle';
      state.previousMode = null;
      state.afterPostpone = false;
      state.remainingMs = s.focusMinutes * 60_000;
      state.elapsedMs = 0;
      state.sessionStartedAt = null;
      state.sessionEndsAt = null;
      state.postponeCount = 0;
      emit();
      return;
    }

    state.previousMode = 'focus';
    state.mode = 'break-prompt';
    state.remainingMs = 0;
    state.sessionEndsAt = null;
    state.afterPostpone = false;
    state.suggestedActivity = pick(s.activities);
    state.checkedActivities = new Set([state.suggestedActivity]);
    insertBreakEvent({
      scheduledAt: new Date().toISOString(),
      promptedAt: new Date().toISOString(),
      action: 'pending',
      activity: state.suggestedActivity,
      postponeCount: state.postponeCount,
    });
    emit();
  }

  function tick() {
    const s = getSettings();
    const now = Date.now();
    const delta = now - lastTick;
    lastTick = now;

    checkWorkBoundary(s);
    // endWorkday may have switched mode
    if (state.mode === 'idle') return;

    if (state.mode !== 'focus' && state.mode !== 'break') {
      return;
    }
    state.remainingMs = Math.max(0, state.remainingMs - delta);
    state.elapsedMs += delta;
    if (state.remainingMs <= 0) {
      if (state.mode === 'break') completeBreak(true);
      else enterBreakPrompt();
      return;
    }
    emit();
  }

  function startFocus() {
    cleanupFocus('interrupted');
    const s = getSettings();
    state.plannedMinutes = s.focusMinutes;
    state.breakMinutes = s.breakMinutes;
    state.maxPostpones = s.maxPostpones;
    state.mode = 'focus';
    state.previousMode = null;
    state.afterPostpone = false;
    state.sessionStartedAt = new Date().toISOString();
    state.sessionEndsAt = new Date(
      Date.now() + s.focusMinutes * 60_000
    ).toISOString();
    state.remainingMs = s.focusMinutes * 60_000;
    state.elapsedMs = 0;
    state.postponeCount = 0;
    state.focusSessionId = insertFocusSession({
      startedAt: state.sessionStartedAt,
      plannedMinutes: s.focusMinutes,
    });
    startInterval();
    emit();
  }

  function startBreak() {
    const s = getSettings();
    state.mode = 'break';
    state.breakMinutes = s.breakMinutes;
    state.remainingMs = s.breakMinutes * 60_000;
    state.elapsedMs = 0;
    state.sessionStartedAt = new Date().toISOString();
    state.sessionEndsAt = new Date(
      Date.now() + s.breakMinutes * 60_000
    ).toISOString();
    state.focusSessionId = null;
    startInterval();
    emit();
  }

  function postponeBreak(minutes) {
    if (state.mode !== 'break-prompt') return;
    const s = getSettings();
    const opts = s.postponeOptions?.length ? s.postponeOptions : [5, 10, 15];
    const mins = opts.includes(Number(minutes)) ? Number(minutes) : opts[0];
    state.postponeCount += 1;
    insertBreakEvent({
      scheduledAt: new Date().toISOString(),
      promptedAt: new Date().toISOString(),
      resolvedAt: new Date().toISOString(),
      action: 'postponed',
      activity: state.suggestedActivity,
      postponeMinutes: mins,
      postponeCount: state.postponeCount,
    });
    state.plannedMinutes = mins;
    state.mode = 'focus';
    state.afterPostpone = true;
    state.sessionStartedAt = new Date().toISOString();
    state.sessionEndsAt = new Date(Date.now() + mins * 60_000).toISOString();
    state.remainingMs = mins * 60_000;
    state.elapsedMs = 0;
    state.focusSessionId = null;
    startInterval();
    emit();
  }

  function skipBreak() {
    insertBreakEvent({
      scheduledAt: new Date().toISOString(),
      promptedAt: new Date().toISOString(),
      resolvedAt: new Date().toISOString(),
      action: 'skipped',
      activity: state.suggestedActivity,
      postponeCount: state.postponeCount,
    });
    state.cycle += 1;
    if (isInWorkHours(getSettings())) startFocus();
    else endWorkday();
  }

  function toggleCheckedActivity(id) {
    if (state.checkedActivities.has(id)) state.checkedActivities.delete(id);
    else state.checkedActivities.add(id);
    emit();
  }

  function setCheckedActivities(ids) {
    state.checkedActivities = new Set(ids || []);
    emit();
  }

  function completeBreak(natural = false, checked) {
    stopInterval();
    const seconds = natural
      ? Math.round(state.breakMinutes * 60)
      : Math.max(1, Math.round(state.elapsedMs / 1000));
    const list =
      checked && checked.length
        ? checked
        : Array.from(state.checkedActivities);
    insertBreakEvent({
      scheduledAt: new Date().toISOString(),
      promptedAt: new Date().toISOString(),
      resolvedAt: new Date().toISOString(),
      action: 'completed',
      activity: state.suggestedActivity,
      durationSeconds: seconds,
      postponeCount: state.postponeCount,
      completedActivities: list.length ? list : [state.suggestedActivity],
    });
    state.cycle += 1;
    if (isInWorkHours(getSettings())) startFocus();
    else endWorkday();
  }

  function pause() {
    if (state.mode !== 'focus' && state.mode !== 'break') return;
    state.previousMode = state.mode;
    state.mode = 'paused';
    stopInterval();
    emit();
  }

  function resume() {
    if (state.mode !== 'paused') return;
    state.mode = state.previousMode === 'break' ? 'break' : 'focus';
    state.sessionEndsAt = new Date(Date.now() + state.remainingMs).toISOString();
    startInterval();
    emit();
  }

  function reset() {
    stopInterval();
    cleanupFocus('interrupted');
    const s = getSettings();
    state.mode = 'idle';
    state.previousMode = null;
    state.afterPostpone = false;
    state.plannedMinutes = s.focusMinutes;
    state.breakMinutes = s.breakMinutes;
    state.remainingMs = s.focusMinutes * 60_000;
    state.elapsedMs = 0;
    state.sessionStartedAt = null;
    state.sessionEndsAt = null;
    state.postponeCount = 0;
    state.cycle = 0;
    state.checkedActivities = new Set([state.suggestedActivity || 'eyes']);
    emit();
  }

  /** 下班：自动清空计时，回到待开始 */
  function endWorkday() {
    stopInterval();
    cleanupFocus(state.mode === 'break' ? 'completed' : 'interrupted');
    const s = getSettings();
    state.mode = 'idle';
    state.previousMode = null;
    state.afterPostpone = false;
    state.plannedMinutes = s.focusMinutes;
    state.breakMinutes = s.breakMinutes;
    state.remainingMs = s.focusMinutes * 60_000;
    state.elapsedMs = 0;
    state.sessionStartedAt = null;
    state.sessionEndsAt = null;
    state.postponeCount = 0;
    state.cycle = 0;
    state.focusSessionId = null;
    emit();
  }

  /** 上班边界：残留状态兜底清空；可选自动开始 */
  function enterWorkday(s = getSettings()) {
    if (state.mode !== 'idle') {
      endWorkday();
    }
    if (s.autostartFocus && isInWorkHours(s)) {
      startFocus();
    } else {
      emit();
    }
  }

  /**
   * 工作时段切换：上班 → 下班自动清空；下班 → 上班兜底 reset / 可选 autostart
   */
  function checkWorkBoundary(s = getSettings()) {
    const inWork = isInWorkHours(s);
    if (lastInWorkHours === null) {
      lastInWorkHours = inWork;
      return;
    }
    if (lastInWorkHours && !inWork) {
      endWorkday();
    } else if (!lastInWorkHours && inWork) {
      enterWorkday(s);
    }
    lastInWorkHours = inWork;
  }

  function applySettings() {
    const s = getSettings();
    state.maxPostpones = s.maxPostpones;
    if (state.mode === 'idle') {
      state.plannedMinutes = s.focusMinutes;
      state.breakMinutes = s.breakMinutes;
      state.remainingMs = s.focusMinutes * 60_000;
    }
    checkWorkBoundary(s);
    emit();
  }

  function initIdle() {
    const s = getSettings();
    state.plannedMinutes = s.focusMinutes;
    state.breakMinutes = s.breakMinutes;
    state.maxPostpones = s.maxPostpones;
    state.remainingMs = s.focusMinutes * 60_000;
    state.mode = 'idle';
    lastInWorkHours = isInWorkHours(s);
    emit();
  }

  initIdle();

  return {
    subscribe,
    getState: snapshot,
    startFocus,
    startBreak,
    postpone: postponeBreak,
    skip: skipBreak,
    completeBreak,
    toggleCheckedActivity,
    setCheckedActivities,
    pause,
    resume,
    reset,
    endWorkday,
    applySettings,
  };
}
