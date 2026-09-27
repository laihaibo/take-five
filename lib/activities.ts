import type { ActivityId } from '@/types';

/**
 * 休息动作单一来源（渲染侧）。主进程侧对应 electron/timer.mjs 的 ACTIVITY_COPY，
 * 两边 id 必须保持一致；新增动作需同时改这两处。
 */
export const ACTIVITIES: { id: ActivityId; label: string }[] = [
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

export const ACTIVITY_LABEL: Record<string, string> = Object.fromEntries(
  ACTIVITIES.map((a) => [a.id, a.label])
);
