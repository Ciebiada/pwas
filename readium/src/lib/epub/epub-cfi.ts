/**
 * Simplified CFI (Canonical Fragment Identifier) implementation
 * Handles basic location tracking for EPUB reading progress
 */

export type CFI = string;

export class CFIHelper {
  /**
   * Generate a simplified CFI from a spine index and character offset
   * Format: epubcfi(/6/[spineIndex]!/4/[paragraphIndex]/[characterOffset])
   */
  static generate(
    spineIndex: number,
    element: Element | null,
    root: Element,
    offset: number = 0,
  ): CFI {
    if (!element || !root) {
      return `epubcfi(/6/${(spineIndex + 1) * 2}!/0)`;
    }

    const path = this.getElementPath(element, root);
    return `epubcfi(/6/${(spineIndex + 1) * 2}!${path}/${offset})`;
  }

  /**
   * Parse a CFI to extract spine index and location info
   */
  static parse(
    cfi: CFI,
  ): { spineIndex: number; path: string; offset: number } | null {
    if (!cfi || !cfi.startsWith("epubcfi(")) return null;

    try {
      const inner = cfi.slice(8, -1);
      const parts = inner.split("!");

      if (parts.length < 2) return null;

      const spinePart = parts[0];
      const spineMatch = spinePart.match(/\/6\/(\d+)/);
      const spineIndex = spineMatch
        ? Math.floor(parseInt(spineMatch[1]) / 2) - 1
        : 0;

      const locationPart = parts[1];
      const lastSlash = locationPart.lastIndexOf("/");
      const path =
        lastSlash > 0 ? locationPart.slice(0, lastSlash) : locationPart;
      const offset =
        lastSlash > 0 ? parseInt(locationPart.slice(lastSlash + 1)) || 0 : 0;

      return { spineIndex, path, offset };
    } catch (e) {
      console.error("[CFI] Parse error:", e);
      return null;
    }
  }

  /**
   * Get the path to an element relative to a root
   */
  private static getElementPath(element: Element, root: Element): string {
    const path: number[] = [];
    let current: Element | null = element;

    while (current && current.parentElement && current !== root) {
      const parent: HTMLElement | null = current.parentElement;
      const children = Array.from(parent.children);
      const index = children.indexOf(current);

      if (index >= 0) {
        path.unshift((index + 1) * 2);
      }

      current = parent;
    }

    return "/" + path.join("/");
  }

  /**
   * Navigate to an element using a path
   */
  static getElementByPath(root: Element, path: string): Element | null {
    if (!path || path === "/0") return null;

    const steps = path
      .split("/")
      .filter((s) => s)
      .map((s) => parseInt(s));
    let current: Element = root;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const index = Math.floor(step / 2) - 1;
      const children = Array.from(current.children);

      if (index < 0 || index >= children.length) {
        return current;
      }

      current = children[index];
    }

    return current;
  }
}
