import { CalendarCheck2, CalendarX2, Clock, X } from 'lucide-react';
import type { ToastNotification } from '../hooks/useRoomMonitor';
import type { NotificationType } from '../types/room';

interface ToastStackProps {
  toasts: ToastNotification[];
  onDismiss: (id: string) => void;
  onViewNotifications: () => void;
}

function getToastMeta(type: NotificationType) {
  switch (type) {
    case 'booking:requested':
      return {
        label: 'Meeting Requested',
        textClass: 'text-amber-700',
        iconClass: 'text-amber-600',
        Icon: Clock,
      };
    case 'booking:approved':
      return {
        label: 'Request Approved',
        textClass: 'text-emerald-700',
        iconClass: 'text-emerald-600',
        Icon: CalendarCheck2,
      };
    case 'booking:created':
      return {
        label: 'New Booking',
        textClass: 'text-emerald-700',
        iconClass: 'text-emerald-600',
        Icon: CalendarCheck2,
      };
    case 'booking:rejected':
      return {
        label: 'Request Declined',
        textClass: 'text-red-700',
        iconClass: 'text-red-600',
        Icon: CalendarX2,
      };
    case 'booking:cancelled':
      return {
        label: 'Booking Cancelled',
        textClass: 'text-red-700',
        iconClass: 'text-red-600',
        Icon: CalendarX2,
      };
  }
}

export function ToastStack({ toasts, onDismiss, onViewNotifications }: ToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Real-time room notifications"
      data-testid="toast-stack"
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 w-[min(380px,calc(100vw-2.5rem))]"
    >
      {toasts.map(({ id, event }) => {
        const meta = getToastMeta(event.type);
        const Icon = meta.Icon;
        return (
          <div
            key={id}
            role="status"
            data-testid={`toast-${event.type}`}
            className="bg-white border border-slate-200 rounded-xl shadow-lg p-4 flex items-start gap-3 transition-all duration-150"
          >
            <div className={`mt-0.5 shrink-0 ${meta.iconClass}`}>
              <Icon className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span className={meta.textClass}>{meta.label}</span>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span className="text-slate-600 truncate">{event.roomName}</span>
              </div>
              <p className="mt-1 text-sm font-medium text-slate-900 truncate">
                {event.title}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 truncate">
                <span className="font-mono tabular-nums">
                  {event.startTime}–{event.endTime}
                </span>
                <span aria-hidden="true"> · </span>
                <span>{event.organizer}</span>
              </p>
              <button
                type="button"
                onClick={onViewNotifications}
                className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline focus-visible:outline-2 focus-visible:outline-blue-600"
              >
                View activity log
              </button>
            </div>

            <button
              type="button"
              onClick={() => onDismiss(id)}
              aria-label={`Dismiss notification for ${event.title}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-blue-600 shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
