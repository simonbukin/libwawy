"use client";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const handleGoogleSignIn = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Decorative book spines */}
      <div className="absolute left-6 top-1/4 flex gap-2 -rotate-6 opacity-30">
        <div className="w-4 h-32 rounded-sm bg-lavender" />
        <div className="w-5 h-28 rounded-sm bg-peach" />
        <div className="w-3 h-36 rounded-sm bg-mint" />
        <div className="w-4 h-24 rounded-sm bg-pink" />
        <div className="w-3 h-30 rounded-sm bg-lavender" />
      </div>
      <div className="absolute right-6 bottom-1/4 flex gap-2 rotate-6 opacity-30">
        <div className="w-5 h-28 rounded-sm bg-pink" />
        <div className="w-3 h-34 rounded-sm bg-mint" />
        <div className="w-4 h-26 rounded-sm bg-peach" />
        <div className="w-5 h-32 rounded-sm bg-lavender" />
      </div>

      {/* Decorative circles */}
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-lavender opacity-10" />
      <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-peach opacity-10" />
      <div className="absolute top-1/3 right-1/4 w-24 h-24 rounded-full bg-mint opacity-10" />

      {/* Login card */}
      <div className="bg-card rounded-3xl shadow-sm border border-border p-10 w-full max-w-sm text-center relative z-10">
        {/* Book icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-2xl bg-lavender/15 flex items-center justify-center">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#B8A9D4"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
              <path d="M8 7h6" />
              <path d="M8 11h4" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h1
          className="text-4xl font-bold tracking-tight mb-2"
          style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
        >
          libwawy
        </h1>
        <p className="text-muted text-sm mb-8">
          your cozy shared bookshelf
        </p>

        {/* Sign in button */}
        <button
          onClick={handleGoogleSignIn}
          className="w-full flex items-center justify-center gap-3 bg-lavender hover:bg-lavender-hover active:bg-lavender-dark text-white font-medium py-3.5 px-6 rounded-full transition-all duration-200 hover:shadow-md active:scale-[0.98]"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
              fill="#fff"
              fillOpacity="0.8"
            />
            <path
              d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.26c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
              fill="#fff"
              fillOpacity="0.9"
            />
            <path
              d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
              fill="#fff"
              fillOpacity="0.7"
            />
            <path
              d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
              fill="#fff"
            />
          </svg>
          Sign in with Google
        </button>

        {/* Subtle bottom decoration */}
        <div className="flex justify-center gap-1.5 mt-8">
          <div className="w-2 h-2 rounded-full bg-lavender opacity-40" />
          <div className="w-2 h-2 rounded-full bg-mint opacity-40" />
          <div className="w-2 h-2 rounded-full bg-peach opacity-40" />
          <div className="w-2 h-2 rounded-full bg-pink opacity-40" />
        </div>
      </div>
    </div>
  );
}
