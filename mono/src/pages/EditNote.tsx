import { useParams } from "@solidjs/router";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import { Header, HeaderButton } from "ui/Header";
import { BackIcon, MoreIcon } from "ui/Icons";
import { Page } from "ui/Page";
import { Editor, type EditorAPI } from "../components/Editor";
import { NoteActionsModal, type NoteActionsModalAPI } from "../components/NoteActionsModal";
import { useNavigate } from "../hooks/useNavigate";
import { db } from "../services/db";
import { debounce } from "../services/debounce";
import { createDexieSignalQuery } from "../services/solid-dexie";
import { syncNote } from "../services/sync";

export const EditNote = () => {
  const navigate = useNavigate();
  const noteId = parseInt(useParams().id ?? "0", 10);
  const [modalOpen, setModalOpen] = createSignal(false);
  let editorApi: EditorAPI;
  let noteActionsModalApi: NoteActionsModalAPI | undefined;
  let lastSeenSync = 0;
  let initialized = false;

  const note = createDexieSignalQuery(() => db.notes.get(noteId));

  const handleFocusSync = () => syncNote(noteId);

  onMount(async () => {
    syncNote(noteId);
    window.addEventListener("focus", handleFocusSync);

    const n = await db.notes.get(noteId);
    if (!n) navigate("/", { replace: true });
  });

  onCleanup(() => {
    window.removeEventListener("focus", handleFocusSync);
  });

  createEffect(() => {
    const n = note();
    if (!n) return;

    if (!initialized) {
      initialized = true;
      db.notes.update(n.id, { lastOpened: Date.now() });
      lastSeenSync = n.lastRemoteUpdate || 0;
      return;
    }

    if (n.lastRemoteUpdate && n.lastRemoteUpdate > lastSeenSync) {
      console.log("Remote update detected, refreshing editor content");
      lastSeenSync = n.lastRemoteUpdate;
      editorApi.replaceContent(n.name, n.content);
    }
  });

  const debouncedSync = debounce(() => syncNote(noteId), 500);

  const handleNoteChange = async (name: string, content: string) => {
    await db.notes.update(noteId, {
      name,
      content,
      status: "pending",
      lastModified: Date.now(),
    });
    debouncedSync();
  };

  const handleCursorChange = async (cursor: number) => {
    await db.notes.update(noteId, { cursor });
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
          <Show when={note()}>
            <Editor
              initialContent={`${note()!.name}${note()!.content ? `\n${note()!.content}` : ""}`}
              initialCursor={note()!.cursor}
              autoFocus
              foldStorageKey={`mono:folded-sections:v1:${noteId}`}
              onReady={(api) => (editorApi = api)}
              onChange={handleNoteChange}
              onCursorChange={handleCursorChange}
            />
          </Show>
        </div>
      </Page>
      <NoteActionsModal
        noteId={noteId}
        open={modalOpen}
        setOpen={setModalOpen}
        getEditorApi={() => editorApi}
        onReady={(api) => (noteActionsModalApi = api)}
        onDelete={() => navigate(-1, { back: true })}
      />
    </>
  );
};
