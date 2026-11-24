import { useState } from 'react';
import {
  AlertCircle,
  Check,
  Clock,
  LogIn,
  X,
} from 'lucide-react';
import type { Booking } from '../types/room';
import { ROOM_MAP } from '../utils/bookingRules';

interface PendingRequestsPanelProps {
  pendingRequests: Booking[];
  isAdmin: boolean;
  isSigningIn: boolean;
  onSignIn: () => void;
  onApprove: (bookingId: string) => Promise<{ ok: boolean; error?: string }>;
  onReject: (bookingId: string) => Promise<{ ok: boolean; error?: string }>;
}

export function PendingRequestsPanel({
  pendingRequests,
  isAdmin,
  isSigningIn,
  onSignIn,
  onApprove,
  onReject,
}: PendingRequestsPanelProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleApprove = async (bookingId: string) => {
    setBusyId(bookingId);
    setActionError(null);
    const res = await onApprove(bookingId);
    setBusyId(null);
    if (!res.ok && res.error) {
      setActionError(res.error);
    }
  };

  const handleReject = async (bookingId: string) => {
    setBusyId(bookingId);
    setActionError(null);
    const res = await onReject(bookingId);
    setBusyId(null);
    if (!res.ok && res.error) {
      setActionError(res.error);
    }
  };

  return (
    <section
      aria-labelledby="pending-requests-heading"
      data-testid="pending-requests-panel"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Clock
            className={`h-4 w-4 shrink-0 ${
              pendingRequests.length > 0 ? 'text-amber-600' : 'text-slate-400'
            }`}
          />
          <div>
            <h2
              id="pending-requests-heading"
              className="text-sm font-semibold text-slate-900"
            >
              Meeting Approval Queue{' '}
              <span className="font-mono tabular-nums text-slate-500 font-medium">
                ({pendingRequests.length})
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              {isAdmin
                ? 'Review guest meeting requests below and approve or decline each slot.'
                : 'Guest meeting requests stay pending until approved by the office administrator.'}
            </p>
          </div>
        </div>

        {!isAdmin && (
          <button
            type="button"
            onClick={onSignIn}
            disabled={isSigningIn}
            data-testid="queue-admin-signin"
            className="inline-flex h-9 items-center gap-2 px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60 whitespace-nowrap self-start sm:self-auto"
          >
            <LogIn className="h-3.5 w-3.5" />
            <span>{isSigningIn ? 'Signing in...' : 'Admin Sign In'}</span>
          </button>
        )}
      </div>

      {actionError && (
        <div
          role="alert"
          className="mx-6 mt-4 p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-800"
        >
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      {pendingRequests.length === 0 ? (
        <p className="px-6 py-4 text-xs text-slate-500">
          No pending meeting requests awaiting approval right now.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {pendingRequests.map((req) => {
            const isBusy = busyId === req.id;
            const roomName = ROOM_MAP[req.roomId]?.name ?? req.roomId;

            return (
              <li
                key={req.id}
                data-testid={`pending-row-${req.id}`}
                className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] font-semibold text-amber-800">
                      Pending Approval
                    </span>
                    <span className="text-xs font-medium text-slate-700">
                      {roomName}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="font-mono tabular-nums text-xs text-slate-600">
                      {req.date} · {req.startTime}–{req.endTime}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {req.title}
                  </p>
                  <p className="text-xs text-slate-500">
                    Requested by <span className="font-medium text-slate-700">{req.organizer}</span>
                    {req.notes ? ` · ${req.notes}` : ''}
                  </p>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {isAdmin ? (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleApprove(req.id)}
                        className="inline-flex h-8 items-center gap-1.5 px-3 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-60 whitespace-nowrap"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>{isBusy ? 'Saving...' : 'Approve'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleReject(req.id)}
                        className="inline-flex h-8 items-center gap-1.5 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200 disabled:opacity-60 whitespace-nowrap"
                      >
                        <X className="h-3.5 w-3.5" />
                        <span>Decline</span>
                      </button>
                    </>
                  ) : (
                    <span className="text-xs font-medium text-amber-700 whitespace-nowrap">
                      Awaiting admin permission
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
