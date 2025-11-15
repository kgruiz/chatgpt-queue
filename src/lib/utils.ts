export const makeId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface CancelableFunction {
  cancel(): void;
}

export const debounce = <T extends (...args: unknown[]) => void>(
  fn: T,
  waitMs: number,
): T & CancelableFunction => {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  }) as T & CancelableFunction;

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
};

export const throttle = <T extends (...args: unknown[]) => void>(
  fn: T,
  waitMs: number,
): T & CancelableFunction => {
  let lastInvoke = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Parameters<T> | null = null;

  const invoke = () => {
    lastInvoke = Date.now();
    timer = null;
    if (pendingArgs) {
      fn(...pendingArgs);
      pendingArgs = null;
    }
  };

  const throttled = ((...args: Parameters<T>) => {
    pendingArgs = args;
    const remaining = waitMs - (Date.now() - lastInvoke);
    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      invoke();
      return;
    }
    if (!timer) {
      timer = setTimeout(invoke, remaining);
    }
  }) as T & CancelableFunction;

  throttled.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pendingArgs = null;
  };

  return throttled;
};
