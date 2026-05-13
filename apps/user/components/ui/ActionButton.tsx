"use client";

import React, {
  ButtonHTMLAttributes,
  forwardRef,
  MouseEvent,
  useCallback,
} from "react";
import { LoadingSpinnerIcon } from "@/components/admin/ui/AdminLoadingSpinner";
import { useAsyncAction } from "@/hooks/useAsyncAction";

export type ActionButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick"
> & {
  /**
   * Click handler. May return a promise; while the promise is pending the
   * button is disabled and a small spinner is shown. Re-clicks while pending
   * (or within the throttle window) are dropped.
   */
  onClick?: (
    event: MouseEvent<HTMLButtonElement>,
  ) => void | Promise<void> | unknown;
  /** Throttle window in ms. Defaults to 600ms. */
  throttleMs?: number;
  /** Render the inline spinner while pending. Default true. */
  showSpinner?: boolean;
  /** Tailwind classes for the spinner element. */
  spinnerClassName?: string;
  /**
   * Whether the spinner should replace the children while pending. By default
   * the spinner is rendered alongside the children (children remain visible
   * with the disabled style).
   */
  spinnerReplacesChildren?: boolean;
};

/**
 * Drop-in replacement for `<button>` that:
 *  - Prevents double-submission via throttle + in-flight tracking.
 *  - Auto-tracks `isPending` if `onClick` returns a promise.
 *  - Auto-disables and shows the existing `LoadingSpinnerIcon` while pending.
 *
 * Use anywhere a click triggers a network/DB write, modal submit, etc.
 */
export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(
  function ActionButton(
    {
      onClick,
      disabled,
      throttleMs = 600,
      showSpinner = true,
      spinnerClassName,
      spinnerReplacesChildren = false,
      children,
      type = "button",
      className,
      ...rest
    },
    ref,
  ) {
    const handler = useCallback(
      async (event: MouseEvent<HTMLButtonElement>) => {
        if (!onClick) return;
        const result = onClick(event);
        if (result && typeof (result as { then?: unknown }).then === "function") {
          await result;
        }
      },
      [onClick],
    );

    const { run, isPending } = useAsyncAction(handler, { throttleMs });

    const onButtonClick = useCallback(
      (event: MouseEvent<HTMLButtonElement>) => {
        if (disabled || isPending) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        void run(event);
      },
      [disabled, isPending, run],
    );

    const spinner =
      showSpinner && isPending ? (
        <LoadingSpinnerIcon
          className={
            spinnerClassName ||
            "h-4 w-4 border-2 border-current/30 border-t-current"
          }
        />
      ) : null;

    return (
      <button
        ref={ref}
        type={type}
        {...rest}
        onClick={onButtonClick}
        disabled={disabled || isPending}
        aria-busy={isPending || undefined}
        className={className}
      >
        {spinnerReplacesChildren && spinner ? (
          <span className="inline-flex items-center justify-center gap-2">
            {spinner}
          </span>
        ) : (
          <span className="inline-flex items-center justify-center gap-2">
            {spinner}
            {children}
          </span>
        )}
      </button>
    );
  },
);
