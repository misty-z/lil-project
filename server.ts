import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  Booking,
  CreateBookingInput,
  NotificationEvent,
  WsServerMessage,
} from './src/types/room';
import {
  createInitialSeedBookings,
  ROOM_MAP,
  ROOMS,
  sortBookingsByTime,
  validateBookingInput,
} from './src/utils/bookingRules';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'bookings.json');

interface StoreState {
  bookings: Booking[];
  notifications: NotificationEvent[];
}

function buildInitialStore(): StoreState {
  const now = new Date();
  const bookings = createInitialSeedBookings(now);
  const notifications: NotificationEvent[] = bookings.slice(0, 2).map((b, idx) => ({
    id: `seed-notif-${idx + 1}`,
    type: 'booking:created',
    roomId: b.roomId,
    roomName: ROOM_MAP[b.roomId].name,
    bookingId: b.id,
    title: b.title,
    organizer: b.organizer,
    date: b.date,
    startTime: b.startTime,
    endTime: b.endTime,
    timestamp: b.createdAt,
    read: true,
  }));
  return { bookings, notifications };
}

function loadStore(): StoreState {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<StoreState>;
      if (Array.isArray(parsed.bookings) && Array.isArray(parsed.notifications)) {
        return {
          bookings: sortBookingsByTime(parsed.bookings),
          notifications: parsed.notifications,
        };
      }
    }
  } catch (err) {
    console.error('Failed to read store, initializing fresh data:', err);
  }
  const initial = buildInitialStore();
  saveStore(initial);
  return initial;
}

function saveStore(state: StoreState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(STORE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

const store: StoreState = loadStore();

async function startServer() {
  const app = express();
  app.use(express.json());

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  function broadcast(message: WsServerMessage): void {
    const payload = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  wss.on('connection', (ws) => {
    const initPayload: WsServerMessage = {
      type: 'init',
      rooms: ROOMS,
      bookings: store.bookings,
      notifications: store.notifications,
      serverTime: new Date().toISOString(),
    };
    ws.send(JSON.stringify(initPayload));
  });

  // REST API routes
  app.get('/api/state', (_req, res) => {
    res.json({
      rooms: ROOMS,
      bookings: store.bookings,
      notifications: store.notifications,
      serverTime: new Date().toISOString(),
    });
  });

  app.post('/api/bookings', (req, res) => {
    const body = req.body as Partial<CreateBookingInput> | undefined;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Invalid request body.' });
      return;
    }

    const input: CreateBookingInput = {
      roomId: body.roomId as CreateBookingInput['roomId'],
      title: String(body.title ?? ''),
      organizer: String(body.organizer ?? ''),
      date: String(body.date ?? ''),
      startTime: String(body.startTime ?? ''),
      endTime: String(body.endTime ?? ''),
      notes: body.notes ? String(body.notes).trim() : undefined,
    };

    const validation = validateBookingInput(input, store.bookings);
    if (!validation.valid) {
      res.status(validation.isConflict ? 409 : 400).json({
        error: validation.error,
        fieldErrors: validation.fieldErrors,
        isConflict: Boolean(validation.isConflict),
      });
      return;
    }

    const nowISO = new Date().toISOString();
    const booking: Booking = {
      id: crypto.randomUUID(),
      roomId: input.roomId,
      title: input.title.trim(),
      organizer: input.organizer.trim(),
      date: input.date.trim(),
      startTime: input.startTime.trim(),
      endTime: input.endTime.trim(),
      notes: input.notes || undefined,
      createdAt: nowISO,
    };

    const notification: NotificationEvent = {
      id: crypto.randomUUID(),
      type: 'booking:created',
      roomId: booking.roomId,
      roomName: ROOM_MAP[booking.roomId].name,
      bookingId: booking.id,
      title: booking.title,
      organizer: booking.organizer,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      timestamp: nowISO,
      read: false,
    };

    store.bookings = sortBookingsByTime([...store.bookings, booking]);
    store.notifications = [notification, ...store.notifications].slice(0, 100);
    saveStore(store);

    broadcast({
      type: 'booking:created',
      booking,
      notification,
    });

    res.status(201).json({ booking, notification });
  });

  app.delete('/api/bookings/:id', (req, res) => {
    const { id } = req.params;
    const target = store.bookings.find((b) => b.id === id);
    if (!target) {
      res.status(404).json({ error: 'Booking not found.' });
      return;
    }

    const nowISO = new Date().toISOString();
    const notification: NotificationEvent = {
      id: crypto.randomUUID(),
      type: 'booking:cancelled',
      roomId: target.roomId,
      roomName: ROOM_MAP[target.roomId].name,
      bookingId: target.id,
      title: target.title,
      organizer: target.organizer,
      date: target.date,
      startTime: target.startTime,
      endTime: target.endTime,
      timestamp: nowISO,
      read: false,
    };

    store.bookings = store.bookings.filter((b) => b.id !== id);
    store.notifications = [notification, ...store.notifications].slice(0, 100);
    saveStore(store);

    broadcast({
      type: 'booking:cancelled',
      bookingId: target.id,
      roomId: target.roomId,
      notification,
    });

    res.json({ bookingId: target.id, notification });
  });

  app.post('/api/notifications/read', (_req, res) => {
    store.notifications = store.notifications.map((n) => ({ ...n, read: true }));
    saveStore(store);
    broadcast({ type: 'notifications:read' });
    res.json({ ok: true });
  });

  app.delete('/api/notifications', (_req, res) => {
    store.notifications = [];
    saveStore(store);
    broadcast({ type: 'notifications:cleared' });
    res.json({ ok: true });
  });

  // Vite middleware in dev, static assets in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Meridian Rooms server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
