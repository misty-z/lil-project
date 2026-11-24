# Firestore Security Specification — Meridian Rooms

## 1. Data Invariants
1. **Authenticated & Verified Identity**: Only signed-in users with `request.auth.token.email_verified == true` may read or write bookings and notifications.
2. **Valid Room Boundary**: Every booking and notification MUST target `roomId in ['main-meeting', 'director-room']`. List queries are explicitly gated on `resource.data.roomId in ['main-meeting', 'director-room']`.
3. **Identity Integrity**: On creation, `bookings.createdByUid == request.auth.uid` and `notifications.actorUid == request.auth.uid`. Users cannot forge another user's UID.
4. **Temporal Integrity**: `createdAt`, `timestamp`, and `seededAt` MUST equal `request.time`.
5. **Atomicity Guarantee**: Creating a booking MUST atomically create its matching `notifications/{bookingId + '_created'}` document (`existsAfter`), and deleting a booking MUST atomically create its matching `notifications/{bookingId + '_cancelled'}` document (`existsAfter`).
6. **Cancellation Ownership**: A user can only delete (cancel) their own booking (`existing().createdByUid == request.auth.uid`), unless they are a verified admin (`isAdmin()`).
7. **Strict Schema & No Shadow Fields**: Every document write checks `hasAll` + `hasOnly` and bounds every string size and regex pattern.

## 2. The "Dirty Dozen" Attack Payloads (All Must Yield PERMISSION_DENIED)
1. **Unauthenticated Read**: `getDoc('/bookings/b1')` with `auth == null` -> DENIED.
2. **Unverified Email Write**: `setDoc('/bookings/b1', validBooking)` with `email_verified: false` -> DENIED.
3. **Spoofed Creator UID**: `setDoc('/bookings/b1', { ...validBooking, createdByUid: 'other-uid' })` -> DENIED.
4. **Ghost/Shadow Field Injection**: `setDoc('/bookings/b1', { ...validBooking, isAdmin: true })` -> DENIED (`hasOnly` rejects).
5. **Invalid Room ID**: `setDoc('/bookings/b1', { ...validBooking, roomId: 'lobby' })` -> DENIED.
6. **Oversized Title (> 80 chars)**: `setDoc('/bookings/b1', { ...validBooking, title: 'x'.repeat(81) })` -> DENIED.
7. **Forged Client Timestamp**: `setDoc('/bookings/b1', { ...validBooking, createdAt: Timestamp.fromMillis(1000) })` -> DENIED (`createdAt != request.time`).
8. **ID Poisoning (> 128 chars or invalid chars)**: `setDoc('/bookings/bad$id', validBooking)` -> DENIED (`isValidId` rejects).
9. **Orphan Booking Without Notification**: `setDoc('/bookings/b1', validBooking)` outside batch (no `_created` notification) -> DENIED (`existsAfter` fails).
10. **Fake Cancellation Notification**: `setDoc('/notifications/b1_cancelled', { ...validCancelNotif })` while `/bookings/b1` still exists -> DENIED (`!existsAfter` fails).
11. **Unauthorized Cancellation**: Non-admin user attempts `deleteDoc('/bookings/someoneElsesId')` -> DENIED.
12. **Privilege Escalation**: Non-admin attempts `setDoc('/admins/' + uid, { role: 'admin', assignedAt: request.time })` -> DENIED.
