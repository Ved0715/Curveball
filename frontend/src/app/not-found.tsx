import Link from "next/link";
import { Oops, primaryLink } from "@/components/oops";

export default function NotFound() {
  return (
    <main id="main">
      <Oops
        code="404"
        title="Nothing on this page"
        body="The link may be old, or the page moved. Your curve is still where you left it."
        action={
          <Link href="/" className={primaryLink}>
            Take me home
          </Link>
        }
      />
    </main>
  );
}
