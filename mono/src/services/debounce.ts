export type DebouncedFunction<Args extends unknown[], Result> = {
  (...args: Args): void;
  cancel(): void;
  flush(): Result | undefined;
};

export const debounce = <Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
  delay: number,
): DebouncedFunction<Args, Result> => {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Args | null = null;

  const debounced = (...args: Args) => {
    if (timeout) clearTimeout(timeout);
    pendingArgs = args;
    timeout = setTimeout(() => {
      timeout = null;
      const argsToUse = pendingArgs;
      pendingArgs = null;
      if (argsToUse) callback(...argsToUse);
    }, delay);
  };

  debounced.cancel = () => {
    if (timeout) clearTimeout(timeout);
    timeout = null;
    pendingArgs = null;
  };

  debounced.flush = () => {
    if (!pendingArgs) return undefined;
    if (timeout) clearTimeout(timeout);
    timeout = null;
    const argsToUse = pendingArgs;
    pendingArgs = null;
    return callback(...argsToUse);
  };

  return debounced;
};
