import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncActionOptions = {
  /**
   * Minimum interval (ms) between accepted invocations. Re-clicks within this
   * window are silently ignored. Default 600ms covers typical double-click
   * windows without feeling sluggish.
   */
  throttleMs?: number;
};

export type AsyncActionResult<TArgs extends unknown[], TReturn> = {
  /**
   * Call the underlying async function. Re-entrant calls while the previous
   * invocation is pending — or within the throttle window — are dropped.
   * Returns the resolved value, or `undefined` if the call was throttled.
   */
  run: (...args: TArgs) => Promise<TReturn | undefined>;
  /** True while an invocation is in-flight. */
  isPending: boolean;
};

/**
 * Wrap an async (or sync) callback so that:
 *  - Concurrent invocations are dropped (no double-submit).
 *  - Re-clicks inside the throttle window are dropped.
 *  - The component unmounting is handled safely.
 *  - Callers can render a spinner / disabled state via `isPending`.
 *
 * Use this for any user action that triggers a network request or DB write.
 */
export function useAsyncAction<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn> | TReturn,
  options: AsyncActionOptions = {},
): AsyncActionResult<TArgs, TReturn> {
  const { throttleMs = 600 } = options;
  const [isPending, setIsPending] = useState(false);
  const fnRef = useRef(fn);
  const lastInvocationRef = useRef(0);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: TArgs): Promise<TReturn | undefined> => {
      const now = Date.now();
      if (inFlightRef.current) {
        return undefined;
      }
      if (now - lastInvocationRef.current < throttleMs) {
        return undefined;
      }
      lastInvocationRef.current = now;
      inFlightRef.current = true;
      if (mountedRef.current) {
        setIsPending(true);
      }
      try {
        const result = await fnRef.current(...args);
        return result;
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) {
          setIsPending(false);
        }
      }
    },
    [throttleMs],
  );

  return { run, isPending };
}
