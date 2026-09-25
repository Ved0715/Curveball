import { SiteHeader } from "@/components/header";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      <main id="main">{children}</main>
    </>
  );
}
