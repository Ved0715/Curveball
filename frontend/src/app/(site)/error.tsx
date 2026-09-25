"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/oops";

export default function SiteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return <ErrorScreen error={error} retry={retry} home="/" />;
}
