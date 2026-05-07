import type { ReactNode } from "react";
import { Reveal } from "~/components/motion/reveal";
import { cn } from "~/lib/cn";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <Reveal as="header" className={cn("mb-10 flex flex-col gap-6 md:mb-14", className)}>
      {eyebrow ? (
        <span className="eyebrow inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-px w-6 bg-foreground/30" />
          {eyebrow}
        </span>
      ) : null}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl space-y-3">
          <h1 className="font-display text-4xl leading-[1.05] tracking-tight text-balance md:text-6xl">
            {title}
          </h1>
          {description ? (
            <p className="text-pretty text-base text-muted-foreground md:text-lg md:leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </Reveal>
  );
}
