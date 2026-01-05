import { createSignal, Show, onMount, onCleanup, createEffect } from "solid-js";
import { useParams } from "@solidjs/router";
import { Editor, EditorAPI } from "../components/Editor";
import {
  Header,
  HeaderButton,
  Modal,
  ModalButton,
  BackIcon,
  MoreIcon,
  ModalPage,
} from "rams";
import { useNavigate } from "../hooks/useNavigate";
import { db } from "../services/db";
import { syncNote, wasSynced } from "../services/sync";

import { debounce } from "../services/debounce";
import { createDexieSignalQuery } from "../services/solid-dexie";

export const EditNote = () => {
  const navigate = useNavigate();
  const noteId = parseInt(useParams().id ?? "0");
  const [modalOpen, setModalOpen] = createSignal(false);
  let editorApi: EditorAPI;
  let lastSeenSync = 0;
  let initialized = false;

  const note = createDexieSignalQuery(() => db.notes.get(noteId));

  const handleFocusSync = () => syncNote(noteId);

  onMount(() => {
    syncNote(noteId);
    window.addEventListener("focus", handleFocusSync);
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

  const handleDelete = async (close: () => Promise<void>) => {
    await close();
    const n = await db.notes.get(noteId);

    if (n && wasSynced(n)) {
      await db.notes.update(noteId, { status: "pending-delete" });
      syncNote(noteId);
    } else {
      await db.notes.delete(noteId);
    }

    navigate("/", { back: true });
  };

  return (
    <>
      <Header>
        <HeaderButton onClick={() => navigate("/")}>
          <BackIcon />
        </HeaderButton>
        <HeaderButton right onClick={() => setModalOpen(true)}>
          <MoreIcon />
        </HeaderButton>
      </Header>
      <div class="page-container with-header">
        <div class="page-content">
          <Show when={note()}>
            <Editor
              initialContent={`${note()!.name}${note()!.content ? "\n" + note()!.content : ""}`}
              initialCursor={note()!.cursor}
              autoFocus
              onReady={(api) => (editorApi = api)}
              onChange={handleNoteChange}
              onCursorChange={handleCursorChange}
            />
          </Show>
        </div>
      </div>
      <Modal
        open={modalOpen}
        setOpen={setModalOpen}
        title="Note Actions"
        onClose={() => setModalOpen(false)}
      >
        <ModalPage id="root">
          <ModalButton danger onClick={handleDelete}>
            Delete Note
          </ModalButton>
        </ModalPage>
      </Modal>
    </>
  );
};
