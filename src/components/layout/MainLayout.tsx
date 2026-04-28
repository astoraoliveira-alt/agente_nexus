import { ReactNode } from 'react';
import { AppSidebar } from './AppSidebar';
import { SlideOverPanel } from './SlideOverPanel';
import { DataSourceBadge } from './DataSourceBadge';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex h-screen w-full bg-background overflow-hidden relative">
      <DataSourceBadge />
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      <SlideOverPanel />
    </div>
  );
}
