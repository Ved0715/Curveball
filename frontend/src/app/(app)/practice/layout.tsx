import { PracticeSteps } from "@/components/header";

export default function PracticeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PracticeSteps />
      {children}
    </>
  );
}
