import { useEffect, useState, type DependencyList } from 'react';

/** Minimal async loader: undefined while loading. Enough until the app needs a data-fetching library. */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    let live = true;
    setValue(undefined);
    fn().then((v) => live && setValue(v));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
