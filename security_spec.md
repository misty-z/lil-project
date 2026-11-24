# Firestore Security Specification — Textile 308

## 1. Data Invariants
1. **Public Read & Guest Request Access**: Anyone in the office (no login required) can read `bookings` and `notifications` scoped to `roomId in ['main-meeting', 'director-room']`, and can submit a `pending` booking request.
2. **Admin-Only Approval, Rejection, and Cancellation**: Only verified office admins (`isAdmin()`, bootstrapped to `malif0313@gmail.com` or `/admins/{uid}`) may create `approved` bookings directly, update a `pending` request to `approved` or `rejected`, or delete/cancel existing bookings and notifications.
3. **Immutable Booking Fields & Terminal Lock**: Once created, `roomId`, `title`, `organizer`, `date`, `startTime`, `endTime`, `createdAt`, and `createdByType` cannot be mutated. Once a booking reaches `rejected`, no further updates are allowed.
4. **Temporal Integrity**: `createdAt`, `reviewedAt`, `timestamp`, and `seededAt` MUST equal `request.time`.
5. **Atomicity Guarantee**: Every booking creation, approval, rejection, or deletion MUST atomically create its matching notification document (`getAfter` / `existsAfter`).
6. **Strict Schema & Size Bounds**: Every write validates `hasAll` + `hasOnly` and bounds all string lengths and regex patterns.

## 2. The "Dirty Dozen" Attack Payloads (All Must Yield PERMISSION_DENIED)
1. **Guest Self-Approval on Create**: Unauthenticated user sends `{ ...validBooking, status: 'approved' }` -> DENIED.
2. **Guest Approval Update**: Unauthenticated user updates `/bookings/b1` to `{ status: 'approved' }` -> DENIED (`update` requires `isAdmin()`).
3. **Guest Cancellation**: Unauthenticated user attempts `deleteDoc('/bookings/b1')` -> DENIED (`delete` requires `isAdmin()`).
4. **Non-Admin Signed-In User Approval**: Random Google account (not `malif0313@gmail.com`) attempts to approve `/bookings/b1` -> DENIED.
5. **Ghost/Shadow Field Injection**: Guest sends `{ ...validPending, isApproved: true }` -> DENIED (`hasOnly` rejects).
6. **Invalid Room ID**: Guest sends `{ ...validPending, roomId: 'lobby' }` -> DENIED.
7. **Oversized Title (> 80 chars)**: Guest sends `{ ...validPending, title: 'x'.repeat(81) }` -> DENIED.
8. **Forged Client Timestamp**: Guest sends `{ ...validPending, createdAt: Timestamp.fromMillis(1000) }` -> DENIED (`createdAt != request.time`).
9. **ID Poisoning**: Guest writes `/bookings/bad$id` -> DENIED (`isValidId` rejects).
10. **Orphan Booking Request Without Notification**: Guest creates `/bookings/b1` outside batch -> DENIED (`existsAfter` fails).
11. **Fake Approval Notification by Guest**: Guest writes `/notifications/b1_approved` -> DENIED (`isAdmin()` required).
12. **Privilege Escalation**: Guest or non-admin attempts `setDoc('/admins/uid', { role: 'admin', assignedAt: request.time })` -> DENIED.
