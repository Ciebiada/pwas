// biome-ignore lint/suspicious/noExplicitAny: generic debounce needs any[] for parameter preservation
export const debounce = <T extends (...args: any[]) => void>(callback: T, delay: number) => {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      callback(...args);
    }, delay);
  };
};
