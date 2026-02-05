import { liveQuery, type PromiseExtended } from "dexie";
import { type Accessor, createEffect, createMemo, createSignal, from, on, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

type ReconcileOptions = Parameters<typeof reconcile>[1];

type NotArray<T> = T extends unknown[] ? never : T;

export function createDexieSignalQuery<T>(
  querier: () => NotArray<T> | PromiseExtended<NotArray<T>>,
): Accessor<T | undefined> {
  const get = createMemo(() => from<T>(liveQuery(querier)));
  return () => get()();
}

export function createDexieArrayQuery<T>(
  querier: () => T[] | Promise<T[]>,
  options?: ReconcileOptions,
): { data: T[]; loaded: Accessor<boolean> } {
  const [store, setStore] = createStore<T[]>([]);
  const [loaded, setLoaded] = createSignal(false);

  createEffect(
    on(querier, () => {
      const producer = liveQuery(querier);
      const unsub = producer.subscribe((v) => {
        setStore(reconcile(v, options ?? { key: "id" }));
        setLoaded(true);
      });
      onCleanup(() => unsub.unsubscribe());
    }),
  );

  return { data: store, loaded };
}
