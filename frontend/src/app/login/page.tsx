"use client";

import { AscendKitAuthCard } from "@ascendkit/nextjs";

function CedarLogo({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Glow effect */}
      <defs>
        <radialGradient id="glow" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor="#818cf8" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="tree" x1="32" y1="8" x2="32" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a5b4fc" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
        <linearGradient id="trunk" x1="32" y1="48" x2="32" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7c6f5b" />
          <stop offset="100%" stopColor="#5c503e" />
        </linearGradient>
      </defs>
      {/* Background glow */}
      <circle cx="32" cy="32" r="30" fill="url(#glow)" />
      {/* Cedar tree — layered triangles */}
      <polygon points="32,8 22,24 42,24" fill="url(#tree)" opacity="0.9" />
      <polygon points="32,16 19,34 45,34" fill="url(#tree)" opacity="0.85" />
      <polygon points="32,24 16,44 48,44" fill="url(#tree)" opacity="0.8" />
      {/* Trunk */}
      <rect x="29" y="44" width="6" height="12" rx="1.5" fill="url(#trunk)" />
      {/* Snow/highlight accents */}
      <circle cx="32" cy="12" r="1.5" fill="#e0e7ff" opacity="0.7" />
      <circle cx="27" cy="22" r="1" fill="#e0e7ff" opacity="0.5" />
      <circle cx="37" cy="20" r="1" fill="#e0e7ff" opacity="0.4" />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <div className="auth-page min-h-screen flex flex-col items-center justify-center bg-[var(--background)]">
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-20 h-20 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/10">
          <CedarLogo size={56} />
        </div>
        <h1 className="text-3xl font-bold text-[var(--foreground)] tracking-tight">
          CedarBot
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          AI Chat with Sondera Harness &middot; Cedar Policy Guardrails
        </p>
      </div>
      <AscendKitAuthCard view="SIGN_IN" redirectTo="/" callbackURL="/" />
    </div>
  );
}
