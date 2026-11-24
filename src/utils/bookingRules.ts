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

  const sameRoomSameDay = existingBookings.filter(
    (b) => b.roomId === input.roomId && b.date === input.date.trim()
  );

  for (const existing of sameRoomSameDay) {
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
    bookings.filter((b) => b.roomId === roomId && b.date === todayISO)
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
    bookings.filter((b) => b.roomId === roomId && b.date === date)
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
      createdAt: new Date(now.getTime() - 240 * 60_000).toISOString(),
    }
  );

  return sortBookingsByTime(seeds);
}
