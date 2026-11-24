import { Bell, Building2, CalendarDays, LayoutGrid, LogIn, LogOut, ShieldCheck, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { ConnectionState } from '../hooks/useRoomMonitor';

export type NavView = 'monitor' | 'schedule' | 'notifications' | 'rooms';

interface SidebarProps {
  activeView: NavView;
  onSelectView: (view: NavView) => void;
  unreadCount: number;
  pendingCount: number;
  connectionState: ConnectionState;
  availableRoomCount: number;
  totalRoomCount: number;
  user: User | null;
  isAdmin: boolean;
  isSigningIn: boolean;
  authError?: string | null;
  onSignIn: () => void;
  onSignOut: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  id: NavView;
  label: string;
  icon: typeof LayoutGrid;
}> = [
  { id: 'monitor', label: 'Live Monitor', icon: LayoutGrid },
  { id: 'schedule', label: 'Month Schedule', icon: CalendarDays },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'rooms', label: 'Room Directory', icon: Building2 },
];

export function Sidebar({
  activeView,
  onSelectView,
  unreadCount,
  pendingCount,
  connectionState,
  availableRoomCount,
  totalRoomCount,
  user,
  isAdmin,
  isSigningIn,
  authError,
  onSignIn,
  onSignOut,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const navContent = (
    <div className="flex h-full flex-col justify-between bg-white border-r border-slate-200">
      <div>
        <div className="flex h-16 items-center justify-between px-6 border-b border-slate-200">
          <a
            href="#monitor"
            onClick={(e) => {
              e.preventDefault();
              onSelectView('monitor');
              onCloseMobile();
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Textile 308
          </a>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation menu"
            className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label="Workspace navigation" className="px-3 py-5 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectView(item.id);
                  onCloseMobile();
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-600 ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </span>
                {item.id === 'monitor' && pendingCount > 0 && (
                  <span
                    className={`font-mono tabular-nums text-xs font-semibold ${
                      isActive ? 'text-amber-300' : 'text-amber-700'
                    }`}
                    title={`${pendingCount} pending approval`}
                  >
                    {pendingCount}
                  </span>
                )}
                {item.id === 'notifications' && unreadCount > 0 && (
                  <span
                    className={`font-mono tabular-nums text-xs font-semibold ${
                      isActive ? 'text-blue-300' : 'text-blue-600'
                    }`}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-5 border-t border-slate-200 space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Rooms Free Now</span>
          <span className="font-mono tabular-nums font-semibold text-slate-900">
            {availableRoomCount} / {totalRoomCount}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Database</span>
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
            <span
              className={`h-2 w-2 rounded-full ${
                connectionState === 'connected'
                  ? 'bg-emerald-500'
                  : connectionState === 'reconnecting'
                    ? 'bg-amber-500'
                    : 'bg-slate-400'
              }`}
              aria-hidden="true"
            />
            <span>
              {connectionState === 'connected'
                ? 'Cloud Synced'
                : connectionState === 'reconnecting'
                  ? 'Reconnecting'
                  : 'Connecting'}
            </span>
          </span>
        </div>

        <div className="pt-3 border-t border-slate-100 space-y-2">
          {user ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 flex items-center gap-1 truncate">
                    {isAdmin && <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                    <span className="truncate">
                      {isAdmin ? 'Admin' : 'Guest'}: {user.displayName || user.email}
                    </span>
                  </p>
                  {!isAdmin && (
                    <p className="text-[11px] text-amber-700">
                      Meetings require admin approval
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  aria-label="Sign out"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={onSignIn}
                disabled={isSigningIn}
                data-testid="sidebar-admin-signin"
                className="w-full inline-flex items-center justify-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60 transition-colors"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>{isSigningIn ? 'Signing in...' : 'Admin Sign In'}</span>
              </button>
              <p className="text-[11px] text-slate-500 leading-snug">
                No login needed to check schedules or request a room.
              </p>
              {authError && (
                <p role="alert" className="text-[11px] text-red-600">
                  {authError}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-64 shrink-0">{navContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-64 max-w-[80vw] h-full">{navContent}</aside>
        </div>
      )}
    </>
  );
}
