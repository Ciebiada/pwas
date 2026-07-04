import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Header, HeaderButton } from "ui/Header";
import { triggerHaptic } from "ui/haptic";
import { AddIcon, ChevronRightIcon, MoreIcon } from "ui/Icons";
import { Page } from "ui/Page";
import { useActivatable } from "ui/useActivatable";
import { NoteActionsModal, type NoteActionsModalAPI } from "../components/NoteActionsModal";
import { SettingsModal } from "../components/SettingsModal";
import { useNavigate } from "../hooks/useNavigate";
import { useNotesListKeyboardNav } from "../hooks/useNotesListKeyboardNav";
import { timeFromNow } from "../services/date";
import { db } from "../services/db";
import { searchMatches } from "../services/search";
import { searchBarActive, searchQuery } from "../services/searchStore";
import { createDexieArrayQuery, createDexieSignalQuery } from "../services/solid-dexie";
import { importing, sync } from "../services/sync";
import "./NotesList.css";

const PAGE_SIZE = 30;

export const NotesList = () => {
  const navigate = useNavigate();
  const [settingsModalOpen, setSettingsModalOpen] = createSignal(false);
  const [noteActionsOpen, setNoteActionsOpen] = createSignal(false);
  const [selectedNoteId, setSelectedNoteId] = createSignal<number | null>(null);
  const [limit, setLimit] = createSignal(PAGE_SIZE);
  let noteActionsModalApi: NoteActionsModalAPI | undefined;

  const notes = createDexieArrayQuery(async () => {
    const q = searchQuery().trim();
    const base = db.notes
      .orderBy("lastOpened")
      .reverse()
      .filter((n) => n.status !== "pending-delete");

    if (q) {
      return base
        .filter((n) => searchMatches(`${n.name} ${n.content}`, q))
        .limit(limit())
        .toArray();
    }

    return base.limit(limit()).toArray();
  });

  const totalCount = createDexieSignalQuery(() => db.notes.filter((n) => n.status !== "pending-delete").count());

  const openNoteActions = (noteId: number) => {
    setSelectedNoteId(noteId);
    noteActionsModalApi?.focusSearchOnOpen();
    setNoteActionsOpen(true);
  };

  const createNoteFromSearch = () => navigate(`/new?name=${encodeURIComponent(searchQuery().trim())}`);

  const { selectedId: keyboardSelectedId, createSelected } = useNotesListKeyboardNav(
    () => notes.data,
    () => notes.loaded() && !!searchQuery().trim(),
    searchBarActive,
    (note) => navigate(`/note/${note.id}?from=list`),
    (note) => openNoteActions(note.id),
    createNoteFromSearch,
  );

  createEffect(() => {
    searchQuery();
    setLimit(PAGE_SIZE);
  });

  onMount(() => {
    sync();
    window.addEventListener("focus", sync);
  });

  onCleanup(() => {
    window.removeEventListener("focus", sync);
  });

  const hasMore = () => notes.data.length >= limit();

  // Infinite scroll: load the next page when the sentinel nears the viewport.
  // The observer is created once; the sentinel only renders while hasMore(), so
  // its ref callback observes/unobserves it as it mounts/unmounts.
  const loadMoreObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting) && hasMore()) {
        setLimit((n) => n + PAGE_SIZE);
      }
    },
    { root: null, rootMargin: "200px" },
  );
  onCleanup(() => loadMoreObserver.disconnect());

  const observeSentinel = (el: HTMLDivElement) => {
    loadMoreObserver.observe(el);
    onCleanup(() => loadMoreObserver.unobserve(el));
  };

  const getPreview = (content: string) => {
    if (!content) return "Empty note";

    return (
      content
        .slice(0, 200)
        .split("\n")
        .map((line) =>
          line
            .replace(/^#+\s*/, "")
            .replace(/- \[ \]\s*/, "☐ ")
            .replace(/- \[x\]\s*/i, "☑ ")
            .replace(/- \s*/, "• ")
            .trim(),
        )
        .filter((line) => line !== "")[0] || "Empty note"
    );
  };

  return (
    <>
      <Header title="Notes" titleIcon={<img src="/pwa-64x64.png" alt="" />}>
        <HeaderButton right onClick={() => navigate("/new")}>
          <AddIcon />
        </HeaderButton>
        <HeaderButton onClick={() => setSettingsModalOpen(true)}>
          <MoreIcon />
        </HeaderButton>
      </Header>
      <Page>
        <Show when={importing()}>
          <div class="sync-progress" role="status" aria-live="polite" aria-label="Syncing notes" />
        </Show>
        <div class="notes-list-content">
          <Show when={notes.loaded()}>
            <For
              each={notes.data}
              fallback={
                <Show when={!searchQuery().trim() && totalCount() === 0}>
                  <div class="page-content notes-list-empty">
                    <p>
                      Tap{" "}
                      <button class="inline-icon-button" onClick={() => navigate("/new")}>
                        <AddIcon />
                      </button>{" "}
                      to create a note.
                    </p>
                    <p>
                      Read{" "}
                      <a
                        href="/about"
                        onClick={(e) => {
                          e.preventDefault();
                          navigate("/about");
                        }}
                      >
                        about Mono
                      </a>
                    </p>
                  </div>
                </Show>
              }
            >
              {(note) => {
                const activatable = useActivatable({
                  onHold: () => {
                    setSelectedNoteId(note.id);
                    setNoteActionsOpen(true);
                    triggerHaptic();
                  },
                  onTap: () => navigate(`/note/${note.id}?from=list`),
                });
                return (
                  <button
                    ref={activatable}
                    class="note-item"
                    classList={{ "keyboard-selected": keyboardSelectedId() === note.id }}
                    data-note-id={note.id}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    <div class="note-item-content">
                      <div class="note-item-name">{note.name}</div>
                      <div class="note-item-preview">{getPreview(note.content)}</div>
                    </div>
                    <div class="note-item-date">
                      {timeFromNow(note.lastOpened)}
                      <ChevronRightIcon />
                    </div>
                  </button>
                );
              }}
            </For>
            <Show when={searchQuery().trim()}>
              <button
                type="button"
                class="note-item create-note-item"
                classList={{ "keyboard-selected": createSelected() }}
                onClick={createNoteFromSearch}
              >
                <div class="note-item-content">
                  <div class="note-item-name">{searchQuery().trim()}</div>
                </div>
                <span class="create-note-item-label">Create</span>
              </button>
            </Show>
            <Show when={hasMore()}>
              <div ref={observeSentinel} class="notes-list-sentinel" aria-hidden="true" />
            </Show>
          </Show>
        </div>
      </Page>
      <SettingsModal open={settingsModalOpen} setOpen={setSettingsModalOpen} />
      <NoteActionsModal
        noteId={selectedNoteId()}
        open={noteActionsOpen}
        setOpen={setNoteActionsOpen}
        onReady={(api) => (noteActionsModalApi = api)}
        onClose={() => setSelectedNoteId(null)}
      />
    </>
  );
};
