"use client";

import { CommandPalette } from "@/components/command";
import { AppShell } from "@/components/header";
import { ToastProvider } from "@/components/toast";
import { AuthProvider } from "@/lib/auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <CommandPalette>
          <AppShell>
            <main id="main" className="pb-24 lg:pb-10">
              {children}
            </main>
          </AppShell>
        </CommandPalette>
      </ToastProvider>
    </AuthProvider>
  );
}
