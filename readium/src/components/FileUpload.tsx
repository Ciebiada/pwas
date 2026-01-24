import { createSignal, Show } from "solid-js";
import { db } from "../db";
import { EpubParser } from "../lib/epub";

const FileUpload = (props: { onUpload: () => void }) => {
  const [isDragOver, setIsDragOver] = createSignal(false);
  const [processing, setProcessing] = createSignal(false);

  const processFile = async (file: File) => {
    if (file.type !== "application/epub+zip" && !file.name.endsWith(".epub")) {
      alert("Please upload an EPUB file");
      return;
    }

    setProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const parser = new EpubParser();
      const packageData = await parser.load(arrayBuffer);

      let coverBuffer: ArrayBuffer | undefined;
      try {
        const coverHref = await parser.getCoverImageHref();
        if (coverHref) {
          const coverBlob = await parser.getFile(coverHref);
          if (coverBlob) {
            coverBuffer = await coverBlob.arrayBuffer();
          }
        }
      } catch {
        // Cover extraction is best-effort; ignore failures.
      }

      await db.books.add({
        title: packageData.metadata.title || "Untitled",
        author: packageData.metadata.creator || "Unknown",
        data: arrayBuffer,
        cover: coverBuffer,
        progress: 0,
        lastOpened: Date.now(),
      });

      props.onUpload();
    } catch {
      alert("Error parsing EPUB");
    } finally {
      setProcessing(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer?.files?.[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div
      class={`upload-zone ${isDragOver() ? "drag-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={onDrop}
      onClick={() => document.getElementById("file-input")?.click()}
    >
      <input
        type="file"
        id="file-input"
        accept=".epub"
        hidden
        onChange={(e) => {
          if (e.currentTarget.files?.[0]) processFile(e.currentTarget.files[0]);
        }}
      />
      <Show when={!processing()} fallback={<p>Processing...</p>}>
        <p>Drag & Drop EPUB here or Click to Upload</p>
      </Show>
    </div>
  );
};

export default FileUpload;
