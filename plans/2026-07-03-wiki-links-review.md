# Wiki Links Review

Date: 2026-07-03
Description: Style and simplicity review of the wiki-link follow-up changes (uncommitted) and the `Add note links` commit (2a8630b).

## Uncommitted changes — mostly clean

The diff is small and focused: blur closes the menu, `insertWikiLink` skips the cursor-scroll so it doesn't fight menu positioning, and the menu scrolls the selected item into view. All reasonable.

Type error (surfaced via LSP):

- **`Editor.tsx:203`** - `refreshWikiCompletionHandle = wikiCompletion.refresh` fails typecheck. `refresh` is `(selection: EditorSelection) => Promise<void>` but the stub at `Editor.tsx:91` is typed `(_selection?: EditorSelection) => void`. Tighten the stub signature to match (drop the `?`, or make `refresh` accept `undefined`).

Nits:

- **`Editor.tsx:194`** — `inputType !== "insertWikiLink"` leans on a magic string that's also emitted at `useWikiLinkCompletion.tsx:162`. Worth a shared constant (or a boolean param like `applyEdit(content, selection, { scroll?: boolean })`), since `inputType` is already loosely typed as `string`.
- **`WikiLinkCompletionMenu.css`** — `z-index: 4 -> 1001` is a big jump. Confirm it sits above whatever modal/overlay layer the app uses (the line-reorder handle and action modal likely live in the 1000-ish range). If the menu should overlay the modal, fine; if not, this may over-reach.
- **`WikiLinkCompletionMenu.tsx:20`** — `querySelector(\`button:nth-child(${index + 1})\`)` works only because buttons are the sole direct children. Fragile to a future `<ul>` wrap. Storing button refs in an array via the `<For>` index would be more robust, but `nth-child` is fine for now - just flagging.
- The double ref (`menuRef` locally + `props.setRef` in the parent) is slightly redundant since both point at the same node. Acceptable - keeps the effect local to the menu.

## The "Add note links" commit (2a8630b)

This is a 16-file / ~900-line commit that bundles several distinct concerns: the wiki-link feature, note-name dedup, a `solid-dexie` refactor, a nav-transition tweak, a Dropbox unwrap, and two schema bumps. Most of the non-feature pieces are defensible, but a few things stand out.

### Likely dead / accidental

- **`db.ts:105`** - `db.version(11)` defines the exact same stores as `db.version(10)` (`"++id, lastModified"`), with no upgrade hook and no comment. It's a no-op bump. Either the body was lost or it should be deleted.
- **`useWikiLinkCompletion.tsx:23,120`** - `WikiCompletionPosition.direction` is computed, stored, and rendered as `data-direction` on the menu div, but no CSS or JS consumes `[data-direction=...]`. Dead data unless reserved for future styling.

### Possible bugs / regressions

- **`useWikiLinkCompletion.tsx:131`** - `nextOptions.some((o) => o.title === query)` is case- and whitespace-sensitive. If a note "Foo" exists and the user types `[[foo`, the menu still offers "Create foo". `normalizeNoteName` already exists - the suppress-create check should use it.
- **`sync.ts:392`** - `notesByFilename` matching was removed, so a remote rename (same name, new id) is now imported as a new note rather than matched to the local one. Combined with `allocateUniqueNoteName`, cloud renames will silently produce "Foo 2" locally and orphan the original. If intended, fine; if not, it's a regression for anyone who renames files in Dropbox/Drive.
- **`cursor.ts:140`** - the trailing-delimiter caret fix applies to every inline format (links, code, wiki), not just wiki links. Probably the intent, but worth confirming it doesn't regress caret placement after code spans / links.

### UX consideration

- **`EditNote.tsx` (`handleNoteChange`)** - when the typed title collides, `editorApi?.replaceContent(nextName, ...)` silently rewrites the title line while the user is typing in it. For someone typing "Foo" that happens to exist, their input morphs to "Foo 2" mid-keystroke. Could feel jarring; consider only deduping on blur / sync rather than on every change.

### Simplicity nits

- **`noteNames.ts:12`** - `getNumberedParts` captures the number then discards it (returns only `{ base }`). Rename to `getNumberedBase`, or actually use the digit.
- **`noteNames.ts:6`** - `normalizeNameForComparison = normalizeNoteName` is a pure alias; the indirection adds nothing.
- **`renderer.tsx` (`WikiLink`)** - `style={{ cursor: "pointer" }}` on an `<a href>` is redundant (default UA style). Also the `handlers` object is recreated each render in `Editor.tsx:411`, so `createMemo` on `href` re-runs more than necessary - minor.
- **`useNavigate.ts`** - three repetitive `.catch(ignoreSkippedTransition)` calls; a small `[ready, updateCallbackDone, finished].forEach(p => p.catch(...))` would be tidier, but style only.

### Note

The `solid-dexie.ts` rewrite from `createMemo(() => from(liveQuery(querier)))` to `createEffect(on(querier, ...))` is necessary now that `noteId` is reactive (`createMemo(() => parseInt(params.id))`) - the old version wouldn't re-run the query on route param changes. Good fix, just deserves its own commit since it's a semantic change to a shared primitive.

## Overall

The uncommitted follow-up is tight. The wiki-links commit itself is functionally sound but mixes too many concerns and ships at least one no-op schema bump and an unused `direction` field. Split the dedup/sync/dexie/nav pieces out and drop `db.version(11)`.
