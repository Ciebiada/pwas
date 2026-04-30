import { db } from "../../db";
import type { EpubRenderer, PaginationIndexSnapshot } from "./epub-renderer";

const MAX_MAPS_PER_BOOK = 12;

type PaginationMapCacheOptions = {
  getBookId: () => number;
  getRenderer: () => EpubRenderer | undefined;
  onReady: () => void;
};

export class PaginationMapCache {
  private idleHandle: number | null = null;
  private refreshToken = 0;
  private disposed = false;

  constructor(private options: PaginationMapCacheOptions) {}

  schedule(immediate: boolean = false) {
    if (this.disposed || !this.options.getRenderer()) return;

    this.refreshToken += 1;
    const token = this.refreshToken;
    this.cancelScheduledRefresh();

    if (immediate) {
      void this.refresh(token);
      return;
    }

    const run = () => {
      this.idleHandle = null;
      void this.refresh(token);
    };

    const requestIdle = (
      globalThis as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      }
    ).requestIdleCallback;

    if (typeof requestIdle === "function") {
      this.idleHandle = requestIdle(run, { timeout: 1200 });
    } else {
      this.idleHandle = window.setTimeout(run, 300);
    }
  }

  async save(snapshot: PaginationIndexSnapshot) {
    const renderer = this.options.getRenderer();
    if (!renderer || this.disposed) return;

    this.options.onReady();

    const bookId = this.options.getBookId();
    const layoutSignature = renderer.getPaginationMapSignature();

    try {
      await db.paginationMaps.put({
        key: this.getKey(bookId, layoutSignature),
        bookId,
        layoutSignature,
        totalPages: snapshot.totalPages,
        units: snapshot.units,
        updatedAt: Date.now(),
      });
      await this.prune(bookId);
    } catch (error) {
      console.warn("[Reader] Failed to save pagination map", error);
    }
  }

  dispose() {
    this.disposed = true;
    this.refreshToken += 1;
    this.cancelScheduledRefresh();
  }

  private async refresh(token: number) {
    const renderer = this.options.getRenderer();
    if (!renderer || this.disposed) return;

    const bookId = this.options.getBookId();
    const layoutSignature = renderer.getPaginationMapSignature();

    try {
      const cached = await db.paginationMaps.get(this.getKey(bookId, layoutSignature));
      if (this.disposed || this.options.getRenderer() !== renderer || token !== this.refreshToken) return;

      if (layoutSignature !== renderer.getPaginationMapSignature()) {
        this.schedule();
        return;
      }

      if (cached?.layoutSignature === layoutSignature) {
        const restored = renderer.restoreExactPaginationIndex({
          totalPages: cached.totalPages,
          units: cached.units,
        });

        if (restored) {
          this.options.onReady();
          return;
        }
      }
    } catch (error) {
      console.warn("[Reader] Failed to load pagination map", error);
    }

    try {
      await renderer.ensureExactPaginationIndexBackground();
    } catch (error) {
      console.warn("[Reader] Failed to build pagination map", error);
    }
  }

  private async prune(bookId: number) {
    const records = await db.paginationMaps.where("bookId").equals(bookId).toArray();
    const staleKeys = records
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(MAX_MAPS_PER_BOOK)
      .map((record) => record.key);

    if (staleKeys.length > 0) {
      await db.paginationMaps.bulkDelete(staleKeys);
    }
  }

  private cancelScheduledRefresh() {
    if (this.idleHandle === null) return;

    const cancelIdle = (
      globalThis as unknown as {
        cancelIdleCallback?: (id: number) => void;
      }
    ).cancelIdleCallback;

    if (typeof cancelIdle === "function") {
      cancelIdle(this.idleHandle);
    } else {
      clearTimeout(this.idleHandle);
    }

    this.idleHandle = null;
  }

  private getKey(bookId: number, layoutSignature: string) {
    return `${bookId}:${layoutSignature}`;
  }
}
