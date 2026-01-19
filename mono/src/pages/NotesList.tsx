import { timeFromNow } from "../services/date";
import { Header, HeaderButton } from "ui/Header";
import { MoreIcon, AddIcon, ChevronRightIcon } from "ui/Icons";
import { createDexieArrayQuery } from "../services/solid-dexie";
import { useNavigate } from "../hooks/useNavigate";
import { db } from "../services/db";
import { createSignal, For, onMount, onCleanup } from "solid-js";
import "./NotesList.css";
import { sync } from "../services/sync";
import { SettingsModal } from "../components/SettingsModal";
import { Page } from "ui/Page";
import { useActivatable } from "ui/useActivatable";

export const NotesList = () => {
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = createSignal(false);

  const notes = createDexieArrayQuery(
    async () =>
      await db.notes
        .where("status")
        .notEqual("pending-delete")
        .reverse()
        .sortBy("lastModified"),
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
          <Header title="Notes">
            <HeaderButton right onClick={() => navigate("/new")}>
              <AddIcon />
            </HeaderButton>
            <HeaderButton onClick={() => setModalOpen(true)}>
              <MoreIcon />
            </HeaderButton>
          </Header>
      <Page
        header={
          <Header title="Notes">
            <HeaderButton right onClick={() => navigate("/new")}>
              <AddIcon />
            </HeaderButton>
            <HeaderButton onClick={() => setModalOpen(true)}>
              <MoreIcon />
            </HeaderButton>
          </Header>
        }
      >
        <For
          each={notes}
          fallback={
            <div class="page-content">
              <p>
                Tap{" "}
                <button
                  class="inline-icon-button"
                  onClick={() => navigate("/new")}
                >
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
          }
        >
          {(note) => {
            const activatable = useActivatable();
            return (
              <button
                ref={activatable}
                class="note-item"
                onClick={() => navigate(`/note/${note.id}`)}
              >
                <div class="note-item-content">
                  <div class="note-item-name">{note.name}</div>
                  <div class="note-item-preview">
                    {getPreview(note.content)}
                  </div>
                </div>
                <div class="note-item-date">
                  {timeFromNow(note.lastModified)}
                  <ChevronRightIcon />
                </div>
              </button>
            );
          }}
        </For>
      </Page>
      <SettingsModal open={modalOpen} setOpen={setModalOpen} />
    </>
  );
};
