import { useParams } from "@solidjs/router";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import { Header, HeaderButton } from "ui/Header";
import { BackIcon, MoreIcon } from "ui/Icons";
import { Modal, ModalButton, ModalPage } from "ui/Modal";
import { Page } from "ui/Page";
import { Editor, type EditorAPI } from "../components/Editor";
import { useNavigate } from "../hooks/useNavigate";
import { db } from "../services/db";

import { debounce } from "../services/debounce";
import { createDexieSignalQuery } from "../services/solid-dexie";
import { syncNote, wasSynced } from "../services/sync";

export const EditNote = () => {
  const navigate = useNavigate();
  const noteId = parseInt(useParams().id ?? "0");
  const [modalOpen, setModalOpen] = createSignal(false);
  let editorApi: EditorAPI;
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

  const handleDelete = async (close: () => Promise<void>) => {
    await close();
    const n = await db.notes.get(noteId);

    if (n && wasSynced(n)) {
      await db.notes.update(noteId, { status: "pending-delete" });
      syncNote(noteId);
    } else {
      await db.notes.delete(noteId);
    }

    navigate(-1, { back: true });
  };

  return (
    <>
      <Header>
        <HeaderButton onClick={() => navigate(-1, { back: true })}>
          <BackIcon />
        </HeaderButton>
        <HeaderButton right onClick={() => setModalOpen(true)}>
          <MoreIcon />
        </HeaderButton>
      </Header>
      <Page>
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
      </Page>
      <Modal open={modalOpen} setOpen={setModalOpen} title="Note Actions" onClose={() => setModalOpen(false)}>
        <ModalPage id="root">
          <ModalButton danger onClick={handleDelete}>
            Delete Note
          </ModalButton>
        </ModalPage>
      </Modal>
    </>
  );
};
