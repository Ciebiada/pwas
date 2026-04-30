import type { InputResult, Selection } from "../markdown/utils";

export type EditorInputRuleContext = {
  content: string;
  selection: Selection;
};

export type EditorInputRule = {
  name: string;
  onInsertText?: (text: string, context: EditorInputRuleContext) => InputResult | null;
  onDeleteContentBackward?: (context: EditorInputRuleContext) => InputResult | null;
};
