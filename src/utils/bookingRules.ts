import type {
  Booking,
  CreateBookingInput,
  Room,
  RoomId,
  RoomStatusInfo,
} from '../types/room';

export const ROOMS: Room[] = [
  {
    id: 'main-meeting',
    name: 'Main Meeting Room',
    shortName: 'Main Room',
    capacity: 10,
    location: 'Floor 2 · North Wing',
    amenities: ['4K Display', 'Video Conferencing', 'Glass Whiteboard', 'Dual Mics'],
    description:
      'Primary collaborative conference room equipped for team syncs, client workshops, and hybrid presentations.',
    imageUrl: '/src/assets/images/main_meeting_room_1795489639174.jpg',
  },
  {
    id: 'director-room',
    name: "Director's Room",
    shortName: "Director's Room",
    capacity: 4,
    location: 'Floor 2 · Executive Suite',
    amenities: ['Executive Audio', 'Acoustic Privacy', 'Wireless Casting', 'Walnut Table'],
    description:
      'Private executive boardroom (max 4 seats) reserved for leadership reviews, confidential 1-on-1s, and strategic briefings.',
    imageUrl: '/src/assets/images/director_meeting_room_1795489639541.jpg',
  },
];

export function formatRoomCapacity(room: Room): string {
  return room.id === 'director-room'
    ? `Max ${room.capacity} seats`
    : `${room.capacity} seats`;
}

export const ROOM_MAP: Record<RoomId, Room> = {
  'main-meeting': ROOMS[0],
  'director-room': ROOMS[1],
};

export function isValidRoomId(value: string): value is RoomId {
  return value === 'main-meeting' || value === 'director-room';
}

export function isBookingApproved(booking: Booking): boolean {
  return (booking.status ?? 'approved') === 'approved';
}

export function isBookingPending(booking: Booking): boolean {
  return booking.status === 'pending';
}

export function isBookingRejected(booking: Booking): boolean {
  return booking.status === 'rejected';
}

export function parseTimeToMinutes(hhmm: string): number | null {
  if (typeof hhmm !== 'string') return null;
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.floor(totalMinutes)));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatTimeHHMM(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function addDaysToISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return formatDateISO(dt);
}

export function doIntervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export interface BookingValidationResult {
  valid: boolean;
  error?: string;
  isConflict?: boolean;
  conflictingBooking?: Booking;
  fieldErrors?: Record<string, string>;
}

export const TITLE_MAX_LENGTH = 80;
export const ORGANIZER_MAX_LENGTH = 60;
export const NOTES_MAX_LENGTH = 200;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateBookingInput(
  input: CreateBookingInput,
  existingBookings: Booking[]
): BookingValidationResult {
  const fieldErrors: Record<string, string> = {};

  if (!isValidRoomId(input.roomId)) {
    fieldErrors.roomId = 'Please select a valid meeting room.';
  }

  const title = (input.title ?? '').trim();
  if (!title) {
    fieldErrors.title = 'Meeting title is required.';
  } else if (title.length > TITLE_MAX_LENGTH) {
    fieldErrors.title = `Meeting title must be ${TITLE_MAX_LENGTH} characters or fewer.`;
  }

  const organizer = (input.organizer ?? '').trim();
  if (!organizer) {
    fieldErrors.organizer = 'Organizer name is required.';
  } else if (organizer.length > ORGANIZER_MAX_LENGTH) {
    fieldErrors.organizer = `Organizer name must be ${ORGANIZER_MAX_LENGTH} characters or fewer.`;
  }

  if (!DATE_PATTERN.test((input.date ?? '').trim())) {
    fieldErrors.date = 'Valid date (YYYY-MM-DD) is required.';
  }

  const notes = (input.notes ?? '').trim();
  if (notes.length > NOTES_MAX_LENGTH) {
    fieldErrors.notes = `Notes must be ${NOTES_MAX_LENGTH} characters or fewer.`;
  }

  const startStr = (input.startTime ?? '').trim();
  const endStr = (input.endTime ?? '').trim();
  const startMin = TIME_PATTERN.test(startStr) ? parseTimeToMinutes(startStr) : null;
  const endMin = TIME_PATTERN.test(endStr) ? parseTimeToMinutes(endStr) : null;

  if (startMin === null) {
    fieldErrors.startTime = 'Valid start time (HH:MM) is required.';
  }
  if (endMin === null) {
    fieldErrors.endTime = 'Valid end time (HH:MM) is required.';
  }
  if (startMin !== null && endMin !== null && endMin <= startMin) {
    fieldErrors.endTime = 'End time must be after start time.';
  }
  if (startMin !== null && endMin !== null && endMin - startMin < 15) {
    fieldErrors.endTime = 'Minimum meeting duration is 15 minutes.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    const firstMsg = Object.values(fieldErrors)[0];
    return { valid: false, error: firstMsg, fieldErrors };
  }

  const sMin = startMin as number;
  const eMin = endMin as number;

  const sameRoomSameDayApproved = existingBookings.filter(
    (b) =>
      isBookingApproved(b) &&
      b.roomId === input.roomId &&
      b.date === input.date.trim()
  );

  for (const existing of sameRoomSameDayApproved) {
    const bStart = parseTimeToMinutes(existing.startTime);
    const bEnd = parseTimeToMinutes(existing.endTime);
    if (bStart !== null && bEnd !== null && doIntervalsOverlap(sMin, eMin, bStart, bEnd)) {
      const roomName = ROOM_MAP[input.roomId].name;
      return {
        valid: false,
        isConflict: true,
        conflictingBooking: existing,
        error: `${roomName} is already booked for "${existing.title}" (${existing.startTime}–${existing.endTime}).`,
        fieldErrors: {
          startTime: `Overlaps with "${existing.title}" (${existing.startTime}–${existing.endTime}).`,
        },
      };
    }
  }

  return { valid: true };
}

