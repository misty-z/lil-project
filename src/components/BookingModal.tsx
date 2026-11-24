import { useEffect, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import type { Booking, CreateBookingInput, Room, RoomId } from '../types/room';
import {
  findNextAvailableSlot,
  minutesToTime,
  parseTimeToMinutes,
  validateBookingInput,
} from '../utils/bookingRules';

interface BookingModalProps {
  isOpen: boolean;
  rooms: Room[];
  bookings: Booking[];
  now: Date;
  initialValues: {
    roomId: RoomId;
    date: string;
    startTime: string;
    endTime: string;
  };
  onClose: () => void;
  onSubmit: (
    input: CreateBookingInput
  ) => Promise<{ ok: boolean; error?: string }>;
}

const DURATION_PRESETS = [30, 45, 60, 90];

export function BookingModal({
  isOpen,
  rooms,
  bookings,
  now,
  initialValues,
  onClose,
  onSubmit,
}: BookingModalProps) {
  const [roomId, setRoomId] = useState<RoomId>(initialValues.roomId);
  const [title, setTitle] = useState('');
  const [organizer, setOrganizer] = useState('');
  const [date, setDate] = useState(initialValues.date);
  const [startTime, setStartTime] = useState(initialValues.startTime);
  const [endTime, setEndTime] = useState(initialValues.endTime);
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRoomId(initialValues.roomId);
      setDate(initialValues.date);
      setStartTime(initialValues.startTime);
      setEndTime(initialValues.endTime);
      setTitle('');
      setOrganizer('');
      setNotes('');
      setErrorMsg(null);
      setFieldErrors({});
      setIsSubmitting(false);
    }
  }, [isOpen, initialValues]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const applyDuration = (minutes: number) => {
    const startMin = parseTimeToMinutes(startTime);
    if (startMin === null) return;
    const endMin = Math.min(23 * 60 + 55, startMin + minutes);
    setEndTime(minutesToTime(endMin));
    setErrorMsg(null);
  };

  const applyNextAvailable = () => {
    const startMin = parseTimeToMinutes(startTime);
    const endMin = parseTimeToMinutes(endTime);
    const duration =
      startMin !== null && endMin !== null && endMin > startMin
        ? endMin - startMin
        : 30;
    const next = findNextAvailableSlot(roomId, date, duration, bookings, now);
    setStartTime(next.startTime);
    setEndTime(next.endTime);
    setErrorMsg(null);
    setFieldErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: CreateBookingInput = {
      roomId,
      title,
      organizer,
      date,
      startTime,
      endTime,
      notes,
    };

    const clientCheck = validateBookingInput(payload, bookings);
    if (!clientCheck.valid) {
      setErrorMsg(clientCheck.error || 'Please check the booking details.');
      setFieldErrors(clientCheck.fieldErrors || {});
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    setFieldErrors({});

    const result = await onSubmit(payload);
    setIsSubmitting(false);

    if (!result.ok) {
      setErrorMsg(result.error || 'Unable to complete reservation.');
      return;
    }

    onClose();
  };

  const activeStartMin = parseTimeToMinutes(startTime);
  const activeEndMin = parseTimeToMinutes(endTime);
  const activeDuration =
    activeStartMin !== null && activeEndMin !== null && activeEndMin > activeStartMin
      ? activeEndMin - activeStartMin
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[1px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-modal-title"
        className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <h2 id="booking-modal-title" className="text-lg font-semibold text-slate-900">
            Reserve Meeting Room
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close booking dialog"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4">
          {errorMsg && (
            <div
              role="alert"
              data-testid="booking-form-error"
              className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2.5 text-sm text-red-800"
            >
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Room Selector */}
          <div>
            <span className="block text-xs font-medium text-slate-700 mb-1.5">
              Select Room
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              {rooms.map((r) => {
                const selected = roomId === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setRoomId(r.id);
                      setErrorMsg(null);
                    }}
                    aria-pressed={selected}
                    className={`p-3 rounded-lg border text-left transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                      selected
                        ? 'border-blue-600 bg-blue-50/70 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <p className="text-sm font-semibold truncate">{r.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500 font-mono tabular-nums">
                      {r.capacity} seats
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Meeting Title */}
          <div>
            <label
              htmlFor="booking-title"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Meeting Title
            </label>
            <input
              id="booking-title"
              type="text"
              required
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (fieldErrors.title) setFieldErrors((p) => ({ ...p, title: '' }));
              }}
              placeholder="e.g. Q4 Budget Review"
              className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
            />
            {fieldErrors.title && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.title}</p>
            )}
          </div>

          {/* Organizer & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="booking-organizer"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Organizer
              </label>
              <input
                id="booking-organizer"
                type="text"
                required
                value={organizer}
                onChange={(e) => {
                  setOrganizer(e.target.value);
                  if (fieldErrors.organizer)
                    setFieldErrors((p) => ({ ...p, organizer: '' }));
                }}
                placeholder="Your name"
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
              />
              {fieldErrors.organizer && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.organizer}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="booking-date"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Date
              </label>
              <input
                id="booking-date"
                type="date"
                required
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setErrorMsg(null);
                }}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
              />
            </div>
          </div>

          {/* Time Slot */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-slate-700">Time Slot</span>
              <button
                type="button"
                onClick={applyNextAvailable}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
              >
                Find next free slot
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="booking-start" className="sr-only">
                  Start Time
                </label>
                <input
                  id="booking-start"
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => {
                    setStartTime(e.target.value);
                    setErrorMsg(null);
                  }}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
                />
              </div>
              <div>
                <label htmlFor="booking-end" className="sr-only">
                  End Time
                </label>
                <input
                  id="booking-end"
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => {
                    setEndTime(e.target.value);
                    setErrorMsg(null);
                  }}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
                />
              </div>
            </div>

            <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-slate-500 mr-1">Duration:</span>
              {DURATION_PRESETS.map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => applyDuration(mins)}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono tabular-nums font-medium border transition-colors ${
                    activeDuration === mins
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {mins}m
                </button>
              ))}
            </div>
          </div>

          {/* Optional Notes */}
          <div>
            <label
              htmlFor="booking-notes"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Notes (optional)
            </label>
            <input
              id="booking-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="AV setup, agenda, or visitor details"
              className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-10 px-5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              {isSubmitting ? 'Confirming...' : 'Confirm Booking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
