import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AuroraShader } from "~/components/layout/aurora-shader";
import { Button } from "~/components/ui/button";

export default function NotFound() {
  return (
    <div className="relative flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <AuroraShader className="-top-24 h-[36rem]" intensity={0.55} />
      <span className="eyebrow">404 · Page not found</span>
      <h1 className="font-display text-5xl tracking-tight md:text-7xl text-balance max-w-2xl">
        Off the beaten path
      </h1>
      <p className="max-w-md text-pretty text-muted-foreground">
        The page you were looking for doesn&apos;t exist — or maybe never did. Head back to the overview
        to keep an eye on the proxy.
      </p>
      <Button asChild>
        <Link href="/">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Return home
        </Link>
      </Button>
    </div>
  );
}
