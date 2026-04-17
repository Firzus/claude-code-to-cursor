import {
  Children,
  cloneElement,
  forwardRef,
  type HTMLAttributes,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "~/lib/utils";

type AnyProps = HTMLAttributes<HTMLElement> & {
  className?: string;
  children?: ReactNode;
  "data-slottable"?: boolean | string;
};

/**
 * Radix-style `Slot` — lets a parent component forward its props, className,
 * and siblings onto a single React child (marked with `data-slottable="true"`)
 * so that e.g. a `<Link>` can inherit button styles + icon slots without
 * double-nesting.
 *
 * Strategy: scan immediate children for the one with `data-slottable="true"`.
 * That marked element is treated as a shell whose single child is the real
 * slottable element (e.g. `<Link>`). All other siblings (leading icon,
 * trailing arrow) are preserved around the slottable's original content.
 *
 * Usage from the parent:
 *   <Slot {...props} className="..."><IconLeft/><span data-slottable>{children}</span><IconRight/></Slot>
 * where `children` is a single element (e.g. `<Link>`). The rendered tree is:
 *   <Link class="...">{IconLeft}{originalLinkChildren}{IconRight}</Link>
 */
export const Slot = forwardRef<HTMLElement, AnyProps>(
  ({ children, className, style, ...rest }, ref) => {
    const array = Children.toArray(children);
    const slottableIdx = array.findIndex(
      (c) =>
        isValidElement(c) && (c as ReactElement<AnyProps>).props["data-slottable"] !== undefined,
    );

    if (slottableIdx === -1) {
      // No explicit slot marker — fall back to cloning the first valid child.
      const first = array.find(isValidElement) as ReactElement<AnyProps> | undefined;
      if (!first) return null;
      const firstProps = (first.props ?? {}) as AnyProps;
      return cloneElement(first, {
        ...rest,
        ...firstProps,
        ref,
        className: cn(className, firstProps.className),
        style: { ...(style ?? {}), ...(firstProps.style ?? {}) },
      } as AnyProps & { ref: typeof ref });
    }

    const shell = array[slottableIdx] as ReactElement<AnyProps>;
    const shellProps = (shell.props ?? {}) as AnyProps;
    const slottableChild = Children.toArray(shellProps.children).find(isValidElement) as
      | ReactElement<AnyProps>
      | undefined;

    if (!slottableChild) {
      // Marker span has no valid element child — use the shell itself as root.
      return cloneElement(shell, {
        ...rest,
        ...shellProps,
        ref,
        className: cn(className, shellProps.className),
        style: { ...(style ?? {}), ...(shellProps.style ?? {}) },
      } as AnyProps & { ref: typeof ref });
    }

    // Build the new child tree: siblings before the marker, the slottable's
    // own content, then siblings after the marker.
    const siblingsBefore = array.slice(0, slottableIdx);
    const siblingsAfter = array.slice(slottableIdx + 1);
    const slottableContent = (slottableChild.props as AnyProps).children;

    const slottableChildProps = (slottableChild.props ?? {}) as AnyProps;
    return cloneElement(slottableChild, {
      ...rest,
      ...slottableChildProps,
      ref,
      className: cn(className, slottableChildProps.className),
      style: { ...(style ?? {}), ...(slottableChildProps.style ?? {}) },
      children: [...siblingsBefore, slottableContent, ...siblingsAfter],
    } as AnyProps & { ref: typeof ref });
  },
);
Slot.displayName = "Slot";
