import { CalendarCheck2, CalendarX2, X } from 'lucide-react';
import type { ToastNotification } from '../hooks/useRoomMonitor';

interface ToastStackProps {
  toasts: ToastNotification[];
  onDismiss: (id: string) => void;
  onViewNotifications: () => void;
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
        const isCreated = event.type === 'booking:created';
        return (
          <div
            key={id}
            role="status"
            data-testid={`toast-${event.type}`}
            className="bg-white border border-slate-200 rounded-xl shadow-lg p-4 flex items-start gap-3 transition-all duration-150"
          >
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

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span className={isCreated ? 'text-emerald-700' : 'text-red-700'}>
                  {isCreated ? 'New Booking' : 'Booking Cancelled'}
                </span>
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
