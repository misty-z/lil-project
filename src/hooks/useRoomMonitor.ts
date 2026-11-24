import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import type {
  Booking,
  CreateBookingInput,
  NotificationEvent,
  Room,
  RoomId,
} from '../types/room';
import {
  createInitialSeedBookings,
  ROOM_MAP,
  ROOMS,
  sortBookingsByTime,
  validateBookingInput,
} from '../utils/bookingRules';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting';

export interface ToastNotification {
  id: string;
  event: NotificationEvent;
}

const ADMIN_EMAIL = 'malif0313@gmail.com';

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
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880, now + 0.09);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(392, now + 0.09);
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

function timestampToISO(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

function formatQuotaMessage(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes("Quota exceeded for quota metric 'Free daily read units per project (free tier database)'")
  ) {
    const upgradeUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${firebaseConfig.firestoreDatabaseId}/data?openUpgradeDialog=true`;
    return `Firestore free daily read quota exceeded. It resets tomorrow, or you can view database usage at ${upgradeUrl}`;
  }
  if (msg.includes('Quota exceeded')) {
    return 'Firestore free tier daily quota exceeded. Quota resets tomorrow (see Spark plan limits at https://firebase.google.com/pricing#cloud-firestore).';
  }
  return null;
}

export function useRoomMonitor() {
  const [rooms] = useState<Room[]>(ROOMS);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [rawNotifications, setRawNotifications] = useState<
    Omit<NotificationEvent, 'read'>[]
  >([]);
  const [lastReadMs, setLastReadMs] = useState<number>(0);
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
  const initialNotifLoaded = useRef<boolean>(false);

  // Live clock tick every 15s
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (currentUser) {
        try {
          const saved = Number(
            localStorage.getItem(`meridian_last_read_${currentUser.uid}`) || '0'
          );
          setLastReadMs(Number.isFinite(saved) ? saved : 0);
        } catch {
          setLastReadMs(0);
        }
      } else {
        setBookings([]);
        setRawNotifications([]);
        seenNotificationIds.current.clear();
        initialNotifLoaded.current = false;
        setIsLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError(msg);
      }
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
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

  const triggerLiveAlert = useCallback((event: NotificationEvent) => {
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

  // One-time initial seed when signed in and appMeta/seed doesn't exist yet
  const ensureInitialSeed = useCallback(async (currentUser: User) => {
    const seedRef = doc(db, 'appMeta', 'seed');
    try {
      const seedSnap = await getDoc(seedRef);
      if (seedSnap.exists()) return;

      const seeds = createInitialSeedBookings(new Date());
      const batch = writeBatch(db);

      for (const b of seeds) {
        const bookingRef = doc(db, 'bookings', b.id);
        batch.set(bookingRef, {
          roomId: b.roomId,
          title: b.title,
          organizer: b.organizer,
          date: b.date,
          startTime: b.startTime,
          endTime: b.endTime,
          ...(b.notes ? { notes: b.notes } : {}),
          createdByUid: currentUser.uid,
          createdAt: serverTimestamp(),
        });

        const notifRef = doc(db, 'notifications', `${b.id}_created`);
        batch.set(notifRef, {
          type: 'booking:created',
          roomId: b.roomId,
          roomName: ROOM_MAP[b.roomId].name,
          bookingId: b.id,
          title: b.title,
          organizer: b.organizer,
          date: b.date,
          startTime: b.startTime,
          endTime: b.endTime,
          actorUid: currentUser.uid,
          timestamp: serverTimestamp(),
        });
      }

      batch.set(seedRef, {
        seeded: true,
        seededByUid: currentUser.uid,
        seededAt: serverTimestamp(),
      });

      await batch.commit();
    } catch (err) {
      const quotaMsg = formatQuotaMessage(err);
      if (quotaMsg) {
        setLoadError(quotaMsg);
        return;
      }
      // If another user seeded concurrently, ignore already-exists; otherwise report
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Missing or insufficient permissions')) {
        handleFirestoreError(err, OperationType.WRITE, 'appMeta/seed');
      }
    }
  }, []);

  // Attach real-time Firestore listeners only when authReady && user
  useEffect(() => {
    if (!authReady || !user) return;

    setIsLoading(true);
    setLoadError(null);
    setConnectionState('connecting');
    initialNotifLoaded.current = false;
    seenNotificationIds.current.clear();

    void ensureInitialSeed(user);

    const bookingsPath = 'bookings';
    const bookingsQuery = query(
      collection(db, bookingsPath),
      where('roomId', 'in', ['main-meeting', 'director-room'])
    );

    const unsubBookings = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        const items: Booking[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            roomId: data.roomId as RoomId,
            title: String(data.title ?? ''),
            organizer: String(data.organizer ?? ''),
            date: String(data.date ?? ''),
            startTime: String(data.startTime ?? ''),
            endTime: String(data.endTime ?? ''),
            notes: typeof data.notes === 'string' ? data.notes : undefined,
            createdByUid:
              typeof data.createdByUid === 'string' ? data.createdByUid : undefined,
            createdAt: timestampToISO(data.createdAt),
          };
        });
        setBookings(sortBookingsByTime(items));
        setConnectionState('connected');
        setIsLoading(false);
        setLoadError(null);
      },
      (error) => {
        const quotaMsg = formatQuotaMessage(error);
        if (quotaMsg) {
          setLoadError(quotaMsg);
          setIsLoading(false);
          return;
        }
        setConnectionState('reconnecting');
        handleFirestoreError(error, OperationType.LIST, bookingsPath);
      }
    );

    const notificationsPath = 'notifications';
    const notificationsQuery = query(
      collection(db, notificationsPath),
      where('roomId', 'in', ['main-meeting', 'director-room'])
    );

    const unsubNotifications = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              type: data.type as NotificationEvent['type'],
              roomId: data.roomId as RoomId,
              roomName: String(data.roomName ?? ''),
              bookingId: String(data.bookingId ?? ''),
              title: String(data.title ?? ''),
              organizer: String(data.organizer ?? ''),
              date: String(data.date ?? ''),
              startTime: String(data.startTime ?? ''),
              endTime: String(data.endTime ?? ''),
              actorUid: typeof data.actorUid === 'string' ? data.actorUid : undefined,
              timestamp: timestampToISO(data.timestamp),
            };
          })
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
          .slice(0, 100);

        if (!initialNotifLoaded.current) {
          for (const item of list) {
            seenNotificationIds.current.add(item.id);
          }
          initialNotifLoaded.current = true;
        } else {
          for (const item of list) {
            if (!seenNotificationIds.current.has(item.id)) {
              seenNotificationIds.current.add(item.id);
              triggerLiveAlert({ ...item, read: false });
            }
          }
        }

        setRawNotifications(list);
      },
      (error) => {
        const quotaMsg = formatQuotaMessage(error);
        if (quotaMsg) {
          setLoadError(quotaMsg);
          return;
        }
        handleFirestoreError(error, OperationType.LIST, notificationsPath);
      }
    );

    return () => {
      unsubBookings();
      unsubNotifications();
    };
  }, [authReady, user, ensureInitialSeed, triggerLiveAlert]);

  const notifications: NotificationEvent[] = useMemo(() => {
    return rawNotifications.map((n) => ({
      ...n,
      read: new Date(n.timestamp).getTime() <= lastReadMs,
    }));
  }, [rawNotifications, lastReadMs]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const canCancelBooking = useCallback(
    (booking: Booking): boolean => {
      if (!user) return false;
      if (user.email === ADMIN_EMAIL) return true;
      return booking.createdByUid === user.uid;
    },
    [user]
  );

  const createBooking = useCallback(
    async (
      input: CreateBookingInput
    ): Promise<{ ok: boolean; error?: string; booking?: Booking }> => {
      if (!user) {
        return { ok: false, error: 'Please sign in to book a room.' };
      }

      const check = validateBookingInput(input, bookings);
      if (!check.valid) {
        return { ok: false, error: check.error || 'Invalid booking details.' };
      }

      const bookingId = crypto.randomUUID();
      const notificationId = `${bookingId}_created`;
      const trimmedNotes = input.notes?.trim();

      const batch = writeBatch(db);
      const bookingRef = doc(db, 'bookings', bookingId);
      const notifRef = doc(db, 'notifications', notificationId);

      batch.set(bookingRef, {
        roomId: input.roomId,
        title: input.title.trim(),
        organizer: input.organizer.trim(),
        date: input.date.trim(),
        startTime: input.startTime.trim(),
        endTime: input.endTime.trim(),
        ...(trimmedNotes ? { notes: trimmedNotes } : {}),
        createdByUid: user.uid,
        createdAt: serverTimestamp(),
      });

      batch.set(notifRef, {
        type: 'booking:created',
        roomId: input.roomId,
        roomName: ROOM_MAP[input.roomId].name,
        bookingId,
        title: input.title.trim(),
        organizer: input.organizer.trim(),
        date: input.date.trim(),
        startTime: input.startTime.trim(),
        endTime: input.endTime.trim(),
        actorUid: user.uid,
        timestamp: serverTimestamp(),
      });

      try {
        await batch.commit();
        return {
          ok: true,
          booking: {
            id: bookingId,
            roomId: input.roomId,
            title: input.title.trim(),
            organizer: input.organizer.trim(),
            date: input.date.trim(),
            startTime: input.startTime.trim(),
            endTime: input.endTime.trim(),
            notes: trimmedNotes || undefined,
            createdByUid: user.uid,
            createdAt: new Date().toISOString(),
          },
        };
      } catch (err) {
        const quotaMsg = formatQuotaMessage(err);
        if (quotaMsg) return { ok: false, error: quotaMsg };
        handleFirestoreError(err, OperationType.WRITE, `bookings/${bookingId}`);
      }
    },
    [user, bookings]
  );

  const cancelBooking = useCallback(
    async (bookingId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!user) {
        return { ok: false, error: 'Please sign in to cancel a booking.' };
      }

      const target = bookings.find((b) => b.id === bookingId);
      if (!target) {
        return { ok: false, error: 'Booking not found.' };
      }

      const notificationId = `${bookingId}_cancelled`;
      const batch = writeBatch(db);
      batch.delete(doc(db, 'bookings', bookingId));
      batch.set(doc(db, 'notifications', notificationId), {
        type: 'booking:cancelled',
        roomId: target.roomId,
        roomName: ROOM_MAP[target.roomId].name,
        bookingId: target.id,
        title: target.title,
        organizer: target.organizer,
        date: target.date,
        startTime: target.startTime,
        endTime: target.endTime,
        actorUid: user.uid,
        timestamp: serverTimestamp(),
      });

      try {
        await batch.commit();
        return { ok: true };
      } catch (err) {
        const quotaMsg = formatQuotaMessage(err);
        if (quotaMsg) return { ok: false, error: quotaMsg };
        handleFirestoreError(err, OperationType.DELETE, `bookings/${bookingId}`);
      }
    },
    [user, bookings]
  );

  const markAllNotificationsRead = useCallback(() => {
    const nowTs = Date.now();
    setLastReadMs(nowTs);
    if (user) {
      try {
        localStorage.setItem(`meridian_last_read_${user.uid}`, String(nowTs));
      } catch {
        // Ignore storage errors
      }
    }
  }, [user]);

  const clearAllNotifications = useCallback(async () => {
    if (!user) return;
    const deletable = rawNotifications.filter(
      (n) => user.email === ADMIN_EMAIL || n.actorUid === user.uid
    );
    if (deletable.length === 0) return;

    const batch = writeBatch(db);
    for (const item of deletable) {
      batch.delete(doc(db, 'notifications', item.id));
    }
    try {
      await batch.commit();
    } catch (err) {
      const quotaMsg = formatQuotaMessage(err);
      if (quotaMsg) {
        setLoadError(quotaMsg);
        return;
      }
      handleFirestoreError(err, OperationType.DELETE, 'notifications');
    }
  }, [user, rawNotifications]);

  const retryLoad = useCallback(() => {
    window.location.reload();
  }, []);

  return {
    user,
    authReady,
    isSigningIn,
    authError,
    signInWithGoogle,
    signOutUser,
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
    canCancelBooking,
    createBooking,
    cancelBooking,
    markAllNotificationsRead,
    clearAllNotifications,
    retryLoad,
  };
}
