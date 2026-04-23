import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

export function AppShell({
  children,
  banner,
}: {
  children: ReactNode;
  /**
   * Top strip for global notifications (e.g. update banner). Rendered above
   * the sidebar+main split so it always gets full width.
   */
  banner?: ReactNode;
}) {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-neutral-975 text-neutral-100 antialiased">
      {banner}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex flex-1 flex-col overflow-hidden bg-neutral-950">
          {children}
        </main>
      </div>
    </div>
  );
}
