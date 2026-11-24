import { useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  CalendarCheck2,
  CalendarX2,
  CheckCheck,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { NotificationEvent } from '../types/room';

interface NotificationsViewProps {
  notifications: NotificationEvent[];
  soundEnabled: boolean;
  desktopAlertsEnabled: boolean;
  onToggleSound: () => void;
  onToggleDesktopAlerts: () => void;
  onMarkAllRead: () => void;
  onClearAll: () => void;
}

type EventFilter = 'all' | 'booking:created' | 'booking:cancelled';

export function NotificationsView({
  notifications,
  soundEnabled,
  desktopAlertsEnabled,
  onToggleSound,
  onToggleDesktopAlerts,
  onMarkAllRead,
  onClearAll,
}: NotificationsViewProps) {
  const [filter, setFilter] = useState<EventFilter>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return notifications;
    return notifications.filter((n) => n.type === filter);
  }, [notifications, filter]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Real-Time Notifications
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Live stream of room reservations and cancellations pushed across connected office displays.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleSound}
            aria-pressed={soundEnabled}
            className="inline-flex h-9 items-center gap-2 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            {soundEnabled ? (
              <Volume2 className="h-3.5 w-3.5 text-blue-600" />
            ) : (
              <VolumeX className="h-3.5 w-3.5 text-slate-400" />
            )}
            <span>Sound Alerts: {soundEnabled ? 'On' : 'Off'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleDesktopAlerts}
            aria-pressed={desktopAlertsEnabled}
            className="inline-flex h-9 items-center gap-2 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            {desktopAlertsEnabled ? (
              <Bell className="h-3.5 w-3.5 text-blue-600" />
            ) : (
              <BellOff className="h-3.5 w-3.5 text-slate-400" />
            )}
            <span>Browser Push: {desktopAlertsEnabled ? 'On' : 'Off'}</span>
          </button>
        </div>
      </div>

      {/* Filter & Actions Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              filter === 'all'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Events
          </button>
          <button
            type="button"
            onClick={() => setFilter('booking:created')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              filter === 'booking:created'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Bookings
          </button>
          <button
            type="button"
            onClick={() => setFilter('booking:cancelled')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              filter === 'booking:cancelled'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Cancellations
          </button>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="inline-flex h-9 items-center gap-1.5 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>Mark all read</span>
            </button>
          )}
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="inline-flex h-9 items-center gap-1.5 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 hover:border-red-200 whitespace-nowrap"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear log</span>
            </button>
          )}
        </div>
      </div>

      {/* Activity Feed */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-900">
              No notifications yet
            </p>
            <p className="mt-1 text-xs text-slate-500">
              New bookings and cancellations will stream here automatically in real time.
            </p>
          </div>
        ) : (
          <ul data-testid="notifications-list" className="divide-y divide-slate-100">
            {filtered.map((event) => {
              const isCreated = event.type === 'booking:created';
              const eventTime = new Date(event.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
              });

              return (
                <li
                  key={event.id}
                  className={`px-6 py-4 flex items-start justify-between gap-4 ${
                    !event.read ? 'bg-blue-50/35' : ''
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`mt-0.5 shrink-0 ${
                        isCreated ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {isCreated ? (
                        <CalendarCheck2 className="h-5 w-5" />
                      ) : (
                        <CalendarX2 className="h-5 w-5" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className={`font-semibold ${
                            isCreated ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {isCreated ? 'Room Booked' : 'Booking Cancelled'}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="font-medium text-slate-700">{event.roomName}</span>
                        {!event.read && (
                          <>
                            <span aria-hidden="true" className="text-slate-300">
                              ·
                            </span>
                            <span className="font-semibold text-blue-600">Unread</span>
                          </>
                        )}
                      </div>

                      <p className="mt-1 text-sm font-medium text-slate-900 truncate">
                        {event.title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        <span className="font-mono tabular-nums">
                          {event.date} · {event.startTime}–{event.endTime}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span>Organizer: {event.organizer}</span>
                      </p>
                    </div>
                  </div>

                  <span className="font-mono tabular-nums text-xs text-slate-400 shrink-0">
                    {eventTime}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
