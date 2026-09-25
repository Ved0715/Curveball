"use client";

import { AppShell } from "@/components/header";
import { AuthProvider } from "@/lib/auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppShell>
        <main id="main" className="pb-24 lg:pb-10">
          {children}
        </main>
      </AppShell>
    </AuthProvider>
  );
}
