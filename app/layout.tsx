import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Nav } from '@/components/nav';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Take Five',
  description: '每 50 分钟，认真休息一下',
};

// 首帧前落 data-theme：localStorage 镜像优先，否则跟随系统，避免浅色用户启动闪深色
const PREPAINT_THEME = `(function(){try{var t=localStorage.getItem('tf-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: PREPAINT_THEME }} />
        <ThemeProvider>
          <div className="app-shell">
            <div className="ambient" aria-hidden />
            {children}
            <Suspense fallback={null}>
              <Nav />
            </Suspense>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
