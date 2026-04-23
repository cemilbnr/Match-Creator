import { useEffect, useState } from 'react';
import { pingBlender } from '../api/blenderClient';
import { useBlenderSessionStore } from '../store/sessionStore';
import { PANELS, useUI, type PanelId } from '../store/uiStore';
import {
  BoardsIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GameplayIcon,
  LayersIcon,
  SettingsIcon,
} from './icons';

type IconType = (props: { className?: string }) => JSX.Element;

const ICONS: Record<PanelId, IconType> = {
  'board-generator': BoardsIcon as IconType,
  'board-library': LayersIcon as IconType,
  'gameplay-sequencer': GameplayIcon as IconType,
  settings: SettingsIcon as IconType,
};

export function Sidebar() {
  const active = useUI((s) => s.activePanel);
  const setPanel = useUI((s) => s.setPanel);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-neutral-800 bg-neutral-950 transition-[width] duration-150 ${
        collapsed ? 'w-[64px]' : 'w-[210px]'
      }`}
    >
      <BrandRow collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="flex flex-col gap-0.5">
          {PANELS.map((p) => {
            const Icon = ICONS[p.id];
            const isActive = active === p.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setPanel(p.id)}
                  title={collapsed ? p.label : undefined}
                  className={`group flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
                    isActive
                      ? 'bg-neutral-800 text-neutral-50'
                      : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100'
                  }`}
                >
                  <Icon
                    className={`shrink-0 ${
                      isActive ? 'text-neutral-50' : 'text-neutral-500 group-hover:text-neutral-300'
                    }`}
                  />
                  {!collapsed && <span className="truncate">{p.label}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <FooterStatus collapsed={collapsed} />
    </aside>
  );
}

function BrandRow({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 border-b border-neutral-800 px-3 py-3 ${
        collapsed ? 'justify-center' : 'justify-between'
      }`}
    >
      {!collapsed && (
        <div className="flex min-w-0 items-center gap-2">
          <BrandMark />
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight text-neutral-100">
              Match Creator
            </div>
          </div>
        </div>
      )}
      {collapsed && <BrandMark />}
      <button
        type="button"
        onClick={onToggle}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
      >
        {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
      </button>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 text-[13px] font-semibold text-neutral-200">
      M3
    </div>
  );
}

function FooterStatus({ collapsed }: { collapsed: boolean }) {
  type Status = 'checking' | 'online' | 'offline';
  const [status, setStatus] = useState<Status>('checking');
  const session = useBlenderSessionStore((s) => s.session);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        await pingBlender();
        if (!cancelled) setStatus('online');
      } catch {
        if (!cancelled) setStatus('offline');
      }
    };

    void poll();
    const id = window.setInterval(poll, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Three rendering states:
  //   session=null + any status → "Blender offline" (no session bound)
  //   session set + online      → green dot + blend file name
  //   session set + offline     → amber dot + "<file> (server down)"
  const dotClass =
    session && status === 'online'
      ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
      : session && status === 'offline'
        ? 'bg-amber-400'
        : status === 'checking'
          ? 'bg-neutral-500 animate-pulse'
          : 'bg-rose-400';

  const label = (() => {
    if (!session) {
      if (status === 'online') return 'Blender connected';
      if (status === 'checking') return 'Checking…';
      return 'Blender offline';
    }
    const name = session.blendFileName || '(unsaved)';
    if (status === 'online') return name;
    if (status === 'checking') return `${name} · checking…`;
    return `${name} · server down`;
  })();

  const title = session && session.blendFile ? session.blendFile : label;

  return (
    <div className="border-t border-neutral-800 px-3 py-3">
      <div
        className={`flex items-center gap-2 ${collapsed ? 'justify-center' : ''}`}
        title={title}
      >
        <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
        {!collapsed && (
          <span className="truncate text-[11px] text-neutral-400">{label}</span>
        )}
      </div>
    </div>
  );
}
