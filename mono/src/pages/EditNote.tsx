import { useParams, useSearchParams } from "@solidjs/router";
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { Header, HeaderButton } from "ui/Header";
import { BackIcon, MoreIcon } from "ui/Icons";
import { Page } from "ui/Page";
import { isIOS } from "ui/platform";
import { Editor, type EditorAPI } from "../components/Editor";
import { NoteActionsModal, type NoteActionsModalAPI } from "../components/NoteActionsModal";
import { useNavigate } from "../hooks/useNavigate";
import { db, type Note } from "../services/db";
import { debounce } from "../services/debounce";
import { splitNote } from "../services/note";
import {
  allocateUniqueNoteNameFromNotes,
  findNoteByNameFromNotes,
  getWikiLinkSuggestionsFromNotes,
} from "../services/noteNames";
import { createDexieArrayQuery, createDexieSignalQuery } from "../services/solid-dexie";
import { syncNote } from "../services/sync";

export const EditNote = () => {
  const navigate = useNavigate();
  const params = useParams();
  const noteId = createMemo(() => parseInt(params.id ?? "0", 10));
  const [searchParams] = useSearchParams();
  const fromList = createMemo(() => searchParams.from === "list");
  const [modalOpen, setModalOpen] = createSignal(false);
  let editorApi: EditorAPI | undefined;
  let noteActionsModalApi: NoteActionsModalAPI | undefined;
  let lastSeenSync = 0;
  let initializedNoteId: number | undefined;
  let lastQueuedCursor: number | undefined;

  const note = createDexieSignalQuery(() => db.notes.get(noteId()));
  const [editorNote, setEditorNote] = createSignal<Note>();
  const linkableNotes = createDexieArrayQuery(() =>
    db.notes.filter((note) => note.status !== "pending-delete" && note.name.trim().length > 0).toArray(),
  );

  const handleFocusSync = () => syncNote(noteId());

  const debouncedSave = debounce(async (snapshot: { id: number; content: string }) => {
    const { name, content: body } = splitNote(snapshot.content);
    const trimmedName = name.trim();
    const nextName = trimmedName ? allocateUniqueNoteNameFromNotes(trimmedName, linkableNotes.data, snapshot.id) : "";
    await db.notes.update(snapshot.id, {
      name: nextName,
      content: body,
      status: "pending",
      lastModified: Date.now(),
    });
    if (nextName && nextName !== trimmedName && noteId() === snapshot.id) {
      editorApi?.replaceContent(nextName, body);
    }
    syncNote(snapshot.id);
  }, 500);

  const debouncedCursorSave = debounce((snapshot: { id: number; cursor: number }) => {
    return db.notes.update(snapshot.id, { cursor: snapshot.cursor });
  }, 500);

  onMount(async () => {
    syncNote(noteId());
    window.addEventListener("focus", handleFocusSync);

    const n = await db.notes.get(noteId());
    if (!n) navigate("/", { replace: true });
  });

  onCleanup(() => {
    window.removeEventListener("focus", handleFocusSync);
    debouncedSave.flush();
    debouncedCursorSave.flush();
  });

  createEffect(() => {
    const n = note();
    if (!n) return;

    if (editorNote()?.id !== n.id) {
      debouncedSave.flush();
      debouncedCursorSave.flush();
      editorApi = undefined;
      setEditorNote(n);
      lastSeenSync = n.lastRemoteUpdate || 0;
      lastQueuedCursor = n.cursor;
    }

    if (initializedNoteId !== n.id) {
      initializedNoteId = n.id;
      if (fromList()) db.notes.update(n.id, { lastOpened: Date.now() });
      return;
    }

    if (n.lastRemoteUpdate && n.lastRemoteUpdate > lastSeenSync) {
      console.log("Remote update detected, refreshing editor content");
      lastSeenSync = n.lastRemoteUpdate;
      editorApi?.replaceContent(n.name, n.content);
    }
  });

  const handleNoteChange = (content: string) => {
    debouncedSave({ id: noteId(), content });
  };

  const getWikiLinkHref = (title: string) => {
    const displayTitle = title.trim();
    const linkedNote = findNoteByNameFromNotes(displayTitle, linkableNotes.data);
    return linkedNote ? `/note/${linkedNote.id}` : `/new?name=${encodeURIComponent(displayTitle)}`;
  };

  const getWikiLinkSuggestions = (query: string) =>
    getWikiLinkSuggestionsFromNotes(query, linkableNotes.data, noteId()).map((note) => note.name);

  const handleWikiLinkOpen = (_title: string, href: string) => navigate(href);

  const handleCursorChange = (cursor: number) => {
    if (cursor === lastQueuedCursor) return;
    lastQueuedCursor = cursor;
    debouncedCursorSave({ id: noteId(), cursor });
  };

  const prepareOpenNoteActions = () => {
    noteActionsModalApi?.focusSearchOnOpen();
  };

  const handleOpenNoteActionsPressStart = (event: MouseEvent | TouchEvent) => {
    if (!editorApi?.isFocused()) return;

    event.preventDefault();
    prepareOpenNoteActions();
    setModalOpen(true);
  };

  const handleOpenNoteActions = () => {
    if (modalOpen()) return;
    if (editorApi?.isFocused()) {
      prepareOpenNoteActions();
    }
    setModalOpen(true);
  };

  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      if (isIOS) return;
      if (e.ctrlKey && e.key === "o") {
        e.preventDefault();
        navigate(-1, { back: true });
        return;
      }
      if (e.ctrlKey && e.key === "p") {
        e.preventDefault();
        handleOpenNoteActions();
      }
    };
    document.addEventListener("keydown", handler);
    onCleanup(() => document.removeEventListener("keydown", handler));
  });

  return (
    <>
      <Header>
        <HeaderButton onClick={() => navigate(-1, { back: true })}>
          <BackIcon />
        </HeaderButton>
        <HeaderButton
          right
          onMouseDown={handleOpenNoteActionsPressStart}
          onTouchStart={handleOpenNoteActionsPressStart}
          onClick={handleOpenNoteActions}
        >
          <MoreIcon />
        </HeaderButton>
      </Header>
      <Page>
        <div class="page-content">
          <Show when={editorNote()} keyed>
            {(currentNote) => (
              <Editor
                initialContent={`${currentNote.name}${currentNote.content ? `\n${currentNote.content}` : ""}`}
                initialCursor={currentNote.cursor}
                autoFocus
                onReady={(api) => (editorApi = api)}
                onChange={handleNoteChange}
                onCursorChange={handleCursorChange}
                getWikiLinkSuggestions={getWikiLinkSuggestions}
                onWikiLinkOpen={handleWikiLinkOpen}
                getWikiLinkHref={getWikiLinkHref}
              />
            )}
          </Show>
        </div>
      </Page>
      <NoteActionsModal
        noteId={noteId()}
        open={modalOpen}
        setOpen={setModalOpen}
        getEditorApi={() => editorApi!}
        onReady={(api) => (noteActionsModalApi = api)}
        onDelete={() => navigate(-1, { back: true })}
      />
    </>
  );
};
