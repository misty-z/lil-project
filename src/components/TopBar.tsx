import { Bell, Menu, Plus } from 'lucide-react';
import type { NavView } from './Sidebar';

interface TopBarProps {
  activeView: NavView;
  now: Date;
  unreadCount: number;
  onOpenMobileNav: () => void;
  onOpenNotifications: () => void;
  onOpenBookModal: () => void;
}

const VIEW_TITLES: Record<NavView, string> = {
  monitor: 'Office / Meeting Rooms / Live Monitor',
  schedule: 'Office / Meeting Rooms / Day Schedule',
  notifications: 'Office / Meeting Rooms / Notifications',
  rooms: 'Office / Meeting Rooms / Directory',
};

const SHORT_VIEW_TITLES: Record<NavView, string> = {
  monitor: 'Live Monitor',
  schedule: 'Day Schedule',
  notifications: 'Notifications',
  rooms: 'Room Directory',
};

export function TopBar({
  activeView,
  now,
  unreadCount,
  onOpenMobileNav,
  onOpenNotifications,
  onOpenBookModal,
}: TopBarProps) {
  const timeString = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const dateString = now.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open navigation menu"
          className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 shrink-0"
        >
          <Menu className="h-5 w-5" />
        </button>

        <p className="text-sm font-medium text-slate-600 truncate">
          <span className="sm:hidden font-semibold text-slate-900">
            {SHORT_VIEW_TITLES[activeView]}
          </span>
          <span className="hidden sm:inline">{VIEW_TITLES[activeView]}</span>
        </p>
      </div>

      <div className="flex items-center gap-3 sm:gap-5 shrink-0">
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap">
          <span>{dateString}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums font-medium text-slate-900">
            {timeString}
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenNotifications}
          aria-label={
            unreadCount > 0
              ? `Notifications (${unreadCount} unread)`
              : 'Notifications'
          }
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 shrink-0"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              data-testid="header-unread-badge"
              className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-md bg-blue-600 text-white text-[11px] font-mono tabular-nums font-semibold flex items-center justify-center"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenBookModal}
          className="inline-flex h-10 items-center gap-2 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <Plus className="h-4 w-4" />
          <span>Book a Room</span>
        </button>
      </div>
    </header>
  );
}
