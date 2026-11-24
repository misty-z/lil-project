import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarCheck2,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from 'lucide-react';
import type { Booking, Room, RoomId } from '../types/room';
import {
  buildMonthGridCells,
  formatDateISO,
  getDaysInMonth,
  isBookingApproved,
  isBookingPending,
  isBookingRejected,
  parseTimeToMinutes,
  ROOM_MAP,
  sortBookingsByTime,
} from '../utils/bookingRules';

interface ScheduleViewProps {
  rooms: Room[];
  bookings: Booking[];
  now: Date;
  isAdmin: boolean;
  onOpenBookingModal: (prefill: {
    roomId: RoomId;
    date: string;
    startTime: string;
    endTime: string;
  }) => void;
  canCancelBooking: (booking: Booking) => boolean;
  onApproveBooking: (bookingId: string) => Promise<{ ok: boolean; error?: string }>;
  onRejectBooking: (bookingId: string) => Promise<{ ok: boolean; error?: string }>;
  onCancelBooking: (bookingId: string) => Promise<{ ok: boolean; error?: string }>;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatRoomDayText(approvedCount: number, pendingCount: number): string {
  if (approvedCount > 0 && pendingCount > 0) {
    return `${approvedCount} ${approvedCount === 1 ? 'meeting' : 'meetings'} (+${pendingCount} pending)`;
  }
  if (approvedCount > 0) {
    return `${approvedCount} ${approvedCount === 1 ? 'meeting' : 'meetings'}`;
  }
  if (pendingCount > 0) {
    return `${pendingCount} pending`;
  }
  return 'No meeting';
}

export function ScheduleView({
  rooms,
  bookings,
  now,
  isAdmin,
  onOpenBookingModal,
  canCancelBooking,
  onApproveBooking,
  onRejectBooking,
  onCancelBooking,
}: ScheduleViewProps) {
  const todayISO = formatDateISO(now);

  const [viewYear, setViewYear] = useState<number>(() => now.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(() => now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(todayISO);
  const [roomFilter, setRoomFilter] = useState<'all' | RoomId>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const monthCells = useMemo(
    () => buildMonthGridCells(viewYear, viewMonth, bookings, searchQuery),
    [viewYear, viewMonth, bookings, searchQuery]
  );

  const inMonthDays = useMemo(
    () => monthCells.filter((c) => c.inCurrentMonth),
    [monthCells]
  );

  const monthStats = useMemo(() => {
    let daysWithMeetings = 0;
    let mainTotal = 0;
    let directorTotal = 0;
    for (const day of inMonthDays) {
      mainTotal += day.mainCount;
      directorTotal += day.directorCount;
      const count =
        roomFilter === 'all'
          ? day.totalCount
          : roomFilter === 'main-meeting'
            ? day.mainCount
            : day.directorCount;
      if (count > 0) daysWithMeetings += 1;
    }
    return {
      totalDays: getDaysInMonth(viewYear, viewMonth),
      daysWithMeetings,
      mainTotal,
      directorTotal,
    };
  }, [inMonthDays, roomFilter, viewYear, viewMonth]);

  const monthLabel = useMemo(() => {
    return new Date(viewYear, viewMonth, 1).toLocaleDateString([], {
      month: 'long',
      year: 'numeric',
    });
  }, [viewYear, viewMonth]);

  const selectedDayCell = useMemo(() => {
    const found = monthCells.find((c) => c.dateISO === selectedDate);
    if (found) return found;
    const dayBookings = sortBookingsByTime(
      bookings.filter((b) => b.date === selectedDate && !isBookingRejected(b))
    );
    const mainBookings = dayBookings.filter(
      (b) => b.roomId === 'main-meeting' && isBookingApproved(b)
    );
    const directorBookings = dayBookings.filter(
      (b) => b.roomId === 'director-room' && isBookingApproved(b)
    );
    const mainPendingBookings = dayBookings.filter(
      (b) => b.roomId === 'main-meeting' && isBookingPending(b)
    );
    const directorPendingBookings = dayBookings.filter(
      (b) => b.roomId === 'director-room' && isBookingPending(b)
    );
    return {
      dateISO: selectedDate,
      dayOfMonth: Number(selectedDate.split('-')[2] || 1),
      inCurrentMonth: true,
      mainBookings,
      directorBookings,
      mainPendingBookings,
      directorPendingBookings,
      mainCount: mainBookings.length,
      directorCount: directorBookings.length,
      mainPendingCount: mainPendingBookings.length,
      directorPendingCount: directorPendingBookings.length,
      totalCount: mainBookings.length + directorBookings.length,
      totalPendingCount:
        mainPendingBookings.length + directorPendingBookings.length,
    };
  }, [monthCells, selectedDate, bookings]);

  const selectedDayFilteredBookings = useMemo(() => {
    const mainAll = [
      ...selectedDayCell.mainBookings,
      ...selectedDayCell.mainPendingBookings,
    ];
    const dirAll = [
      ...selectedDayCell.directorBookings,
      ...selectedDayCell.directorPendingBookings,
    ];
    const list =
      roomFilter === 'all'
        ? [...mainAll, ...dirAll]
        : roomFilter === 'main-meeting'
          ? mainAll
          : dirAll;
    return sortBookingsByTime(list);
  }, [selectedDayCell, roomFilter]);

  const selectedDateLabel = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    if (!y || !m || !d) return selectedDate;
    return new Date(y, m - 1, d).toLocaleDateString([], {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }, [selectedDate]);

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
      setSelectedDate(`${viewYear - 1}-12-01`);
    } else {
      const nextM = viewMonth - 1;
      setViewMonth(nextM);
      setSelectedDate(`${viewYear}-${String(nextM + 1).padStart(2, '0')}-01`);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
      setSelectedDate(`${viewYear + 1}-01-01`);
    } else {
      const nextM = viewMonth + 1;
      setViewMonth(nextM);
      setSelectedDate(`${viewYear}-${String(nextM + 1).padStart(2, '0')}-01`);
    }
  };

  const goToThisMonth = () => {
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDate(todayISO);
  };

  const handleConfirmCancel = async (id: string) => {
    setBusyId(id);
    setActionError(null);
    const res = await onCancelBooking(id);
    setBusyId(null);
    setConfirmCancelId(null);
    if (!res.ok && res.error) setActionError(res.error);
  };

  const handleApprove = async (id: string) => {
    setBusyId(id);
    setActionError(null);
    const res = await onApproveBooking(id);
    setBusyId(null);
    if (!res.ok && res.error) setActionError(res.error);
  };

  const handleReject = async (id: string) => {
    setBusyId(id);
    setActionError(null);
    const res = await onRejectBooking(id);
    setBusyId(null);
    if (!res.ok && res.error) setActionError(res.error);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Month Schedule
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Full-month calendar showing daily confirmed meetings and pending requests for Main Meeting Room and Director&apos;s Room.
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
          <span>{isAdmin ? 'Add Reservation' : 'Request Meeting'}</span>
        </button>
      </div>

      {/* Month Controls & Filters Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Month Switcher */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={goToPrevMonth}
              aria-label="Previous month"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span
              data-testid="month-heading"
              className="min-w-36 text-center text-sm font-semibold text-slate-900"
            >
              {monthLabel}
            </span>
            <button
              type="button"
              onClick={goToNextMonth}
              aria-label="Next month"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goToThisMonth}
              className="ml-1 h-9 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              This Month
            </button>
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

      {/* Month Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 bg-white border border-slate-200 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-4">
          <p className="text-xs font-medium text-slate-500">Days With Meetings</p>
          <p className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
            {monthStats.daysWithMeetings} / {monthStats.totalDays} days
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs font-medium text-slate-500">Main Meeting Room</p>
          <p className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
            {monthStats.mainTotal} {monthStats.mainTotal === 1 ? 'meeting' : 'meetings'}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs font-medium text-slate-500">Director&apos;s Room</p>
          <p className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
            {monthStats.directorTotal}{' '}
            {monthStats.directorTotal === 1 ? 'meeting' : 'meetings'}
          </p>
        </div>
      </div>

      {/* Desktop Full-Month 7-Column Calendar Grid */}
      <div
        data-testid="month-calendar-grid"
        className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden"
      >
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="py-2.5 px-3 text-xs font-semibold text-slate-500 border-r last:border-r-0 border-slate-200"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {monthCells.map((cell, idx) => {
            const isToday = cell.dateISO === todayISO;
            const isSelected = cell.dateISO === selectedDate;
            const showMain = roomFilter === 'all' || roomFilter === 'main-meeting';
            const showDir = roomFilter === 'all' || roomFilter === 'director-room';

            const mainStatusText = formatRoomDayText(
              cell.mainCount,
              cell.mainPendingCount
            );
            const dirStatusText = formatRoomDayText(
              cell.directorCount,
              cell.directorPendingCount
            );

            const ariaSummaryParts: string[] = [];
            if (showMain) ariaSummaryParts.push(`Main Room ${mainStatusText}`);
            if (showDir) ariaSummaryParts.push(`Director's Room ${dirStatusText}`);

            return (
              <button
                key={`${cell.dateISO}-${idx}`}
                type="button"
                onClick={() => {
                  setSelectedDate(cell.dateISO);
                  if (!cell.inCurrentMonth) {
                    const [y, m] = cell.dateISO.split('-').map(Number);
                    setViewYear(y);
                    setViewMonth(m - 1);
                  }
                }}
                aria-pressed={isSelected}
                aria-label={`${cell.dateISO}: ${ariaSummaryParts.join(', ')}`}
                className={`min-h-28 p-2.5 text-left border-b border-r border-slate-200 [&:nth-child(7n)]:border-r-0 flex flex-col justify-between gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                  !cell.inCurrentMonth
                    ? 'bg-slate-50/70 text-slate-400'
                    : isSelected
                      ? 'bg-blue-50/55 ring-2 ring-inset ring-blue-600'
                      : 'bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-1 w-full">
                  <span
                    className={`font-mono tabular-nums text-xs font-semibold ${
                      isToday
                        ? 'px-1.5 py-0.5 rounded bg-blue-600 text-white'
                        : cell.inCurrentMonth
                          ? 'text-slate-900'
                          : 'text-slate-400'
                    }`}
                  >
                    {cell.dayOfMonth}
                  </span>
                  {isToday && (
                    <span className="text-[11px] font-medium text-blue-600">
                      Today
                    </span>
                  )}
                </div>

                <div className="space-y-1 w-full">
                  {showMain && (
                    <div
                      className={`text-[11px] leading-tight truncate ${
                        !cell.inCurrentMonth
                          ? 'text-slate-400'
                          : cell.mainCount > 0
                            ? 'text-blue-700 font-semibold'
                            : cell.mainPendingCount > 0
                              ? 'text-amber-700 font-semibold'
                              : 'text-emerald-700'
                      }`}
                    >
                      Main: {mainStatusText}
                    </div>
                  )}
                  {showDir && (
                    <div
                      className={`text-[11px] leading-tight truncate ${
                        !cell.inCurrentMonth
                          ? 'text-slate-400'
                          : cell.directorCount > 0
                            ? 'text-blue-700 font-semibold'
                            : cell.directorPendingCount > 0
                              ? 'text-amber-700 font-semibold'
                              : 'text-emerald-700'
                      }`}
                    >
                      Director: {dirStatusText}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile Full-Month Date List (All 28-31 Days) */}
      <div
        data-testid="month-mobile-list"
        className="md:hidden bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden"
      >
        {inMonthDays.map((cell) => {
          const isSelected = cell.dateISO === selectedDate;
          const isToday = cell.dateISO === todayISO;
          const [y, m, d] = cell.dateISO.split('-').map(Number);
          const weekday = new Date(y, m - 1, d).toLocaleDateString([], {
            weekday: 'short',
          });
          const showMain = roomFilter === 'all' || roomFilter === 'main-meeting';
          const showDir = roomFilter === 'all' || roomFilter === 'director-room';

          return (
            <button
              key={cell.dateISO}
              type="button"
              onClick={() => setSelectedDate(cell.dateISO)}
              aria-pressed={isSelected}
              className={`w-full px-4 py-3 text-left flex items-center justify-between gap-3 transition-colors ${
                isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5 shrink-0">
                <span
                  className={`font-mono tabular-nums text-sm font-semibold w-7 text-center py-0.5 rounded ${
                    isToday ? 'bg-blue-600 text-white' : 'text-slate-900'
                  }`}
                >
                  {cell.dayOfMonth}
                </span>
                <span className="text-xs font-medium text-slate-500 w-8">
                  {weekday}
                </span>
              </div>

              <div className="flex-1 min-w-0 text-right space-y-0.5">
                {showMain && (
                  <p
                    className={`text-xs truncate ${
                      cell.mainCount > 0
                        ? 'text-blue-700 font-semibold'
                        : cell.mainPendingCount > 0
                          ? 'text-amber-700 font-semibold'
                          : 'text-emerald-700'
                    }`}
                  >
                    Main Room: {formatRoomDayText(cell.mainCount, cell.mainPendingCount)}
                  </p>
                )}
                {showDir && (
                  <p
                    className={`text-xs truncate ${
                      cell.directorCount > 0
                        ? 'text-blue-700 font-semibold'
                        : cell.directorPendingCount > 0
                          ? 'text-amber-700 font-semibold'
                          : 'text-emerald-700'
                    }`}
                  >
                    Director&apos;s:{' '}
                    {formatRoomDayText(cell.directorCount, cell.directorPendingCount)}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Date Breakdown & Room Reservations */}
      <section
        aria-labelledby="selected-day-heading"
        data-testid="selected-day-panel"
        className="bg-white border border-slate-200 rounded-xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2
              id="selected-day-heading"
              className="text-base font-semibold text-slate-900"
            >
              {selectedDateLabel}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Room-by-room breakdown for the selected date
            </p>
          </div>
          <span className="font-mono tabular-nums text-xs text-slate-500">
            {selectedDate}
          </span>
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

        {/* Two-Room Explicit Day Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 border-b border-slate-200">
          <div className="p-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Main Meeting Room
              </p>
              <p
                className={`mt-1 text-xs font-medium flex items-center gap-1.5 ${
                  selectedDayCell.mainCount > 0
                    ? 'text-blue-700'
                    : selectedDayCell.mainPendingCount > 0
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                }`}
              >
                <CalendarCheck2 className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {selectedDayCell.mainCount > 0 || selectedDayCell.mainPendingCount > 0
                    ? formatRoomDayText(
                        selectedDayCell.mainCount,
                        selectedDayCell.mainPendingCount
                      )
                    : 'No meetings — available all day'}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onOpenBookingModal({
                  roomId: 'main-meeting',
                  date: selectedDate,
                  startTime: '10:00',
                  endTime: '11:00',
                })
              }
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              {isAdmin ? 'Book Main' : 'Request Main'}
            </button>
          </div>

          <div className="p-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Director&apos;s Room
              </p>
              <p
                className={`mt-1 text-xs font-medium flex items-center gap-1.5 ${
                  selectedDayCell.directorCount > 0
                    ? 'text-blue-700'
                    : selectedDayCell.directorPendingCount > 0
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                }`}
              >
                <CalendarCheck2 className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {selectedDayCell.directorCount > 0 ||
                  selectedDayCell.directorPendingCount > 0
                    ? formatRoomDayText(
                        selectedDayCell.directorCount,
                        selectedDayCell.directorPendingCount
                      )
                    : 'No meetings — available all day'}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onOpenBookingModal({
                  roomId: 'director-room',
                  date: selectedDate,
                  startTime: '10:00',
                  endTime: '11:00',
                })
              }
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              {isAdmin ? 'Book Director' : 'Request Director'}
            </button>
          </div>
        </div>

        {/* Reservations List for Selected Date */}
        {selectedDayFilteredBookings.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-slate-900">
              No reservations on {selectedDate}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Both rooms are open unless filtered above. Choose a room to request a slot.
            </p>
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
                  <th className="py-3 px-5">Status</th>
                  <th className="py-3 px-5 text-right">Duration</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {selectedDayFilteredBookings.map((b) => {
                  const s = parseTimeToMinutes(b.startTime) ?? 0;
                  const e = parseTimeToMinutes(b.endTime) ?? 0;
                  const dur = Math.max(0, e - s);
                  const isConfirming = confirmCancelId === b.id;
                  const pending = isBookingPending(b);
                  const isBusy = busyId === b.id;

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
                      <td className="py-3 px-5 whitespace-nowrap">
                        {pending ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-xs font-medium text-amber-800">
                            Pending Approval
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-700">
                            Confirmed
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-5 text-right font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                        {dur}m
                      </td>
                      <td className="py-3 px-5 text-right whitespace-nowrap">
                        {pending ? (
                          isAdmin ? (
                            <span className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleApprove(b.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-60"
                              >
                                <Check className="h-3 w-3" />
                                <span>Approve</span>
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleReject(b.id)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 text-xs font-medium text-slate-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                              >
                                <X className="h-3 w-3" />
                                <span>Decline</span>
                              </button>
                            </span>
                          ) : (
                            <span className="text-xs text-amber-700">Awaiting Admin</span>
                          )
                        ) : !canCancelBooking(b) ? (
                          <span className="text-xs text-slate-400">Confirmed</span>
                        ) : isConfirming ? (
                          <span className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
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
      </section>
    </div>
  );
}