export function canApproveBooking(
  target: Booking,
  allBookings: Booking[]
): { ok: boolean; error?: string; conflictingBooking?: Booking } {
  if (target.status !== 'pending') {
    return {
      ok: false,
      error: 'Only pending meeting requests can be approved.',
    };
  }

  const tStart = parseTimeToMinutes(target.startTime);
  const tEnd = parseTimeToMinutes(target.endTime);
  if (tStart === null || tEnd === null || tEnd <= tStart) {
    return { ok: false, error: 'Request has an invalid time window.' };
  }

  const conflicting = allBookings.find((b) => {
    if (b.id === target.id) return false;
    if (!isBookingApproved(b)) return false;
    if (b.roomId !== target.roomId || b.date !== target.date) return false;
    const bStart = parseTimeToMinutes(b.startTime);
    const bEnd = parseTimeToMinutes(b.endTime);
    return bStart !== null && bEnd !== null && doIntervalsOverlap(tStart, tEnd, bStart, bEnd);
  });

  if (conflicting) {
    const roomName = ROOM_MAP[target.roomId]?.name ?? target.roomId;
    return {
      ok: false,
      conflictingBooking: conflicting,
      error: `Cannot approve: ${roomName} is already approved for "${conflicting.title}" (${conflicting.startTime}–${conflicting.endTime}).`,
    };
  }

  return { ok: true };
}

export function sortBookingsByTime(bookings: Booking[]): Booking[] {
  return [...bookings].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const aStart = parseTimeToMinutes(a.startTime) ?? 0;
    const bStart = parseTimeToMinutes(b.startTime) ?? 0;
    return aStart - bStart;
  });
}

