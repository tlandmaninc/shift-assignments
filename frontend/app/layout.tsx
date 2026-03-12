'use client';

import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { AuthProvider } from '@/contexts/AuthContext';
import { WebSocketProvider } from '@/components/exchange/WebSocketProvider';
import { Analytics } from '@vercel/analytics/next';
import { useState, useEffect } from 'react';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { usePathname } from 'next/navigation';

const plusJakarta = Plus_Jakarta_Sans({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const pathname = usePathname();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  // Don't show layout for login and unauthorized pages
  const isAuthPage = pathname === '/login' || pathname === '/unauthorized';

  return (
    <html lang="en" className={darkMode ? 'dark' : ''}>
      <body className={`${plusJakarta.className} bg-slate-50 dark:bg-slate-950 min-h-screen`} suppressHydrationWarning>
        <AuthProvider>
          <WebSocketProvider>
            {isAuthPage ? (
              // Auth pages without layout
              children
            ) : (
              // Main app with layout
              <div className="flex h-dvh overflow-hidden">
                <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} isMobile={isMobile} />

                <div className="flex-1 flex flex-col overflow-auto">
                  <Header
                    darkMode={darkMode}
                    onToggleDarkMode={() => setDarkMode(!darkMode)}
                    sidebarOpen={sidebarOpen}
                    onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
                  />

                  <main className="flex-1 p-3 sm:p-6">
                    <div className="max-w-7xl mx-auto">
                      {children}
                    </div>
                  </main>
                </div>
              </div>
            )}

            <Toaster
              position="bottom-right"
              toastOptions={{
                className: 'dark:bg-slate-800 dark:text-white',
                duration: 4000,
              }}
            />
          </WebSocketProvider>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
