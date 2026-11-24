import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Booking,
  CreateBookingInput,
  NotificationEvent,
  Room,
  WsServerMessage,
} from '../types/room';
import { ROOMS, sortBookingsByTime } from '../utils/bookingRules';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting';

export interface ToastNotification {
  id: string;
  event: NotificationEvent;
}

function playNotificationTone(type: NotificationEvent['type']): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'booking:created') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.09); // A5
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(392, now + 0.09); // G4
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.start(now);
    osc.stop(now + 0.3);
    osc.onended = () => {
      ctx.close().catch(() => {});
    };
  } catch {
    // Ignore audio context errors when autoplay is blocked
  }
}

export function useRoomMonitor() {
  const [rooms, setRooms] = useState<Room[]>(ROOMS);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('meridian_sound_alerts') !== 'false';
    } catch {
      return true;
    }
  });

  const [desktopAlertsEnabled, setDesktopAlertsEnabled] = useState<boolean>(() => {
    try {
      return (
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted' &&
        localStorage.getItem('meridian_desktop_alerts') === 'true'
      );
    } catch {
      return false;
    }
  });

  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;
  const desktopRef = useRef(desktopAlertsEnabled);
  desktopRef.current = desktopAlertsEnabled;
  const seenNotificationIds = useRef<Set<string>>(new Set());

  // Live clock tick every 15s (and exact minute updates)
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('meridian_sound_alerts', String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const toggleDesktopAlerts = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    if (desktopRef.current) {
      setDesktopAlertsEnabled(false);
      try {
        localStorage.setItem('meridian_desktop_alerts', 'false');
      } catch {
        // Ignore
      }
      return;
    }

    if (Notification.permission === 'granted') {
      setDesktopAlertsEnabled(true);
      try {
        localStorage.setItem('meridian_desktop_alerts', 'true');
      } catch {
        // Ignore
      }
      return;
    }

    if (Notification.permission !== 'denied') {
      const perm = await Notification.requestPermission();
      const granted = perm === 'granted';
      setDesktopAlertsEnabled(granted);
      try {
        localStorage.setItem('meridian_desktop_alerts', String(granted));
      } catch {
        // Ignore
      }
    }
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushIncomingNotification = useCallback((event: NotificationEvent) => {
    if (seenNotificationIds.current.has(event.id)) return;
    seenNotificationIds.current.add(event.id);

    setNotifications((prev) => {
      if (prev.some((n) => n.id === event.id)) return prev;
      return [event, ...prev].slice(0, 100);
    });

    setToasts((prev) => {
      if (prev.some((t) => t.id === event.id)) return prev;
      return [{ id: event.id, event }, ...prev].slice(0, 4);
    });

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== event.id));
    }, 7000);

    if (soundRef.current) {
      playNotificationTone(event.type);
    }

    if (
      desktopRef.current &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    ) {
      const prefix = event.type === 'booking:created' ? 'Room Booked' : 'Booking Cancelled';
      new Notification(`${prefix}: ${event.roomName}`, {
        body: `${event.title} (${event.startTime}–${event.endTime}) · ${event.organizer}`,
      });
    }
  }, []);

  const fetchInitialState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = (await res.json()) as {
        rooms: Room[];
        bookings: Booking[];
        notifications: NotificationEvent[];
      };
      setRooms(data.rooms);
      setBookings(sortBookingsByTime(data.bookings));
      for (const n of data.notifications) {
        seenNotificationIds.current.add(n.id);
      }
      setNotifications(data.notifications);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load room schedule.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch initial state + connect WebSocket with reconnect
  useEffect(() => {
    fetchInitialState();

    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let disposed = false;
    let attempt = 0;

    function connect() {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      setConnectionState(attempt === 0 ? 'connecting' : 'reconnecting');

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        attempt = 0;
        setConnectionState('connected');
      };

      ws.onmessage = (msgEvent) => {
        try {
          const msg = JSON.parse(String(msgEvent.data)) as WsServerMessage;
          if (msg.type === 'init') {
            setRooms(msg.rooms);
            setBookings(sortBookingsByTime(msg.bookings));
            for (const n of msg.notifications) {
              seenNotificationIds.current.add(n.id);
            }
            setNotifications(msg.notifications);
            setIsLoading(false);
            setLoadError(null);
          } else if (msg.type === 'booking:created') {
            setBookings((prev) => {
              if (prev.some((b) => b.id === msg.booking.id)) return prev;
              return sortBookingsByTime([...prev, msg.booking]);
            });
            pushIncomingNotification(msg.notification);
          } else if (msg.type === 'booking:cancelled') {
            setBookings((prev) => prev.filter((b) => b.id !== msg.bookingId));
            pushIncomingNotification(msg.notification);
          } else if (msg.type === 'notifications:read') {
            setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
          } else if (msg.type === 'notifications:cleared') {
            setNotifications([]);
          }
        } catch {
          // Ignore malformed message
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setConnectionState('reconnecting');
        attempt += 1;
        const delay = Math.min(8000, 1000 * Math.pow(1.5, Math.min(attempt, 5)));
        reconnectTimer = window.setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws?.close();
      };
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [fetchInitialState, pushIncomingNotification]);

  const createBooking = useCallback(
    async (
      input: CreateBookingInput
    ): Promise<{ ok: boolean; error?: string; booking?: Booking }> => {
      try {
        const res = await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const data = (await res.json()) as {
          booking?: Booking;
          notification?: NotificationEvent;
          error?: string;
        };
        if (!res.ok || !data.booking) {
          return { ok: false, error: data.error || 'Could not create booking.' };
        }
        // Idempotent state update in case HTTP response arrives ahead of WS broadcast
        setBookings((prev) => {
          if (prev.some((b) => b.id === data.booking!.id)) return prev;
          return sortBookingsByTime([...prev, data.booking!]);
        });
        if (data.notification) {
          pushIncomingNotification(data.notification);
        }
        return { ok: true, booking: data.booking };
      } catch {
        return { ok: false, error: 'Network error while creating booking.' };
      }
    },
    [pushIncomingNotification]
  );

  const cancelBooking = useCallback(
    async (bookingId: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}`, {
          method: 'DELETE',
        });
        const data = (await res.json()) as {
          bookingId?: string;
          notification?: NotificationEvent;
          error?: string;
        };
        if (!res.ok) {
          return { ok: false, error: data.error || 'Could not cancel booking.' };
        }
        setBookings((prev) => prev.filter((b) => b.id !== bookingId));
        if (data.notification) {
          pushIncomingNotification(data.notification);
        }
        return { ok: true };
      } catch {
        return { ok: false, error: 'Network error while cancelling booking.' };
      }
    },
    [pushIncomingNotification]
  );

  const markAllNotificationsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await fetch('/api/notifications/read', { method: 'POST' });
    } catch {
      // Ignore transient network failure
    }
  }, []);

  const clearAllNotifications = useCallback(async () => {
    setNotifications([]);
    try {
      await fetch('/api/notifications', { method: 'DELETE' });
    } catch {
      // Ignore transient network failure
    }
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    rooms,
    bookings,
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
    createBooking,
    cancelBooking,
    markAllNotificationsRead,
    clearAllNotifications,
    retryLoad: fetchInitialState,
  };
}
