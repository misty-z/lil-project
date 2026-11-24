import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRoomStatus,
  createInitialSeedBookings,
  doIntervalsOverlap,
  findNextAvailableSlot,
  formatDateISO,
  formatRoomCapacity,
  minutesToTime,
  parseTimeToMinutes,
  ROOMS,
  validateBookingInput,
} from './bookingRules';
import type { Booking } from '../types/room';

test('parseTimeToMinutes and minutesToTime round-trip cleanly', () => {
  assert.equal(parseTimeToMinutes('09:30'), 570);
  assert.equal(parseTimeToMinutes('00:00'), 0);
  assert.equal(parseTimeToMinutes('23:59'), 1439);
  assert.equal(parseTimeToMinutes('24:00'), null);
  assert.equal(parseTimeToMinutes('invalid'), null);
  assert.equal(minutesToTime(570), '09:30');
  assert.equal(minutesToTime(0), '00:00');
});

test('doIntervalsOverlap allows back-to-back meetings and detects overlaps', () => {
  // Back-to-back [09:00, 10:00] and [10:00, 11:00] must NOT overlap
  assert.equal(doIntervalsOverlap(540, 600, 600, 660), false);
  // Partial overlap [09:00, 10:30] and [10:00, 11:00] MUST overlap
  assert.equal(doIntervalsOverlap(540, 630, 600, 660), true);
  // Contained overlap [09:00, 12:00] and [10:00, 11:00]
  assert.equal(doIntervalsOverlap(540, 720, 600, 660), true);
});

test('validateBookingInput enforces required fields and room conflicts', () => {
  const existing: Booking[] = [
    {
      id: 'b1',
      roomId: 'main-meeting',
      title: 'Team Standup',
      organizer: 'Sarah',
      date: '2026-11-23',
      startTime: '10:00',
      endTime: '11:00',
      createdAt: '2026-11-23T08:00:00.000Z',
    },
  ];

  // Missing title
  const missingTitle = validateBookingInput(
    {
      roomId: 'main-meeting',
      title: '   ',
      organizer: 'Alex',
      date: '2026-11-23',
      startTime: '11:00',
      endTime: '12:00',
    },
    existing
  );
  assert.equal(missingTitle.valid, false);
  assert.ok(missingTitle.fieldErrors?.title);

  // Overlapping in same room
  const conflict = validateBookingInput(
    {
      roomId: 'main-meeting',
      title: 'Budget Sync',
      organizer: 'Alex',
      date: '2026-11-23',
      startTime: '10:30',
      endTime: '11:30',
    },
    existing
  );
  assert.equal(conflict.valid, false);
  assert.equal(conflict.isConflict, true);

  // Same time in Director's Room is allowed
  const otherRoom = validateBookingInput(
    {
      roomId: 'director-room',
      title: 'Budget Sync',
      organizer: 'Alex',
      date: '2026-11-23',
      startTime: '10:30',
      endTime: '11:30',
    },
    existing
  );
  assert.equal(otherRoom.valid, true);

  // Adjacent back-to-back in same room is allowed
  const adjacent = validateBookingInput(
    {
      roomId: 'main-meeting',
      title: 'Follow-up',
      organizer: 'Alex',
      date: '2026-11-23',
      startTime: '11:00',
      endTime: '11:30',
    },
    existing
  );
  assert.equal(adjacent.valid, true);
});

test('computeRoomStatus classifies occupied, upcoming_soon, and available', () => {
  const now = new Date(2026, 10, 23, 10, 15, 0); // 10:15 local
  const todayISO = formatDateISO(now);

  const bookings: Booking[] = [
    {
      id: 'm1',
      roomId: 'main-meeting',
      title: 'Active Sync',
      organizer: 'Sarah',
      date: todayISO,
      startTime: '10:00',
      endTime: '10:45',
      createdAt: now.toISOString(),
    },
    {
      id: 'd1',
      roomId: 'director-room',
      title: 'Soon Briefing',
      organizer: 'Elena',
      date: todayISO,
      startTime: '10:35',
      endTime: '11:15',
      createdAt: now.toISOString(),
    },
  ];

  const mainStatus = computeRoomStatus('main-meeting', bookings, now);
  assert.equal(mainStatus.status, 'occupied');
  assert.equal(mainStatus.minutesUntilFree, 30);
  assert.equal(mainStatus.currentBooking?.id, 'm1');

  const dirStatus = computeRoomStatus('director-room', bookings, now);
  assert.equal(dirStatus.status, 'upcoming_soon');
  assert.equal(dirStatus.minutesUntilNext, 20);
  assert.equal(dirStatus.nextBooking?.id, 'd1');

  const laterNow = new Date(2026, 10, 23, 12, 0, 0);
  const freeStatus = computeRoomStatus('director-room', bookings, laterNow);
  assert.equal(freeStatus.status, 'available');
  assert.equal(freeStatus.currentBooking, null);
  assert.equal(freeStatus.nextBooking, null);
});

test('findNextAvailableSlot skips busy intervals cleanly', () => {
  const now = new Date(2026, 10, 23, 9, 50, 0);
  const todayISO = formatDateISO(now);
  const bookings: Booking[] = [
    {
      id: 'm1',
      roomId: 'main-meeting',
      title: 'Morning Sync',
      organizer: 'Sarah',
      date: todayISO,
      startTime: '09:45',
      endTime: '10:30',
      createdAt: now.toISOString(),
    },
  ];

  const slot = findNextAvailableSlot('main-meeting', todayISO, 30, bookings, now);
  assert.equal(slot.startTime, '10:30');
  assert.equal(slot.endTime, '11:00');
});

test('createInitialSeedBookings produces non-overlapping valid bookings even late at night', () => {
  for (const hour of [9, 14, 19, 23]) {
    const sampleTime = new Date(2026, 10, 23, hour, 35, 0);
    const seeds = createInitialSeedBookings(sampleTime);
    assert.ok(seeds.length >= 2);
    for (let i = 0; i < seeds.length; i++) {
      const others = seeds.filter((_, idx) => idx !== i);
      const check = validateBookingInput(seeds[i], others);
      assert.equal(check.valid, true, `Seed booking ${seeds[i].id} invalid at hour ${hour}: ${check.error}`);
    }
  }
});

test('validateBookingInput enforces blueprint max lengths and time format', () => {
  const overTitle = validateBookingInput(
    {
      roomId: 'main-meeting',
      title: 'A'.repeat(81),
      organizer: 'Alex',
      date: '2026-11-23',
      startTime: '10:00',
      endTime: '10:30',
    },
    []
  );
  assert.equal(overTitle.valid, false);
  assert.ok(overTitle.fieldErrors?.title);

  const overNotes = validateBookingInput(
    {
      roomId: 'main-meeting',
      title: 'Sync',
      organizer: 'Alex',
      date: '2026-11-23',
      startTime: '10:00',
      endTime: '10:30',
      notes: 'N'.repeat(201),
    },
    []
  );
  assert.equal(overNotes.valid, false);
  assert.ok(overNotes.fieldErrors?.notes);
});

test('Director Room has max 4 seats and formats capacity cleanly', () => {
  const mainRoom = ROOMS.find((r) => r.id === 'main-meeting');
  const directorRoom = ROOMS.find((r) => r.id === 'director-room');
  assert.ok(mainRoom && directorRoom);
  assert.equal(mainRoom.capacity, 10);
  assert.equal(directorRoom.capacity, 4);
  assert.equal(formatRoomCapacity(mainRoom), '10 seats');
  assert.equal(formatRoomCapacity(directorRoom), 'Max 4 seats');
});
