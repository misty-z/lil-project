import { useMemo, useState } from 'react';
import { CalendarPlus, Search } from 'lucide-react';
import type { Booking, Room, RoomId } from '../types/room';
import {
  addDaysToISO,
  formatDateISO,
  parseTimeToMinutes,
  ROOM_MAP,
  sortBookingsByTime,
} from '../utils/bookingRules';

interface ScheduleViewProps {
  rooms: Room[];
  bookings: Booking[];
  now: Date;
  onOpenBookingModal: (prefill: {
    roomId: RoomId;
    date: string;
    startTime: string;
    endTime: string;
  }) => void;
  onCancelBooking: (bookingId: string) => Promise<{ ok: boolean; error?: string }>;
}

export function ScheduleView({
  rooms,
  bookings,
  now,
  onOpenBookingModal,
  onCancelBooking,
}: ScheduleViewProps) {
  const todayISO = formatDateISO(now);
  const tomorrowISO = addDaysToISO(todayISO, 1);

  const [selectedDate, setSelectedDate] = useState<string>(todayISO);
  const [roomFilter, setRoomFilter] = useState<'all' | RoomId>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const filteredBookings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sortBookingsByTime(
      bookings.filter((b) => {
        if (b.date !== selectedDate) return false;
        if (roomFilter !== 'all' && b.roomId !== roomFilter) return false;
        if (
          q &&
          !b.title.toLowerCase().includes(q) &&
          !b.organizer.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
    );
  }, [bookings, selectedDate, roomFilter, searchQuery]);

  const handleConfirmCancel = async (id: string) => {
    setCancellingId(id);
    await onCancelBooking(id);
    setCancellingId(null);
    setConfirmCancelId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Day Schedule
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Inspect reservations across the Main Meeting Room and Director&apos;s Room.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            onOpenBookingModal({
              roomId: roomFilter === 'all' ? 'main-meeting' : roomFilter,
              date: selectedDate,
              startTime: '10:00',
              endTime: '11:00',
            })
          }
          className="inline-flex h-10 items-center gap-2 px-4 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 whitespace-nowrap self-start sm:self-auto"
        >
          <CalendarPlus className="h-4 w-4" />
          <span>Add Reservation</span>
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Date Quick Switch */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setSelectedDate(todayISO)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                selectedDate === todayISO
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(tomorrowISO)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                selectedDate === tomorrowISO
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tomorrow
            </button>
          </div>

          <div>
            <label htmlFor="schedule-date-picker" className="sr-only">
              Select date
            </label>
            <input
              id="schedule-date-picker"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-9 px-3 rounded-lg border border-slate-200 text-xs font-mono tabular-nums text-slate-800 focus:outline-none focus:border-blue-600"
            />
          </div>

          {/* Room Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setRoomFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                roomFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Rooms
            </button>
            {rooms.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRoomFilter(r.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  roomFilter === r.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {r.shortName}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full lg:w-64">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <label htmlFor="schedule-search" className="sr-only">
            Search bookings
          </label>
          <input
            id="schedule-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by title or organizer..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
          />
        </div>
      </div>

      {/* Reservations Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredBookings.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-900">
              No reservations found for {selectedDate}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Adjust your filters or reserve an open meeting room slot.
            </p>
            <button
              type="button"
              onClick={() =>
                onOpenBookingModal({
                  roomId: roomFilter === 'all' ? 'main-meeting' : roomFilter,
                  date: selectedDate,
                  startTime: '10:00',
                  endTime: '11:00',
                })
              }
              className="mt-4 inline-flex h-9 items-center px-4 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
            >
              Book Slot
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-5">Time</th>
                  <th className="py-3 px-5">Room</th>
                  <th className="py-3 px-5">Meeting</th>
                  <th className="py-3 px-5">Organizer</th>
                  <th className="py-3 px-5 text-right">Duration</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredBookings.map((b) => {
                  const s = parseTimeToMinutes(b.startTime) ?? 0;
                  const e = parseTimeToMinutes(b.endTime) ?? 0;
                  const dur = Math.max(0, e - s);
                  const isConfirming = confirmCancelId === b.id;

                  return (
                    <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-5 font-mono tabular-nums text-xs font-medium text-slate-900 whitespace-nowrap">
                        {b.startTime} – {b.endTime}
                      </td>
                      <td className="py-3 px-5 text-slate-700 whitespace-nowrap">
                        {ROOM_MAP[b.roomId]?.name ?? b.roomId}
                      </td>
                      <td className="py-3 px-5 font-medium text-slate-900 max-w-xs truncate">
                        {b.title}
                      </td>
                      <td className="py-3 px-5 text-slate-600 whitespace-nowrap">
                        {b.organizer}
                      </td>
                      <td className="py-3 px-5 text-right font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                        {dur}m
                      </td>
                      <td className="py-3 px-5 text-right whitespace-nowrap">
                        {isConfirming ? (
                          <span className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={cancellingId === b.id}
                              onClick={() => handleConfirmCancel(b.id)}
                              className="px-2.5 py-1 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmCancelId(null)}
                              className="px-2 py-1 rounded-md border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              Keep
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmCancelId(b.id)}
                            aria-label={`Cancel ${b.title}`}
                            className="px-2.5 py-1 rounded-md text-xs font-medium text-slate-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
