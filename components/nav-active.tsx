'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export function NavActive() {
  const pathname = usePathname() || '/';

  useEffect(() => {
    const links = document.querySelectorAll('.nav a[data-nav]');
    links.forEach((a) => {
      const key = a.getAttribute('data-nav');
      const isHome = pathname === '/' || pathname === '';
      const isStats = pathname.startsWith('/stats');
      const isSettings = pathname.startsWith('/settings');
      const active =
        (key === 'home' && isHome) ||
        (key === 'stats' && isStats) ||
        (key === 'settings' && isSettings);
      a.classList.toggle('active', active);
    });

    const isBreak =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('view') === 'break';
    document.body.classList.toggle('hide-nav', isBreak);
  }, [pathname]);

  return null;
}