export function computeRoomStatus(
  roomId: RoomId,
  bookings: Booking[],
  now: Date
): RoomStatusInfo {
  const todayISO = formatDateISO(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const todayBookings = sortBookingsByTime(
    bookings.filter(
      (b) => b.roomId === roomId && b.date === todayISO && isBookingApproved(b)
    )
  );

  const pendingBookings = sortBookingsByTime(
    bookings.filter(
      (b) => b.roomId === roomId && b.date === todayISO && isBookingPending(b)
    )
  );

  let currentBooking: Booking | null = null;
  let nextBooking: Booking | null = null;
  let bookedMinutesToday = 0;

  for (const booking of todayBookings) {
    const s = parseTimeToMinutes(booking.startTime);
    const e = parseTimeToMinutes(booking.endTime);
    if (s === null || e === null) continue;
    bookedMinutesToday += Math.max(0, e - s);

    if (nowMinutes >= s && nowMinutes < e) {
      currentBooking = booking;
    } else if (s > nowMinutes && !nextBooking) {
      nextBooking = booking;
    }
  }

  if (currentBooking) {
    const endMin = parseTimeToMinutes(currentBooking.endTime) ?? nowMinutes;
    return {
      status: 'occupied',
      currentBooking,
      nextBooking,
      minutesUntilFree: Math.max(1, endMin - nowMinutes),
      minutesUntilNext: nextBooking
        ? Math.max(0, (parseTimeToMinutes(nextBooking.startTime) ?? nowMinutes) - nowMinutes)
        : null,
      todayBookings,
      pendingBookings,
      bookedMinutesToday,
    };
  }

  if (nextBooking) {
    const nextStart = parseTimeToMinutes(nextBooking.startTime) ?? nowMinutes;
    const minutesUntilNext = Math.max(0, nextStart - nowMinutes);
    return {
      status: minutesUntilNext <= 30 ? 'upcoming_soon' : 'available',
      currentBooking: null,
      nextBooking,
      minutesUntilFree: null,
      minutesUntilNext,
      todayBookings,
      pendingBookings,
      bookedMinutesToday,
    };
  }

  return {
    status: 'available',
    currentBooking: null,
    nextBooking: null,
    minutesUntilFree: null,
    minutesUntilNext: null,
    todayBookings,
    pendingBookings,
    bookedMinutesToday,
  };
}

export function findNextAvailableSlot(
  roomId: RoomId,
  date: string,
  durationMinutes: number,
  bookings: Booking[],
  now: Date
): { startTime: string; endTime: string } {
  const todayISO = formatDateISO(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Start searching from rounded-up 5m if today, else 09:00
  let candidateStart =
    date === todayISO
      ? Math.ceil(nowMinutes / 5) * 5
      : 9 * 60;

  // Keep within reasonable day bounds
  if (candidateStart + durationMinutes > 23 * 60 + 55) {
    candidateStart = 9 * 60;
  }

  const dayBookings = sortBookingsByTime(
    bookings.filter(
      (b) => b.roomId === roomId && b.date === date && isBookingApproved(b)
    )
  );

  for (const booking of dayBookings) {
    const bStart = parseTimeToMinutes(booking.startTime);
    const bEnd = parseTimeToMinutes(booking.endTime);
    if (bStart === null || bEnd === null) continue;
    if (doIntervalsOverlap(candidateStart, candidateStart + durationMinutes, bStart, bEnd)) {
      candidateStart = bEnd;
    }
  }

  const clampedEnd = Math.min(23 * 60 + 55, candidateStart + durationMinutes);
  return {
    startTime: minutesToTime(candidateStart),
    endTime: minutesToTime(clampedEnd),
  };
}

export function formatDurationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function createInitialSeedBookings(now: Date = new Date()): Booking[] {
  const todayISO = formatDateISO(now);
  const tomorrowISO = addDaysToISO(todayISO, 1);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const seeds: Booking[] = [];

  // Main Meeting Room: Active meeting right now (if enough day remains)
  if (nowMin >= 20 && nowMin <= 22 * 60 + 45) {
    const activeStart = Math.floor((nowMin - 15) / 5) * 5;
    const activeEnd = Math.min(23 * 60 + 50, activeStart + 60);
    seeds.push({
      id: 'seed-main-active',
      roomId: 'main-meeting',
      title: 'Weekly Product & Operations Sync',
      organizer: 'Sarah Chen',
      date: todayISO,
      startTime: minutesToTime(activeStart),
      endTime: minutesToTime(activeEnd),
      notes: 'Cross-functional sprint check-in and release readiness.',
      status: 'approved',
      createdByType: 'admin',
      createdAt: new Date(now.getTime() - 45 * 60_000).toISOString(),
    });

    // Later slot in Main Meeting Room if room before 23:30
    const laterStart = activeEnd + 45;
    if (laterStart + 45 <= 23 * 60 + 45) {
      seeds.push({
        id: 'seed-main-later',
        roomId: 'main-meeting',
        title: 'Design System Architecture Review',
        organizer: 'Marcus Vance',
        date: todayISO,
        startTime: minutesToTime(laterStart),
        endTime: minutesToTime(laterStart + 45),
        notes: 'Component tokens and accessibility audit.',
        status: 'approved',
        createdByType: 'admin',
        createdAt: new Date(now.getTime() - 120 * 60_000).toISOString(),
      });
    }
  } else {
    seeds.push({
      id: 'seed-main-morning',
      roomId: 'main-meeting',
      title: 'Weekly Product & Operations Sync',
      organizer: 'Sarah Chen',
      date: todayISO,
      startTime: '10:00',
      endTime: '11:00',
      notes: 'Cross-functional sprint check-in.',
      status: 'approved',
      createdByType: 'admin',
      createdAt: new Date(now.getTime() - 120 * 60_000).toISOString(),
    });
  }

  // Director's Room: Free right now, with an upcoming meeting in ~75m (if before 22:00) or earlier today
  const dirUpcomingStart = Math.ceil((nowMin + 75) / 15) * 15;
  if (dirUpcomingStart + 45 <= 23 * 60 + 45) {
    seeds.push({
      id: 'seed-director-upcoming',
      roomId: 'director-room',
      title: 'Executive Budget & Hiring Briefing',
      organizer: 'Elena Rostova',
      date: todayISO,
      startTime: minutesToTime(dirUpcomingStart),
      endTime: minutesToTime(dirUpcomingStart + 45),
      notes: 'Q4 headcount sign-off with department leads.',
      status: 'approved',
      createdByType: 'admin',
      createdAt: new Date(now.getTime() - 90 * 60_000).toISOString(),
    });
  } else if (nowMin >= 180) {
    const pastEnd = Math.floor((nowMin - 60) / 15) * 15;
    seeds.push({
      id: 'seed-director-earlier',
      roomId: 'director-room',
      title: 'Executive Budget & Hiring Briefing',
      organizer: 'Elena Rostova',
      date: todayISO,
      startTime: minutesToTime(Math.max(0, pastEnd - 45)),
      endTime: minutesToTime(pastEnd),
      notes: 'Q4 headcount sign-off with department leads.',
      status: 'approved',
      createdByType: 'admin',
      createdAt: new Date(now.getTime() - 180 * 60_000).toISOString(),
    });
  }

  // Tomorrow preview bookings so Tomorrow tab is immediately informative
  seeds.push(
    {
      id: 'seed-main-tomorrow',
      roomId: 'main-meeting',
      title: 'Client Onboarding Workshop',
      organizer: 'David Kim',
      date: tomorrowISO,
      startTime: '09:30',
      endTime: '11:00',
      notes: 'Technical kickoff with enterprise accounts.',
      status: 'approved',
      createdByType: 'admin',
      createdAt: new Date(now.getTime() - 240 * 60_000).toISOString(),
    },
    {
      id: 'seed-director-tomorrow',
      roomId: 'director-room',
      title: 'Board Advisory Check-in',
      organizer: 'Claire Bennett',
      date: tomorrowISO,
      startTime: '14:00',
      endTime: '15:00',
      notes: 'Quarterly governance update.',
      status: 'approved',
      createdByType: 'admin',
      createdAt: new Date(now.getTime() - 240 * 60_000).toISOString(),
    }
  );

  return sortBookingsByTime(seeds);
}

export interface MonthDaySummary {
  dateISO: string;
  dayOfMonth: number;
  inCurrentMonth: boolean;
  mainBookings: Booking[];
  directorBookings: Booking[];
  mainPendingBookings: Booking[];
  directorPendingBookings: Booking[];
  mainCount: number;
  directorCount: number;
  mainPendingCount: number;
  directorPendingCount: number;
  totalCount: number;
  totalPendingCount: number;
}

export function getDaysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function buildMonthGridCells(
  year: number,
  monthIndex: number,
  bookings: Booking[],
  searchQuery = ''
): MonthDaySummary[] {
  const q = searchQuery.trim().toLowerCase();
  const activeBookings = bookings.filter((b) => !isBookingRejected(b));
  const filtered = q
    ? activeBookings.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.organizer.toLowerCase().includes(q)
      )
    : activeBookings;

  const byDate = new Map<string, Booking[]>();
  for (const b of filtered) {
    const list = byDate.get(b.date);
    if (list) {
      list.push(b);
    } else {
      byDate.set(b.date, [b]);
    }
  }

  const firstDayOfWeek = new Date(year, monthIndex, 1).getDay(); // 0=Sun..6=Sat
  const daysInMonth = getDaysInMonth(year, monthIndex);
  const totalCells = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;

  const cells: MonthDaySummary[] = [];

  for (let i = 0; i < totalCells; i++) {
    const dayOffset = i - firstDayOfWeek + 1;
    const cellDate = new Date(year, monthIndex, dayOffset);
    const dateISO = formatDateISO(cellDate);
    const inCurrentMonth =
      cellDate.getFullYear() === year && cellDate.getMonth() === monthIndex;

    const dayBookings = sortBookingsByTime(byDate.get(dateISO) ?? []);
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

    cells.push({
      dateISO,
      dayOfMonth: cellDate.getDate(),
      inCurrentMonth,
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
    });
  }

  return cells;
}
