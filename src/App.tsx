import { useMemo, useState } from 'react';
import {
  Bell,
  CalendarCheck2,
  CalendarX2,
  Clock,
  RefreshCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { BookingModal } from './components/BookingModal';
import { NotificationsView } from './components/NotificationsView';
import { PendingRequestsPanel } from './components/PendingRequestsPanel';
import { RoomMonitorCard } from './components/RoomMonitorCard';
import { RoomsDirectoryView } from './components/RoomsDirectoryView';
import { ScheduleView } from './components/ScheduleView';
import { Sidebar, type NavView } from './components/Sidebar';
import { ToastStack } from './components/ToastStack';
import { TopBar } from './components/TopBar';
import { useRoomMonitor } from './hooks/useRoomMonitor';
import type { NotificationType, RoomId, RoomStatusInfo } from './types/room';
import {
  computeRoomStatus,
  findNextAvailableSlot,
  formatDateISO,
  isBookingApproved,
} from './utils/bookingRules';

function getActivityMeta(type: NotificationType) {
  switch (type) {
    case 'booking:requested':
      return {
        label: 'Requested',
        colorClass: 'text-amber-700',
        iconClass: 'text-amber-600',
        Icon: Clock,
      };
    case 'booking:approved':
      return {
        label: 'Approved',
        colorClass: 'text-emerald-700',
        iconClass: 'text-emerald-600',
        Icon: CalendarCheck2,
      };
    case 'booking:created':
      return {
        label: 'Booked',
        colorClass: 'text-emerald-700',
        iconClass: 'text-emerald-600',
        Icon: CalendarCheck2,
      };
    case 'booking:rejected':
      return {
        label: 'Declined',
        colorClass: 'text-red-700',
        iconClass: 'text-red-600',
        Icon: CalendarX2,
      };
    case 'booking:cancelled':
      return {
        label: 'Cancelled',
        colorClass: 'text-red-700',
        iconClass: 'text-red-600',
        Icon: CalendarX2,
      };
  }
}

export default function App() {
  const {
    user,
    isAdmin,
    isSigningIn,
    authError,
    signInWithGoogle,
    signOutUser,
    rooms,
    bookings,
    pendingRequests,
    notifications,
    unreadCount,
    toasts,
    connectionState,
    isLoading,
    loadError,
    now,
    soundEnabled,
    desktopAlertsEnabled,
    toggleSound,
    toggleDesktopAlerts,
    dismissToast,
    canCancelBooking,
    createBooking,
    approveBooking,
    rejectBooking,
    cancelBooking,
    markAllNotificationsRead,
    clearAllNotifications,
    retryLoad,
  } = useRoomMonitor();

  const [activeView, setActiveView] = useState<NavView>('monitor');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitialValues, setModalInitialValues] = useState<{
    roomId: RoomId;
    date: string;
    startTime: string;
    endTime: string;
  }>(() => ({
    roomId: 'main-meeting',
    date: formatDateISO(new Date()),
    startTime: '10:00',
    endTime: '10:30',
  }));

  const roomStatuses = useMemo(() => {
    const map = {} as Record<RoomId, RoomStatusInfo>;
    for (const room of rooms) {
      map[room.id] = computeRoomStatus(room.id, bookings, now);
    }
    return map;
  }, [rooms, bookings, now]);

  const availableRoomCount = useMemo(() => {
    return rooms.filter((r) => roomStatuses[r.id]?.status !== 'occupied').length;
  }, [rooms, roomStatuses]);

  const totalTodayConfirmed = useMemo(() => {
    const todayISO = formatDateISO(now);
    return bookings.filter((b) => b.date === todayISO && isBookingApproved(b)).length;
  }, [bookings, now]);

  const openDefaultBookingModal = () => {
    const todayISO = formatDateISO(now);
    const preferredRoom: RoomId =
      roomStatuses['director-room']?.status !== 'occupied'
        ? 'director-room'
        : 'main-meeting';
    const nextSlot = findNextAvailableSlot(preferredRoom, todayISO, 30, bookings, now);
    setModalInitialValues({
      roomId: preferredRoom,
      date: todayISO,
      startTime: nextSlot.startTime,
      endTime: nextSlot.endTime,
    });
    setModalOpen(true);
  };

  const openPrefilledBookingModal = (prefill: {
    roomId: RoomId;
    date: string;
    startTime: string;
    endTime: string;
  }) => {
    setModalInitialValues(prefill);
    setModalOpen(true);
  };

  const handleOpenNotifications = () => {
    setActiveView('notifications');
    if (unreadCount > 0) {
      markAllNotificationsRead();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      <Sidebar
        activeView={activeView}
        onSelectView={(view) => {
          setActiveView(view);
          if (view === 'notifications' && unreadCount > 0) {
            markAllNotificationsRead();
          }
        }}
        unreadCount={unreadCount}
        pendingCount={pendingRequests.length}
        connectionState={connectionState}
        availableRoomCount={availableRoomCount}
        totalRoomCount={rooms.length}
        user={user}
        isAdmin={isAdmin}
        isSigningIn={isSigningIn}
        authError={authError}
        onSignIn={signInWithGoogle}
        onSignOut={signOutUser}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          activeView={activeView}
          now={now}
          unreadCount={unreadCount}
          isAdmin={isAdmin}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onOpenNotifications={handleOpenNotifications}
          onOpenBookModal={openDefaultBookingModal}
        />

        <main className="flex-1 px-4 sm:px-8 py-6 sm:py-8 max-w-7xl w-full mx-auto">
          {isLoading ? (
            <div className="space-y-6" aria-busy="true" aria-label="Loading room availability">
              <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="h-[520px] bg-white border border-slate-200 rounded-xl animate-pulse" />
                <div className="h-[520px] bg-white border border-slate-200 rounded-xl animate-pulse" />
              </div>
            </div>
          ) : loadError ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center max-w-md mx-auto mt-10">
              <p className="text-base font-semibold text-slate-900">
                Unable to load room availability
              </p>
              <p className="mt-1 text-sm text-slate-500">{loadError}</p>
              <button
                type="button"
                onClick={retryLoad}
                className="mt-5 inline-flex h-10 items-center gap-2 px-4 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Retry</span>
              </button>
            </div>
          ) : (
            <>
              {activeView === 'monitor' && (
                <div className="space-y-6">
                  {/* Hero / Summary Header */}
                  <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                        Live Room Availability
                      </h1>
                      <p className="mt-1 text-sm text-slate-600">
                        Textile 308 real-time schedule for Main Meeting Room and Director&apos;s Room. Anyone can check availability and submit a meeting request for admin approval.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={toggleSound}
                        aria-pressed={soundEnabled}
                        className="inline-flex h-9 items-center gap-2 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        {soundEnabled ? (
                          <Volume2 className="h-3.5 w-3.5 text-blue-600" />
                        ) : (
                          <VolumeX className="h-3.5 w-3.5 text-slate-400" />
                        )}
                        <span>Alerts {soundEnabled ? 'On' : 'Muted'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Summary Metrics Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 bg-white border border-slate-200 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
                    <div className="p-4">
                      <p className="text-xs font-medium text-slate-500">Available Right Now</p>
                      <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                        {availableRoomCount} / {rooms.length}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {availableRoomCount === 2
                          ? 'Both rooms open for booking'
                          : availableRoomCount === 1
                            ? 'One meeting room open'
                            : 'Both rooms currently occupied'}
                      </p>
                    </div>

                    <div className="p-4">
                      <p className="text-xs font-medium text-slate-500">Confirmed Today</p>
                      <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                        {totalTodayConfirmed}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {pendingRequests.length > 0
                          ? `${pendingRequests.length} pending admin approval`
                          : 'Approved reservations across both spaces'}
                      </p>
                    </div>

                    <div className="p-4">
                      <p className="text-xs font-medium text-slate-500">Real-Time Alerts</p>
                      <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                        {notifications.length}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {unreadCount > 0
                          ? `${unreadCount} unread updates`
                          : 'All activity acknowledged'}
                      </p>
                    </div>
                  </div>

                  {/* Primary 2-Room Live Grid */}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
                    {rooms.map((room) => (
                      <RoomMonitorCard
                        key={room.id}
                        room={room}
                        statusInfo={roomStatuses[room.id]}
                        allBookings={bookings}
                        now={now}
                        isAdmin={isAdmin}
                        onOpenBookingModal={openPrefilledBookingModal}
                        canCancelBooking={canCancelBooking}
                        onCancelBooking={cancelBooking}
                      />
                    ))}
                  </div>

                  {/* Pending Meeting Approval Queue */}
                  <PendingRequestsPanel
                    pendingRequests={pendingRequests}
                    isAdmin={isAdmin}
                    isSigningIn={isSigningIn}
                    onSignIn={signInWithGoogle}
                    onApprove={approveBooking}
                    onReject={rejectBooking}
                  />

                  {/* Recent Real-Time Activity Strip */}
                  <section
                    aria-labelledby="recent-activity-heading"
                    className="bg-white border border-slate-200 rounded-xl overflow-hidden"
                  >
                    <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-slate-500" />
                        <h2
                          id="recent-activity-heading"
                          className="text-sm font-semibold text-slate-900"
                        >
                          Recent Room Activity &amp; Alerts
                        </h2>
                      </div>
                      <button
                        type="button"
                        onClick={handleOpenNotifications}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline whitespace-nowrap"
                      >
                        View full log
                      </button>
                    </div>

                    {notifications.length === 0 ? (
                      <p className="px-6 py-8 text-center text-xs text-slate-500">
                        No recent booking or cancellation notifications.
                      </p>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {notifications.slice(0, 5).map((event) => {
                          const meta = getActivityMeta(event.type);
                          const Icon = meta.Icon;
                          const eventTime = new Date(event.timestamp).toLocaleTimeString(
                            [],
                            {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false,
                            }
                          );
                          return (
                            <li
                              key={event.id}
                              className="px-6 py-3 flex items-center justify-between gap-4 text-sm"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <Icon className={`h-4 w-4 shrink-0 ${meta.iconClass}`} />
                                <p className="truncate text-slate-700">
                                  <span className={`font-semibold ${meta.colorClass}`}>
                                    {meta.label}
                                  </span>
                                  <span aria-hidden="true"> · </span>
                                  <span className="font-medium text-slate-900">
                                    {event.roomName}
                                  </span>
                                  <span aria-hidden="true"> · </span>
                                  <span>{event.title}</span>
                                  <span className="text-slate-500">
                                    {' '}
                                    ({event.startTime}–{event.endTime}, {event.organizer})
                                  </span>
                                </p>
                              </div>
                              <span className="font-mono tabular-nums text-xs text-slate-400 shrink-0">
                                {eventTime}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                </div>
              )}

              {activeView === 'schedule' && (
                <ScheduleView
                  rooms={rooms}
                  bookings={bookings}
                  now={now}
                  isAdmin={isAdmin}
                  onOpenBookingModal={openPrefilledBookingModal}
                  canCancelBooking={canCancelBooking}
                  onApproveBooking={approveBooking}
                  onRejectBooking={rejectBooking}
                  onCancelBooking={cancelBooking}
                />
              )}

              {activeView === 'notifications' && (
                <NotificationsView
                  notifications={notifications}
                  isAdmin={isAdmin}
                  soundEnabled={soundEnabled}
                  desktopAlertsEnabled={desktopAlertsEnabled}
                  onToggleSound={toggleSound}
                  onToggleDesktopAlerts={toggleDesktopAlerts}
                  onMarkAllRead={markAllNotificationsRead}
                  onClearAll={clearAllNotifications}
                />
              )}

              {activeView === 'rooms' && (
                <RoomsDirectoryView
                  rooms={rooms}
                  roomStatuses={roomStatuses}
                  now={now}
                  isAdmin={isAdmin}
                  onOpenBookingModal={openPrefilledBookingModal}
                />
              )}
            </>
          )}
        </main>
      </div>

      <BookingModal
        isOpen={modalOpen}
        rooms={rooms}
        bookings={bookings}
        now={now}
        isAdmin={isAdmin}
        initialValues={modalInitialValues}
        defaultOrganizer={user?.displayName || ''}
        onClose={() => setModalOpen(false)}
        onSubmit={createBooking}
      />

      <ToastStack
        toasts={toasts}
        onDismiss={dismissToast}
        onViewNotifications={handleOpenNotifications}
      />
    </div>
  );
}
