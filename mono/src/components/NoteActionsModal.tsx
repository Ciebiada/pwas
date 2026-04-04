import type { Accessor, Setter } from "solid-js";
import { Modal, ModalButton, ModalPage } from "ui/Modal";
import { db } from "../services/db";
import { syncNote, wasSynced } from "../services/sync";

type NoteActionsModalProps = {
  noteId: number;
  open: Accessor<boolean>;
  setOpen: Setter<boolean>;
  onClose?: () => void;
  onDelete?: () => void | Promise<void>;
};

export const NoteActionsModal = (props: NoteActionsModalProps) => {
  const handleDelete = async (close: () => Promise<void>) => {
    await close();
    const note = await db.notes.get(props.noteId);
    if (!note) return;

    if (wasSynced(note)) {
      await db.notes.update(props.noteId, { status: "pending-delete" });
      syncNote(props.noteId);
    } else {
      await db.notes.delete(props.noteId);
    }

    await props.onDelete?.();
  };

  return (
    <Modal open={props.open} setOpen={props.setOpen} title="Note Actions" onClose={props.onClose}>
      <ModalPage id="root">
        <ModalButton danger onClick={handleDelete}>
          Delete Note
        </ModalButton>
      </ModalPage>
    </Modal>
  );
};
