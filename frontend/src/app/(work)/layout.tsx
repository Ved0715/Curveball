"use client";

import { ToastProvider } from "@/components/toast";
import { WorkShell } from "@/components/work/shell";
import { AuthProvider } from "@/lib/auth";

export default function WorkLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <WorkShell>{children}</WorkShell>
      </ToastProvider>
    </AuthProvider>
  );
}
