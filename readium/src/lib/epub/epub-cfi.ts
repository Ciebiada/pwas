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
  static generate(spineIndex: number, element: Element | null, root: Element, offset: number = 0): CFI {
    if (!element || !root) {
      return `epubcfi(/6/${(spineIndex + 1) * 2}!/0)`;
    }

    const path = CFIHelper.getElementPath(element, root);
    return `epubcfi(/6/${(spineIndex + 1) * 2}!${path}/${offset})`;
  }

  /**
   * Parse a CFI to extract spine index and location info
   */
  static parse(cfi: CFI): { spineIndex: number; path: string; offset: number } | null {
    if (!cfi || !cfi.startsWith("epubcfi(")) return null;

    try {
      const inner = cfi.slice(8, -1);
      const parts = inner.split("!");

      if (parts.length < 2) return null;

      const spinePart = parts[0];
      const spineMatch = spinePart.match(/\/6\/(\d+)/);
      const spineIndex = spineMatch ? Math.floor(parseInt(spineMatch[1]) / 2) - 1 : 0;

      const locationPart = parts[1];
      const lastSlash = locationPart.lastIndexOf("/");
      const path = lastSlash > 0 ? locationPart.slice(0, lastSlash) : locationPart;
      const offset = lastSlash > 0 ? parseInt(locationPart.slice(lastSlash + 1)) || 0 : 0;

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

  static locateTextPosition(root: HTMLElement, absoluteOffset: number): { node: Text; offset: number } | null {
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let currentOffset = 0;
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const text = n as Text;
        const len = text.length ?? (text.textContent?.length || 0);
        if (currentOffset + len >= absoluteOffset) {
          return {
            node: text,
            offset: Math.max(0, absoluteOffset - currentOffset),
          };
        }
        currentOffset += len;
      }
    } catch {
      // ignore
    }
    return null;
  }

  static getTargetCharClientRect(element: Element, offset: number): DOMRect | null {
    const startOffset = Math.max(0, offset || 0);
    const maxLookahead = 64;

    const startPos = CFIHelper.locateTextPosition(element as HTMLElement, startOffset);
    if (!startPos) return element.getBoundingClientRect();

    try {
      const range = document.createRange();

      let node: Text | null = startPos.node;
      let localOffset = startPos.offset;
      let remaining = maxLookahead;

      while (node && remaining >= 0) {
        const nodeLen = node.length ?? (node.textContent?.length || 0);
        while (localOffset < nodeLen && remaining >= 0) {
          // Try a 1-character range; if it yields no rects, advance.
          const end = Math.min(nodeLen, localOffset + 1);
          range.setStart(node, localOffset);
          range.setEnd(node, end);
          const rects = range.getClientRects();
          if (rects && rects.length > 0) {
            return rects[0] as DOMRect;
          }
          localOffset += 1;
          remaining -= 1;
        }

        // Move to next text node
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        // Advance walker to current node, then move to next.
        let cur: Node | null;
        let found = false;
        while ((cur = walker.nextNode())) {
          if (cur === node) {
            found = true;
            break;
          }
        }
        node = found ? (walker.nextNode() as Text | null) : null;
        localOffset = 0;
      }

      // As a last resort, use the element’s first client rect (more stable than bounding box)
      const elRects = element.getClientRects();
      if (elRects && elRects.length > 0) return elRects[0] as DOMRect;
      return element.getBoundingClientRect();
    } catch {
      return element.getBoundingClientRect();
    }
  }
}
