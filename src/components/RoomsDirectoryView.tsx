import { useState } from 'react';
import { Building2, CalendarPlus, MapPin, Users } from 'lucide-react';
import type { Room, RoomId, RoomStatusInfo } from '../types/room';
import { formatDateISO, formatDurationLabel } from '../utils/bookingRules';

interface RoomsDirectoryViewProps {
  rooms: Room[];
  roomStatuses: Record<RoomId, RoomStatusInfo>;
  now: Date;
  onOpenBookingModal: (prefill: {
    roomId: RoomId;
    date: string;
    startTime: string;
    endTime: string;
  }) => void;
}

export function RoomsDirectoryView({
  rooms,
  roomStatuses,
  now,
  onOpenBookingModal,
}: RoomsDirectoryViewProps) {
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const todayISO = formatDateISO(now);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Office Room Directory
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Specifications, seating capacities, and equipment available across both office meeting spaces.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {rooms.map((room) => {
          const status = roomStatuses[room.id];
          const hasImgError = failedImages[room.id];

          return (
            <article
              key={room.id}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col"
            >
              <div className="h-56 bg-slate-100 overflow-hidden">
                {!hasImgError ? (
                  <img
                    src={room.imageUrl}
                    alt={`${room.name} interior`}
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setFailedImages((prev) => ({ ...prev, [room.id]: true }))
                    }
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                    <Building2 className="h-8 w-8" />
                    <span className="text-sm font-medium">{room.name}</span>
                  </div>
                )}
              </div>

              <div className="p-6 flex-1 flex flex-col justify-between gap-5">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">
                        {room.name}
                      </h2>
                      <p className="mt-1 text-xs text-slate-500 flex items-center gap-3">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          <span>{room.location}</span>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                          <Users className="h-3.5 w-3.5" />
                          <span>{room.capacity} seats</span>
                        </span>
                      </p>
                    </div>

                    <span
                      className={`text-xs font-semibold whitespace-nowrap ${
                        status?.status === 'occupied'
                          ? 'text-red-700'
                          : status?.status === 'upcoming_soon'
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                      }`}
                    >
                      {status?.status === 'occupied'
                        ? 'Occupied'
                        : status?.status === 'upcoming_soon'
                          ? 'Upcoming Soon'
                          : 'Available'}
                    </span>
                  </div>

                  <p className="text-sm text-slate-600 leading-relaxed">
                    {room.description}
                  </p>

                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-xs font-medium text-slate-700 mb-1">
                      Equipment &amp; Features
                    </p>
                    <p className="text-xs text-slate-500">
                      {room.amenities.join(' · ')}
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
                  <div className="text-xs text-slate-500">
                    <span>Booked today: </span>
                    <span className="font-mono tabular-nums font-medium text-slate-900">
                      {formatDurationLabel(status?.bookedMinutesToday ?? 0)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onOpenBookingModal({
                        roomId: room.id,
                        date: todayISO,
                        startTime: '10:00',
                        endTime: '11:00',
                      })
                    }
                    className="inline-flex h-9 items-center gap-1.5 px-3.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 whitespace-nowrap"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                    <span>Reserve Room</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
