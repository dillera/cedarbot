"use client";

import { useAscendKitContext } from "@ascendkit/nextjs";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Loader2, TreePine } from "lucide-react";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { authClient } = useAscendKitContext();
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const pathname = usePathname();

  // Allow the login page and auth API routes through without auth
  const isPublicRoute = pathname === "/login" || pathname.startsWith("/api/auth");

  const isAuthenticated = !!session?.user;

  useEffect(() => {
    if (!isPending && !isAuthenticated && !isPublicRoute) {
      router.replace("/login");
    }
  }, [isPending, isAuthenticated, isPublicRoute, router]);

  // Public routes render immediately
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Show loading spinner while session resolves
  if (isPending) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--background)]">
        <div className="w-12 h-12 rounded-xl bg-indigo-600/20 flex items-center justify-center mb-4">
          <TreePine size={28} className="text-indigo-400" />
        </div>
        <Loader2 size={24} className="text-indigo-400 animate-spin" />
      </div>
    );
  }

  // Not authenticated — redirect is happening, show nothing
  if (!isAuthenticated) {
    return null;
  }

  // Authenticated — render the app
  return <>{children}</>;
}
