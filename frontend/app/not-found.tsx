import Link from "next/link";
import { Button } from "~/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <span className="eyebrow">404 · Page not found</span>
      <h1 className="font-display text-5xl tracking-tight md:text-7xl">Off the beaten path</h1>
      <p className="max-w-md text-pretty text-muted-foreground">
        The page you were looking for doesn’t exist — or maybe never did. Head back to the overview
        to keep an eye on the proxy.
      </p>
      <Button asChild>
        <Link href="/">Return home</Link>
      </Button>
    </div>
  );
}
