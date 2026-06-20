import { createSignal } from "solid-js";

// Shared between the persistent app-level SearchBar (writes) and NotesList
// (reads, to filter its query). The bar lives outside the routed pages as a
// single instance that never remounts, so the page view transition morphs
// (slides) it via its view-transition-name. The header reaches a similar morph
// by reusing its name across per-page remounts; for this element a remount
// leaves a stale WebKit snapshot that makes the transition fire only once, so it
// is hoisted to the root instead.
export const [searchQuery, setSearchQuery] = createSignal("");
