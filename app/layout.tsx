import type { Metadata } from 'next';
import { Nav } from '@/components/nav';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Take Five',
  description: '每 50 分钟，认真休息一下',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <div className="app-shell">
            <div className="ambient" aria-hidden />
            {children}
            <Nav />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
