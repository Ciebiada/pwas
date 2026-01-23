import { InputResult, Selection } from "../utils";

export type LineRange = { start: number; end: number; line: string };

export type MarkdownFeature = {
  name: string;
  pattern: RegExp;
  onTab?: (
    content: string,
    selection: Selection,
    shiftKey: boolean,
    match: RegExpMatchArray,
    lineRange: LineRange,
  ) => InputResult | null;
  onEnter?: (
    content: string,
    selection: Selection,
    match: RegExpMatchArray,
    lineRange: LineRange,
  ) => InputResult | null;
  onBackspace?: (
    content: string,
    selection: Selection,
    match: RegExpMatchArray,
    lineRange: LineRange,
  ) => InputResult | null;
  onInput?: (char: string, content: string, selection: Selection) => InputResult | null;
};
