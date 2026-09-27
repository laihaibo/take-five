'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

const LINKS = [
  { href: '/', label: '今日', key: 'home' },
  { href: '/stats/', label: '统计', key: 'stats' },
  { href: '/settings/', label: '设置', key: 'settings' },
];

export function Nav() {
  const pathname = usePathname() || '/';
  const isBreak = useSearchParams().get('view') === 'break';
  const activeKey =
    pathname === '/' || pathname === ''
      ? 'home'
      : pathname.startsWith('/stats')
        ? 'stats'
        : pathname.startsWith('/settings')
          ? 'settings'
          : '';

  return (
    // 休息全屏层：hidden 使导航脱离渲染树，也不留在 Tab 焦点链里
    <nav className="nav glass" aria-label="主导航" hidden={isBreak}>
      {LINKS.map((l) => (
        <Link key={l.key} href={l.href} className={activeKey === l.key ? 'active' : ''}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
