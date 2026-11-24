import { useState } from 'react';
import {
  Building2,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Trash2,
  Users,
} from 'lucide-react';
import type { Booking, Room, RoomId, RoomStatusInfo } from '../types/room';
import {
  findNextAvailableSlot,
  formatDateISO,
  formatDurationLabel,
  formatRoomCapacity,
  minutesToTime,
  parseTimeToMinutes,
} from '../utils/bookingRules';

interface RoomMonitorCardProps {
  room: Room;
  statusInfo: RoomStatusInfo;
  allBookings: Booking[];
  now: Date;
  onOpenBookingModal: (prefill: {
    roomId: RoomId;
    date: string;
    startTime: string;
    endTime: string;
  }) => void;
  canCancelBooking: (booking: Booking) => boolean;
  onCancelBooking: (bookingId: string) => Promise<{ ok: boolean; error?: string }>;
}

const TIMELINE_START_HOUR = 0;
const TIMELINE_END_HOUR = 24;
const TIMELINE_START_MIN = TIMELINE_START_HOUR * 60;
const TIMELINE_END_MIN = TIMELINE_END_HOUR * 60;
const TIMELINE_TOTAL_MIN = TIMELINE_END_MIN - TIMELINE_START_MIN;

export function RoomMonitorCard({
  room,
  statusInfo,
  allBookings,
  now,
  onOpenBookingModal,
  canCancelBooking,
  onCancelBooking,
}: RoomMonitorCardProps) {
  const [imgError, setImgError] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const todayISO = formatDateISO(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const handleQuickPrefill = (durationMinutes: number) => {
    const slot = findNextAvailableSlot(
      room.id,
      todayISO,
      durationMinutes,
      allBookings,
      now
    );
    onOpenBookingModal({
      roomId: room.id,
      date: todayISO,
      startTime: slot.startTime,
      endTime: slot.endTime,
    });
  };

  const handleTimelineHourClick = (hour: number) => {
    const startMin = hour * 60;
    const endMin = Math.min(23 * 60 + 55, startMin + 60);
    onOpenBookingModal({
      roomId: room.id,
      date: todayISO,
      startTime: minutesToTime(startMin),
      endTime: minutesToTime(endMin),
    });
  };

  const handleConfirmCancel = async (bookingId: string) => {
    setCancellingId(bookingId);
    await onCancelBooking(bookingId);
    setCancellingId(null);
    setConfirmCancelId(null);
  };

  const statusConfig =
    statusInfo.status === 'occupied'
      ? {
          bg: 'bg-red-50/80',
          text: 'text-red-700',
          icon: Users,
          label: 'Occupied',
          sublabel:
            statusInfo.minutesUntilFree !== null
              ? `Free in ${formatDurationLabel(statusInfo.minutesUntilFree)}`
              : 'In session',
        }
      : statusInfo.status === 'upcoming_soon'
        ? {
            bg: 'bg-amber-50/80',
            text: 'text-amber-800',
            icon: Clock,
            label: 'Upcoming Soon',
            sublabel:
              statusInfo.minutesUntilNext !== null
                ? `Starts in ${formatDurationLabel(statusInfo.minutesUntilNext)}`
                : 'Starting soon',
          }
        : {
            bg: 'bg-emerald-50/80',
            text: 'text-emerald-700',
            icon: CheckCircle2,
            label: 'Available',
            sublabel:
              statusInfo.minutesUntilNext !== null
                ? `Free for ${formatDurationLabel(statusInfo.minutesUntilNext)}`
                : 'Open rest of day',
          };

  const StatusIcon = statusConfig.icon;
  const nowPercent =
    nowMinutes >= TIMELINE_START_MIN && nowMinutes <= TIMELINE_END_MIN
      ? ((nowMinutes - TIMELINE_START_MIN) / TIMELINE_TOTAL_MIN) * 100
      : null;

  const hours = Array.from(
    { length: TIMELINE_END_HOUR - TIMELINE_START_HOUR },
    (_, i) => TIMELINE_START_HOUR + i
  );

  return (
    <section
      data-testid={`room-card-${room.id}`}
      aria-labelledby={`room-heading-${room.id}`}
      className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col"
    >
      {/* Room Photo Header */}
      <div className="relative h-40 sm:h-44 bg-slate-100 overflow-hidden">
        {!imgError ? (
          <img
            src={room.imageUrl}
            alt={`${room.name} interior`}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 flex flex-col items-center justify-center text-slate-600 gap-2">
            <Building2 className="h-8 w-8" />
            <span className="text-sm font-medium">{room.name}</span>
          </div>
        )}
        <div
          className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/25 to-transparent"
          aria-hidden="true"
        />
        <div className="absolute bottom-0 inset-x-0 p-5 flex items-end justify-between gap-4">
          <div>
            <h2
              id={`room-heading-${room.id}`}
              className="text-xl font-semibold text-white tracking-tight"
            >
              {room.name}
            </h2>
            <p className="mt-0.5 text-xs text-slate-200 flex items-center gap-2 flex-wrap">
              <span className="font-mono tabular-nums">{formatRoomCapacity(room)}</span>
              <span aria-hidden="true">·</span>
              <span>{room.location}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Explicit Semantic Status Strip (Icon + Text Label) */}
      <div
        data-testid={`room-status-${room.id}`}
        className={`px-6 py-3 border-b border-slate-200 flex items-center justify-between gap-4 ${statusConfig.bg}`}
      >
        <div className={`flex items-center gap-2 text-sm font-semibold ${statusConfig.text}`}>
          <StatusIcon className="h-4 w-4 shrink-0" />
          <span>{statusConfig.label}</span>
        </div>
        <span className={`font-mono tabular-nums text-xs font-medium ${statusConfig.text}`}>
          {statusConfig.sublabel}
        </span>
      </div>

      {/* Card Body */}
      <div className="p-5 flex-1 flex flex-col gap-4">
        {/* Clean Unboxed Amenities Line */}
        <p className="text-xs text-slate-500 leading-relaxed">
          {room.amenities.join(' · ')}
        </p>

        {/* Current / Next Occupancy */}
        <div className="border-t border-slate-100 pt-4">
          {statusInfo.currentBooking ? (
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-red-700">Current Meeting</p>
                <p className="mt-1 text-base font-semibold text-slate-900 truncate">
                  {statusInfo.currentBooking.title}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  <span className="font-mono tabular-nums font-medium text-slate-800">
                    {statusInfo.currentBooking.startTime}–{statusInfo.currentBooking.endTime}
                  </span>
                  <span aria-hidden="true"> · </span>
                  <span>Hosted by {statusInfo.currentBooking.organizer}</span>
                </p>
              </div>

              {canCancelBooking(statusInfo.currentBooking) && (
                <div className="shrink-0">
                  {confirmCancelId === statusInfo.currentBooking.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={cancellingId === statusInfo.currentBooking.id}
                        onClick={() => handleConfirmCancel(statusInfo.currentBooking!.id)}
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-60 whitespace-nowrap"
                      >
                        {cancellingId === statusInfo.currentBooking.id
                          ? 'Cancelling...'
                          : 'Confirm Cancel'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmCancelId(null)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap"
                      >
                        Keep
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmCancelId(statusInfo.currentBooking!.id)}
                      aria-label={`Cancel ${statusInfo.currentBooking.title}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-colors whitespace-nowrap"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Cancel</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-emerald-700">Ready Now</p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {statusInfo.nextBooking
                    ? `Next: ${statusInfo.nextBooking.title} at ${statusInfo.nextBooking.startTime}`
                    : 'No upcoming reservations today'}
                </p>
              </div>
            </div>
          )}

          {/* Quick Booking Actions */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleQuickPrefill(30)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              <span>
                {statusInfo.currentBooking ? 'Book Next 30m' : 'Book 30m Now'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickPrefill(60)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <span>{statusInfo.currentBooking ? 'Book Next 60m' : 'Book 60m Now'}</span>
            </button>
          </div>
        </div>

        {/* Interactive 24h Day Timeline (00:00 - 24:00) */}
        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span className="font-medium text-slate-700">Today&apos;s Availability</span>
            <span className="font-mono tabular-nums">00:00 – 24:00</span>
          </div>

          <div className="relative h-9 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex">
            {hours.map((hour) => (
              <button
                key={hour}
                type="button"
                onClick={() => handleTimelineHourClick(hour)}
                aria-label={`Book ${room.name} starting at ${String(hour).padStart(2, '0')}:00`}
                title={`Click to book ${room.name} at ${String(hour).padStart(2, '0')}:00`}
                className="flex-1 h-full border-r last:border-r-0 border-slate-200/80 hover:bg-blue-50 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600"
              />
            ))}

            {/* Booked Blocks Overlay */}
            {statusInfo.todayBookings.map((b) => {
              const s = parseTimeToMinutes(b.startTime);
              const e = parseTimeToMinutes(b.endTime);
              if (s === null || e === null) return null;
              const clippedStart = Math.max(TIMELINE_START_MIN, s);
              const clippedEnd = Math.min(TIMELINE_END_MIN, e);
              if (clippedEnd <= clippedStart) return null;

              const leftPct =
                ((clippedStart - TIMELINE_START_MIN) / TIMELINE_TOTAL_MIN) * 100;
              const widthPct =
                ((clippedEnd - clippedStart) / TIMELINE_TOTAL_MIN) * 100;

              const isOngoing =
                statusInfo.currentBooking && statusInfo.currentBooking.id === b.id;

              return (
                <div
                  key={b.id}
                  title={`${b.title} (${b.startTime}–${b.endTime}) · ${b.organizer}`}
                  style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 1.5)}%` }}
                  className={`absolute top-1 bottom-1 rounded pointer-events-none ${
                    isOngoing ? 'bg-red-600/85' : 'bg-slate-800/80'
                  }`}
                />
              );
            })}

            {/* Current Time Needle */}
            {nowPercent !== null && (
              <div
                style={{ left: `${nowPercent}%` }}
                aria-hidden="true"
                className="absolute top-0 bottom-0 w-0.5 bg-blue-600 pointer-events-none"
              />
            )}
          </div>

          <div className="mt-1.5 flex justify-between text-[11px] font-mono tabular-nums text-slate-400">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </div>
        </div>

        {/* Today's Reservations List */}
        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-slate-700">
              Today&apos;s Bookings
            </h3>
            <span className="font-mono tabular-nums text-xs text-slate-500">
              {statusInfo.todayBookings.length} scheduled
            </span>
          </div>

          {statusInfo.todayBookings.length === 0 ? (
            <p className="text-xs text-slate-500 py-2">
              No bookings scheduled for today. Select a slot above to reserve this room.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {statusInfo.todayBookings.map((booking) => {
                const isConfirming = confirmCancelId === booking.id;
                const isBusy = cancellingId === booking.id;
                const endMin = parseTimeToMinutes(booking.endTime) ?? 0;
                const isPast = endMin <= nowMinutes;

                return (
                  <li
                    key={booking.id}
                    data-testid={`booking-row-${booking.id}`}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm font-medium truncate ${
                          isPast ? 'text-slate-400 line-through' : 'text-slate-900'
                        }`}
                      >
                        {booking.title}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        <span className="font-mono tabular-nums">
                          {booking.startTime}–{booking.endTime}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span>{booking.organizer}</span>
                      </p>
                    </div>

                    {canCancelBooking(booking) && (
                      <div className="shrink-0">
                        {isConfirming ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleConfirmCancel(booking.id)}
                              className="px-2.5 py-1 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-60 whitespace-nowrap"
                            >
                              {isBusy ? 'Cancelling...' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmCancelId(null)}
                              className="px-2 py-1 rounded-md border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap"
                            >
                              Keep
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmCancelId(booking.id)}
                            aria-label={`Cancel ${booking.title}`}
                            className="px-2.5 py-1 rounded-md text-xs font-medium text-slate-500 hover:text-red-700 hover:bg-red-50 transition-colors whitespace-nowrap"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
