export type RoomId = 'main-meeting' | 'director-room';

export type BookingStatus = 'pending' | 'approved' | 'rejected';

export type BookingActorType = 'guest' | 'admin';

export interface Room {
  id: RoomId;
  name: string;
  shortName: string;
  capacity: number;
  location: string;
  amenities: string[];
  description: string;
  imageUrl: string;
}

export interface Booking {
  id: string;
  roomId: RoomId;
  title: string;
  organizer: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM (24h)
  endTime: string; // HH:MM (24h)
  notes?: string;
  status?: BookingStatus;
  createdByType?: BookingActorType;
  createdByUid?: string;
  createdAt: string; // ISO timestamp
  reviewedByUid?: string;
  reviewedAt?: string;
}

export interface CreateBookingInput {
  roomId: RoomId;
  title: string;
  organizer: string;
  date: string;
  startTime: string;
  endTime: string;
  notes?: string;
}

export type NotificationType =
  | 'booking:requested'
  | 'booking:created'
  | 'booking:approved'
  | 'booking:rejected'
  | 'booking:cancelled';

export interface NotificationEvent {
  id: string;
  type: NotificationType;
  roomId: RoomId;
  roomName: string;
  bookingId: string;
  title: string;
  organizer: string;
  date: string;
  startTime: string;
  endTime: string;
  actorType?: BookingActorType;
  timestamp: string; // ISO timestamp
  read: boolean;
}

export type RoomAvailabilityStatus = 'available' | 'occupied' | 'upcoming_soon';

export interface RoomStatusInfo {
  status: RoomAvailabilityStatus;
  currentBooking: Booking | null;
  nextBooking: Booking | null;
  minutesUntilFree: number | null;
  minutesUntilNext: number | null;
  todayBookings: Booking[];
  pendingBookings: Booking[];
  bookedMinutesToday: number;
}

export type WsServerMessage =
  | {
      type: 'init';
      rooms: Room[];
      bookings: Booking[];
      notifications: NotificationEvent[];
      serverTime: string;
    }
  | {
      type: 'booking:created';
      booking: Booking;
      notification: NotificationEvent;
    }
  | {
      type: 'booking:cancelled';
      bookingId: string;
      roomId: RoomId;
      notification: NotificationEvent;
    }
  | {
      type: 'notifications:read';
    }
  | {
      type: 'notifications:cleared';
    };
