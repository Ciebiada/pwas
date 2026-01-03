import { InputResult, Selection } from "../utils";

export interface MarkdownFeature {
  name: string;
  pattern: RegExp;
  onTab?: (
    content: string,
    selection: Selection,
    shiftKey: boolean,
    match: RegExpMatchArray,
    lineRange: { start: number; end: number; line: string },
  ) => InputResult | null;
  onEnter?: (
    content: string,
    selection: Selection,
    match: RegExpMatchArray,
    lineRange: { start: number; end: number; line: string },
  ) => InputResult | null;
  onBackspace?: (
    content: string,
    selection: Selection,
    match: RegExpMatchArray,
    lineRange: { start: number; end: number; line: string },
  ) => InputResult | null;
  onInput?: (
    char: string,
    content: string,
    selection: Selection,
  ) => InputResult | null;
}
