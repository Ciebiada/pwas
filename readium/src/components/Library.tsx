import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Header, HeaderButton } from "ui/Header";
import { AddIcon, MoreIcon } from "ui/Icons";
import { Page } from "ui/Page";
import { type Book, db } from "../db";
import { useNavigate } from "../hooks/useNavigate";
import FileUpload from "./FileUpload";
import { SettingsModal } from "./SettingsModal";

const Library = (props: { onSelect: (id: number) => void }) => {
  const navigate = useNavigate();
  const [books, setBooks] = createSignal<Book[]>([]);
  const [settingsOpen, setSettingsOpen] = createSignal(false);

  // Function to refresh list
  const loadBooks = async () => {
    const all = await db.books.toArray();
    // Sort by lastOpened descending. Books without lastOpened (old books) go to the bottom.
    const sorted = all.sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));
    setBooks(sorted);
  };

  onMount(() => {
    loadBooks();
  });

  const deleteBook = async (id: number, e: Event) => {
    e.stopPropagation();
    if (confirm("Delete this book?")) {
      await db.books.delete(id);
      await loadBooks();
    }
  };

  return (
    <>
      <Header title="My Library">
        <HeaderButton right onClick={() => document.getElementById("file-input")?.click()}>
          <AddIcon />
        </HeaderButton>
        <HeaderButton onClick={() => setSettingsOpen(true)}>
          <MoreIcon />
        </HeaderButton>
      </Header>
      <Page>
        <div class="page-content">
          <div style={{ display: "none" }}>
            <FileUpload onUpload={loadBooks} />
          </div>
          <Show
            when={books().length > 0}
            fallback={
              <div>
                <p>
                  Tap{" "}
                  <button class="inline-icon-button" onClick={() => document.getElementById("file-input")?.click()}>
                    <AddIcon />
                  </button>{" "}
                  to upload a book.
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
                    about Readium
                  </a>
                </p>
              </div>
            }
          >
            <div class="book-grid">
              <For each={books()}>
                {(book) => <BookItem book={book} onSelect={props.onSelect} onDelete={deleteBook} />}
              </For>
            </div>
          </Show>
        </div>
      </Page>
      <SettingsModal open={settingsOpen} setOpen={setSettingsOpen} />
    </>
  );
};

const BookItem = (props: { book: Book; onSelect: (id: number) => void; onDelete: (id: number, e: Event) => void }) => {
  const [coverUrl, setCoverUrl] = createSignal<string | undefined>(undefined);

  // Create cover URL reactively when book data is available
  createEffect(() => {
    const cover = props.book.cover;
    let url: string | undefined;

    if (cover instanceof Blob) {
      url = URL.createObjectURL(cover);
    } else if (cover instanceof ArrayBuffer) {
      const blob = new Blob([cover]);
      url = URL.createObjectURL(blob);
    } else if (typeof cover === "string") {
      url = cover;
    }

    if (url) {
      setCoverUrl(url);
      // Cleanup previous URL when effect re-runs or component unmounts
      onCleanup(() => {
        if (url && (cover instanceof Blob || cover instanceof ArrayBuffer)) {
          URL.revokeObjectURL(url);
        }
      });
    } else {
      setCoverUrl(undefined);
    }
  });

  const handleClick = () => {
    if (props.book.id) {
      props.onSelect(props.book.id);
    }
  };

  return (
    <div class="book-item" onClick={handleClick}>
      <div class="book-cover">
        <Show when={coverUrl()} fallback={<div class="placeholder-cover">{props.book.title?.[0] || "?"}</div>}>
          <img src={coverUrl()} alt={props.book.title} />
        </Show>
      </div>
      <div class="book-info">
        <h3>{props.book.title || "Untitled"}</h3>
        <p>{props.book.author || "Unknown"}</p>
        <button class="delete-btn" onClick={(e) => props.book.id && props.onDelete(props.book.id, e)}>
          ✕
        </button>
      </div>
    </div>
  );
};

export default Library;
