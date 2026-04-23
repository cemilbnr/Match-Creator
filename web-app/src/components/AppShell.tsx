import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-neutral-975 text-neutral-100 antialiased">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden bg-neutral-950">
        {children}
      </main>
    </div>
  );
}
