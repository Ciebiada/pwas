import { timeFromNow } from "../services/date";
import { Header, HeaderButton, PlusIcon, MoreIcon, AddIcon } from "rams";
import { createDexieArrayQuery } from "../services/solid-dexie";
import { useNavigate } from "../hooks/useNavigate";
import { db } from "../services/db";
import { createSignal, For, onMount, onCleanup } from "solid-js";
import "./NotesList.css";
import { sync } from "../services/sync";
import { SettingsModal } from "../components/SettingsModal";

export const NotesList = () => {
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = createSignal(false);

  const notes = createDexieArrayQuery(
    async () => await db.notes.where("status").notEqual("pending-delete").reverse().sortBy("lastModified"),
  );

  onMount(() => {
    sync();
    window.addEventListener("focus", sync);
  });

  onCleanup(() => {
    window.removeEventListener("focus", sync);
  });

  const getPreview = (content: string) => {
    if (!content) return "Empty note";

    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.replace(/^#+\s*/, "").trim();
      if (trimmed) {
        return trimmed;
      }
    }
    return "Empty note";
  };

  return (
    <>
      <Header>
        <HeaderButton right onClick={() => navigate("/new")}>
          <AddIcon />
        </HeaderButton>
        <HeaderButton onClick={() => setModalOpen(true)}>
          <MoreIcon />
        </HeaderButton>
      </Header>
      <div class="page-container">
        <div class="page-title">
          <h1>Notes</h1>
        </div>
        <div class="notes-list">
          <For
            each={notes}
            fallback={
              <div class="content">
                <p>
                  Tap{" "}
                  <button class="empty-state-icon-button" onClick={() => navigate("/new")}>
                    <AddIcon />
                  </button>{" "}
                  to create a note.
                </p>
                <p class="empty-state-text">
                  Read{" "}
                  <a
                    href="/about"
                    class="empty-state-link"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate("/about");
                    }}
                  >
                    about Mono
                  </a>
                </p>
              </div>
            }
          >
            {(note) => (
              <button class="note-item" onClick={() => navigate(`/note/${note.id}`)}>
                <div class="note-item-content">
                  <div class="note-item-name">{note.name}</div>
                  <div class="note-item-preview">{getPreview(note.content)}</div>
                </div>
                <div class="note-item-date">{timeFromNow(note.lastModified)}</div>
              </button>
            )}
          </For>
        </div>
      </div>
      <SettingsModal open={modalOpen} setOpen={setModalOpen} />
    </>
  );
};
