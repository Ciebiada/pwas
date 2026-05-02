import { type Accessor, createEffect, createMemo, createSignal, For, type Setter, Show } from "solid-js";
import { Modal, ModalButton, ModalPage } from "ui/Modal";
import { getApplicableNoteActions } from "../noteActions";
import type { NoteActionContext, ResolvedNoteAction } from "../noteActions/types";
import { incrementNoteActionUsage } from "../noteActions/usage";
import { db } from "../services/db";
import { syncNote, wasSynced } from "../services/sync";
import type { EditorAPI } from "./Editor";
import "./NoteActionsModal.css";

type NoteActionsModalProps = {
  noteId: number;
  open: Accessor<boolean>;
  setOpen: Setter<boolean>;
  getEditorApi?: () => EditorAPI | undefined;
  onClose?: () => void;
  onDelete?: () => void | Promise<void>;
};

export const NoteActionsModal = (props: NoteActionsModalProps) => {
  const [frozenActionContext, setFrozenActionContext] = createSignal<NoteActionContext | null>(null);
  const [canUndo, setCanUndo] = createSignal(false);
  const [canRedo, setCanRedo] = createSignal(false);

  const readCurrentActionContext = () => {
    const editorApi = props.getEditorApi?.();
    if (!editorApi) return null;

    const state = editorApi.getState();
    return {
      noteId: props.noteId,
      content: state.content,
      selection: state.selection,
    };
  };

  createEffect(() => {
    if (props.open()) {
      const state = props.getEditorApi?.()?.getState();
      setFrozenActionContext(readCurrentActionContext());
      setCanUndo(state?.canUndo ?? false);
      setCanRedo(state?.canRedo ?? false);
    } else {
      setFrozenActionContext(null);
      setCanUndo(false);
      setCanRedo(false);
    }
  });

  const getActionContext = () => frozenActionContext() ?? readCurrentActionContext();

  const actionItems = createMemo(() => {
    const context = getActionContext();
    return context ? getApplicableNoteActions(context) : [];
  });

  const handleAction =
    ({ action, context }: ResolvedNoteAction) =>
    async (close: (fast?: boolean) => Promise<void>) => {
      const editorApi = props.getEditorApi?.();
      if (!editorApi) return;
      if (!action.isApplicable(context)) return;

      const result = await action.run(context);
      if (!result) return;

      incrementNoteActionUsage(action.id);
      editorApi.focus();
      editorApi.applyEdit(result);
      void close(true);
    };

  const handleUndo = async (close: (fast?: boolean) => Promise<void>) => {
    const editorApi = props.getEditorApi?.();
    if (!editorApi?.getState().canUndo) return;

    editorApi.undo();
    void close(true);
  };

  const handleRedo = async (close: (fast?: boolean) => Promise<void>) => {
    const editorApi = props.getEditorApi?.();
    if (!editorApi?.getState().canRedo) return;

    editorApi.redo();
    void close(true);
  };

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
        <Show when={canUndo()}>
          <ModalButton onClick={handleUndo}>Undo</ModalButton>
        </Show>
        <Show when={canRedo()}>
          <ModalButton onClick={handleRedo}>Redo</ModalButton>
        </Show>
        <For each={actionItems()}>
          {(item) => (
            <ModalButton onClick={handleAction(item)} class={`note-action-${item.action.id}`}>
              <span class="note-action-button-content">
                <span>{item.label}</span>
                {item.action.icon && <span class="note-action-button-icon monospace">{item.action.icon}</span>}
              </span>
            </ModalButton>
          )}
        </For>
        <ModalButton danger onClick={handleDelete}>
          Delete Note
        </ModalButton>
      </ModalPage>
    </Modal>
  );
};
