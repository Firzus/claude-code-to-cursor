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
    <Reveal as="header" className={cn("mb-12 flex flex-col gap-7 md:mb-16", className)}>
      {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl space-y-4">
          <h1 className="font-display text-balance text-4xl leading-[1.02] md:text-6xl">{title}</h1>
          {description ? (
            <p className="max-w-2xl text-pretty text-base text-muted-foreground md:text-[17px] md:leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </Reveal>
  );
}
