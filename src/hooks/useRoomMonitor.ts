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
  BookingActorType,
  BookingStatus,
  CreateBookingInput,
  NotificationEvent,
  Room,
  RoomId,
} from '../types/room';
import {
  canApproveBooking,
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

    if (type === 'booking:created' || type === 'booking:approved') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880, now + 0.09);
    } else if (type === 'booking:requested') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.09);
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

function parseBookingStatus(val: unknown): BookingStatus {
  if (val === 'pending' || val === 'approved' || val === 'rejected') {
    return val;
  }
  return 'approved';
}

function parseActorType(val: unknown): BookingActorType {
  if (val === 'guest' || val === 'admin') {
    return val;
  }
  return 'admin';
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

function getNotificationDesktopTitle(type: NotificationEvent['type']): string {
  switch (type) {
    case 'booking:requested':
      return 'Meeting Requested';
    case 'booking:created':
      return 'Room Booked';
    case 'booking:approved':
      return 'Request Approved';
    case 'booking:rejected':
      return 'Request Declined';
    case 'booking:cancelled':
      return 'Booking Cancelled';
  }
}

export function useRoomMonitor() {
  const [rooms] = useState<Room[]>(ROOMS);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [rawNotifications, setRawNotifications] = useState<
    Omit<NotificationEvent, 'read'>[]
  >([]);
  const [lastReadMs, setLastReadMs] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('meridian_last_read_guest') || '0');
      return Number.isFinite(saved) ? saved : 0;
    } catch {
      return 0;
    }
  });
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

  // Optional Admin Auth listener (does NOT block guest room viewing/requesting)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);

      const storageKey = currentUser
        ? `meridian_last_read_${currentUser.uid}`
        : 'meridian_last_read_guest';
      try {
        const saved = Number(localStorage.getItem(storageKey) || '0');
        setLastReadMs(Number.isFinite(saved) ? saved : 0);
      } catch {
        setLastReadMs(0);
      }

      if (!currentUser || !currentUser.emailVerified) {
        setIsAdmin(false);
        return;
      }

      if (currentUser.email === ADMIN_EMAIL) {
        setIsAdmin(true);
        return;
      }

      try {
        const adminSnap = await getDoc(doc(db, 'admins', currentUser.uid));
        setIsAdmin(adminSnap.exists() && adminSnap.data()?.role === 'admin');
      } catch {
        setIsAdmin(false);
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
    setAuthError(null);
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
      const prefix = getNotificationDesktopTitle(event.type);
      new Notification(`${prefix}: ${event.roomName}`, {
        body: `${event.title} (${event.startTime}–${event.endTime}) · ${event.organizer}`,
      });
    }
  }, []);

  // One-time initial seed when Admin signs in and appMeta/seed doesn't exist yet
  const ensureInitialSeed = useCallback(async (adminUser: User) => {
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
          status: 'approved',
          createdByType: 'admin',
          createdByUid: adminUser.uid,
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
          actorType: 'admin',
          timestamp: serverTimestamp(),
        });
      }

      batch.set(seedRef, {
        seeded: true,
        seededByUid: adminUser.uid,
        seededAt: serverTimestamp(),
      });

      await batch.commit();
    } catch (err) {
      const quotaMsg = formatQuotaMessage(err);
      if (quotaMsg) {
        setLoadError(quotaMsg);
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Missing or insufficient permissions')) {
        handleFirestoreError(err, OperationType.WRITE, 'appMeta/seed');
      }
    }
  }, []);

  useEffect(() => {
    if (isAdmin && user) {
      void ensureInitialSeed(user);
    }
  }, [isAdmin, user, ensureInitialSeed]);

  // Attach real-time Firestore listeners immediately for public monitoring (no login required)
  useEffect(() => {
    setIsLoading(true);
    setLoadError(null);
    setConnectionState('connecting');
    initialNotifLoaded.current = false;
    seenNotificationIds.current.clear();

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
            status: parseBookingStatus(data.status),
            createdByType: parseActorType(data.createdByType),
            createdByUid:
              typeof data.createdByUid === 'string' ? data.createdByUid : undefined,
            createdAt: timestampToISO(data.createdAt),
            reviewedByUid:
              typeof data.reviewedByUid === 'string' ? data.reviewedByUid : undefined,
            reviewedAt: data.reviewedAt ? timestampToISO(data.reviewedAt) : undefined,
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
              actorType: parseActorType(data.actorType),
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
  }, [triggerLiveAlert]);

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

  const pendingRequests = useMemo(
    () => sortBookingsByTime(bookings.filter((b) => b.status === 'pending')),
    [bookings]
  );

  const canCancelBooking = useCallback(
    (_booking: Booking): boolean => {
      return isAdmin;
    },
    [isAdmin]
  );

  const createBooking = useCallback(
    async (
      input: CreateBookingInput
    ): Promise<{ ok: boolean; error?: string; booking?: Booking }> => {
      const check = validateBookingInput(input, bookings);
      if (!check.valid) {
        return { ok: false, error: check.error || 'Invalid booking details.' };
      }

      const bookingId = crypto.randomUUID();
      const trimmedTitle = input.title.trim();
      const trimmedOrganizer = input.organizer.trim();
      const trimmedDate = input.date.trim();
      const trimmedStart = input.startTime.trim();
      const trimmedEnd = input.endTime.trim();
      const trimmedNotes = input.notes?.trim();

      const adminBooking = isAdmin && user !== null;
      const status: BookingStatus = adminBooking ? 'approved' : 'pending';
      const createdByType: BookingActorType = adminBooking ? 'admin' : 'guest';
      const notifType: NotificationEvent['type'] = adminBooking
        ? 'booking:created'
        : 'booking:requested';
      const notificationId = adminBooking
        ? `${bookingId}_created`
        : `${bookingId}_requested`;

      const batch = writeBatch(db);
      const bookingRef = doc(db, 'bookings', bookingId);
      const notifRef = doc(db, 'notifications', notificationId);

      batch.set(bookingRef, {
        roomId: input.roomId,
        title: trimmedTitle,
        organizer: trimmedOrganizer,
        date: trimmedDate,
        startTime: trimmedStart,
        endTime: trimmedEnd,
        ...(trimmedNotes ? { notes: trimmedNotes } : {}),
        status,
        createdByType,
        ...(adminBooking ? { createdByUid: user.uid } : {}),
        createdAt: serverTimestamp(),
      });

      batch.set(notifRef, {
        type: notifType,
        roomId: input.roomId,
        roomName: ROOM_MAP[input.roomId].name,
        bookingId,
        title: trimmedTitle,
        organizer: trimmedOrganizer,
        date: trimmedDate,
        startTime: trimmedStart,
        endTime: trimmedEnd,
        actorType: createdByType,
        timestamp: serverTimestamp(),
      });

      try {
        await batch.commit();
        return {
          ok: true,
          booking: {
            id: bookingId,
            roomId: input.roomId,
            title: trimmedTitle,
            organizer: trimmedOrganizer,
            date: trimmedDate,
            startTime: trimmedStart,
            endTime: trimmedEnd,
            notes: trimmedNotes || undefined,
            status,
            createdByType,
            ...(adminBooking ? { createdByUid: user.uid } : {}),
            createdAt: new Date().toISOString(),
          },
        };
      } catch (err) {
        const quotaMsg = formatQuotaMessage(err);
        if (quotaMsg) return { ok: false, error: quotaMsg };
        handleFirestoreError(err, OperationType.WRITE, `bookings/${bookingId}`);
      }
    },
    [isAdmin, user, bookings]
  );

  const approveBooking = useCallback(
    async (bookingId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!isAdmin || !user) {
        return { ok: false, error: 'Only the administrator can approve requests.' };
      }

      const target = bookings.find((b) => b.id === bookingId);
      if (!target) {
        return { ok: false, error: 'Meeting request not found.' };
      }

      const check = canApproveBooking(target, bookings);
      if (!check.ok) {
        return { ok: false, error: check.error };
      }

      const batch = writeBatch(db);
      batch.update(doc(db, 'bookings', bookingId), {
        status: 'approved',
        reviewedByUid: user.uid,
        reviewedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'notifications', `${bookingId}_approved`), {
        type: 'booking:approved',
        roomId: target.roomId,
        roomName: ROOM_MAP[target.roomId].name,
        bookingId: target.id,
        title: target.title,
        organizer: target.organizer,
        date: target.date,
        startTime: target.startTime,
        endTime: target.endTime,
        actorType: 'admin',
        timestamp: serverTimestamp(),
      });

      try {
        await batch.commit();
        return { ok: true };
      } catch (err) {
        const quotaMsg = formatQuotaMessage(err);
        if (quotaMsg) return { ok: false, error: quotaMsg };
        handleFirestoreError(err, OperationType.UPDATE, `bookings/${bookingId}`);
      }
    },
    [isAdmin, user, bookings]
  );

  const rejectBooking = useCallback(
    async (bookingId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!isAdmin || !user) {
        return { ok: false, error: 'Only the administrator can decline requests.' };
      }

      const target = bookings.find((b) => b.id === bookingId);
      if (!target || target.status !== 'pending') {
        return { ok: false, error: 'Pending meeting request not found.' };
      }

      const batch = writeBatch(db);
      batch.update(doc(db, 'bookings', bookingId), {
        status: 'rejected',
        reviewedByUid: user.uid,
        reviewedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'notifications', `${bookingId}_rejected`), {
        type: 'booking:rejected',
        roomId: target.roomId,
        roomName: ROOM_MAP[target.roomId].name,
        bookingId: target.id,
        title: target.title,
        organizer: target.organizer,
        date: target.date,
        startTime: target.startTime,
        endTime: target.endTime,
        actorType: 'admin',
        timestamp: serverTimestamp(),
      });

      try {
        await batch.commit();
        return { ok: true };
      } catch (err) {
        const quotaMsg = formatQuotaMessage(err);
        if (quotaMsg) return { ok: false, error: quotaMsg };
        handleFirestoreError(err, OperationType.UPDATE, `bookings/${bookingId}`);
      }
    },
    [isAdmin, user, bookings]
  );

  const cancelBooking = useCallback(
    async (bookingId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!isAdmin || !user) {
        return { ok: false, error: 'Only the administrator can cancel bookings.' };
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
        actorType: 'admin',
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
    [isAdmin, user, bookings]
  );

  const markAllNotificationsRead = useCallback(() => {
    const nowTs = Date.now();
    setLastReadMs(nowTs);
    const storageKey = user
      ? `meridian_last_read_${user.uid}`
      : 'meridian_last_read_guest';
    try {
      localStorage.setItem(storageKey, String(nowTs));
    } catch {
      // Ignore storage errors
    }
  }, [user]);

  const clearAllNotifications = useCallback(async () => {
    if (!isAdmin || !user) return;
    if (rawNotifications.length === 0) return;

    const batch = writeBatch(db);
    for (const item of rawNotifications) {
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
  }, [isAdmin, user, rawNotifications]);

  const retryLoad = useCallback(() => {
    window.location.reload();
  }, []);

  return {
    user,
    isAdmin,
    authReady,
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
  };
}
