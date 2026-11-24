import { useState } from 'react';
import { AlertCircle, Building2, CheckCircle2, LogIn } from 'lucide-react';
import { formatRoomCapacity, ROOMS } from '../utils/bookingRules';

interface AuthGateProps {
  onSignIn: () => Promise<void>;
  authError: string | null;
  isSigningIn: boolean;
}

export function AuthGate({ onSignIn, authError, isSigningIn }: AuthGateProps) {
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between">
      <header className="h-16 bg-white border-b border-slate-200 px-6 sm:px-10 flex items-center justify-between gap-8">
        <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          Textile 308
        </span>
        <button
          type="button"
          disabled={isSigningIn}
          onClick={onSignIn}
          className="inline-flex h-10 items-center gap-2 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
        >
          <LogIn className="h-4 w-4" />
          <span>{isSigningIn ? 'Signing in...' : 'Sign in with Google'}</span>
        </button>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-12 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-5 space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-blue-600">
              Live Office Room Monitor
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 text-balance">
              Real-time availability for your office meeting spaces
            </h1>
            <p className="text-base text-slate-600 leading-relaxed">
              Track live occupancy across the Main Meeting Room and Director&apos;s Room, reserve open slots with conflict protection, and receive instant booking and cancellation alerts across every connected browser.
            </p>
          </div>

          <ul className="space-y-2.5 text-sm text-slate-700">
            <li className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Live cloud database synced in real time via Firestore</span>
            </li>
            <li className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Instant booking and cancellation toast &amp; audio alerts</span>
            </li>
            <li className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Zero installation—works in any desktop or mobile browser</span>
            </li>
          </ul>

          {authError && (
            <div
              role="alert"
              className="p-3.5 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2.5 text-sm text-red-800"
            >
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <div className="pt-2">
            <button
              type="button"
              disabled={isSigningIn}
              onClick={onSignIn}
              className="inline-flex h-11 items-center gap-2.5 px-6 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60 transition-colors"
            >
              <LogIn className="h-4 w-4" />
              <span>
                {isSigningIn ? 'Connecting Google Account...' : 'Sign in with Google to Continue'}
              </span>
            </button>
          </div>
        </div>

        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-5">
          {ROOMS.map((room) => (
            <div
              key={room.id}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col"
            >
              <div className="h-44 bg-slate-100 overflow-hidden">
                {!imgErrors[room.id] ? (
                  <img
                    src={room.imageUrl}
                    alt={`${room.name} interior`}
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setImgErrors((prev) => ({ ...prev, [room.id]: true }))
                    }
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400">
                    <Building2 className="h-8 w-8" />
                  </div>
                )}
              </div>
              <div className="p-5 space-y-1.5">
                <h2 className="text-base font-semibold text-slate-900">
                  {room.name}
                </h2>
                <p className="text-xs text-slate-500 font-mono tabular-nums">
                  {formatRoomCapacity(room)} · {room.location}
                </p>
                <p className="pt-2 text-xs text-slate-600 leading-relaxed">
                  {room.amenities.join(' · ')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white px-6 py-4 text-center text-xs text-slate-500">
        Textile 308 · Office Meeting Room Availability Monitor
      </footer>
    </div>
  );
}
