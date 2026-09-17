import Link from 'next/link';
import { NavActive } from './nav-active';

export function Nav() {
  return (
    <nav className="nav glass" aria-label="主导航">
      <Link href="/" data-nav="home">
        今日
      </Link>
      <Link href="/stats/" data-nav="stats">
        统计
      </Link>
      <Link href="/settings/" data-nav="settings">
        设置
      </Link>
      <NavActive />
    </nav>
  );
}
