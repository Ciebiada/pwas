import { createMemo, Index, type JSX, on } from "solid-js";
import { Dynamic } from "solid-js/web";
import { triggerHaptic } from "../../hooks/useHaptic";
import { matchInlineFormatAt } from "./inlineFormat";
import { CODE_FENCE, type LineToken, tokenizeLines } from "./tokenize";

type InlineTokenType = "text" | "strong" | "emphasis" | "strikethrough" | "link" | "code";

type InlineToken = {
  type: InlineTokenType;
  content: string;
  delimiter?: string;
  url?: string;
  raw?: string;
};

type BlockToken = LineToken;

type InlinePattern = {
  type: Exclude<InlineTokenType, "text">;
  regex: RegExp;
  delimiter?: string;
  createToken?: (match: RegExpMatchArray) => InlineToken;
};

type TableRow = {
  index: number;
  token: BlockToken;
};

type RenderSegment = { kind: "line"; index: number; token: BlockToken } | { kind: "table"; rows: TableRow[] };

const INLINE_TRIGGER_CHARS = new Set(["`", "[", "h", "H", "w", "W", "*", "_", "~"]);

const INLINE_PATTERNS: InlinePattern[] = [
  { type: "code", regex: /^`([^`]+)`/, delimiter: "`" },
  {
    type: "link",
    regex: /^\[([^\]]*)\]\(([^)]*)\)/,
    createToken: (match) => ({
      type: "link",
      content: match[1],
      url: match[2],
      raw: match[0],
    }),
  },
  {
    type: "link",
    regex: /^((?:https?:\/\/|www\.)[^\s/]+\.[^\s]+)/i,
    createToken: (match) => ({
      type: "link",
      content: match[1],
      url: match[1],
      raw: match[0],
    }),
  },
];

const tryMatchPattern = (text: string, index: number): InlineToken | null => {
  const slice = text.slice(index);

  for (const pattern of INLINE_PATTERNS) {
    const match = slice.match(pattern.regex);
    if (match) {
      if (pattern.createToken) {
        return pattern.createToken(match);
      }
      return {
        type: pattern.type,
        content: match[1],
        delimiter: pattern.delimiter,
        raw: match[0],
      };
    }
  }

  const inlineFormatMatch = matchInlineFormatAt(text, index);
  if (inlineFormatMatch) {
    return inlineFormatMatch;
  }

  return null;
};

const parseInlineMarkdown = (text: string): InlineToken[] => {
  const tokens: InlineToken[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    const token = INLINE_TRIGGER_CHARS.has(char) ? tryMatchPattern(text, index) : null;
    if (token) {
      tokens.push(token);
      index += token.raw!.length;
      continue;
    }
    const lastToken = tokens[tokens.length - 1];
    if (lastToken?.type === "text") {
      lastToken.content += char;
    } else {
      tokens.push({ type: "text", content: char });
    }
    index++;
  }
  return tokens;
};

const wrapWithDelimiters = (content: string, delimiter: string) => (
  <>
    <span class="markdown-delimiter">{delimiter}</span>
    {content}
    <span class="markdown-delimiter">{delimiter}</span>
  </>
);

const renderInlineToken = (token: InlineToken) => {
  switch (token.type) {
    case "strong":
      return (
        <strong class="md-inline-format md-inline-strong">{wrapWithDelimiters(token.content, token.delimiter!)}</strong>
      );
    case "emphasis":
      return <em class="md-inline-format md-inline-emphasis">{wrapWithDelimiters(token.content, token.delimiter!)}</em>;
    case "strikethrough":
      return (
        <s class="md-inline-format md-inline-strikethrough">{wrapWithDelimiters(token.content, token.delimiter!)}</s>
      );
    case "link":
      return (
        <a
          href={token.url}
          target="_blank"
          rel="noopener noreferrer"
          class="md-link"
          style={{ cursor: "pointer" }}
          onClick={(e) => {
            e.preventDefault();
            let url = token.url!;
            if (!/^https?:\/\//i.test(url)) {
              url = `https://${url}`;
            }
            window.open(url, "_blank");
          }}
        >
          {token.raw}
        </a>
      );
    case "code":
      return <code class="md-inline-code md-inline-format">{wrapWithDelimiters(token.content, token.delimiter!)}</code>;
    default:
      return token.content;
  }
};

const renderInlineMarkdown = (text: string) => parseInlineMarkdown(text).map(renderInlineToken);

const renderBlockContent = (block: BlockToken) => (
  <>
    <span class="markdown-prefix">{block.prefix}</span>
    {block.content ? renderInlineMarkdown(block.content) : "\u200B"}
  </>
);

const renderHeader = (block: BlockToken, className: string, content: JSX.Element) => {
  const Tag = block.type as "h1" | "h2" | "h3";
  return (
    <Dynamic component={Tag} class={className}>
      {content}
    </Dynamic>
  );
};

const renderListItem = (
  block: BlockToken,
  index: number,
  className: string,
  content: JSX.Element,
  onCheckboxToggle?: (lineIndex: number) => void,
) => {
  const indentation = block.prefix.match(/^\s*/)?.[0].length || 0;
  const isCheckbox = block.type === "checkbox";
  const isOrdered = block.type === "orderedList";
  const isChecked = block.prefix.includes("[x]");

  return (
    <div
      class={className}
      style={{ "padding-left": `${indentation}ch` }}
      data-checked={isCheckbox && isChecked ? "" : undefined}
    >
      <div
        class={
          isCheckbox
            ? "md-list-marker"
            : isOrdered
              ? "md-list-marker md-ordered-marker"
              : "md-list-marker md-list-bullet"
        }
        contentEditable={false}
        style={{ left: `${indentation}ch` }}
      >
        {isCheckbox ? (
          <>
            <input
              class="animated-checkbox-input"
              id={`cbx-${index}`}
              type="checkbox"
              switch=""
              checked={isChecked}
              onChange={() => {
                triggerHaptic();
                onCheckboxToggle?.(index);
              }}
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
            />
            <label
              for={`cbx-${index}`}
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
            >
              <span class="checkbox-icon">
                <svg width="12px" height="9px" viewBox="0 0 12 9">
                  <polyline points="1 5 4 8 11 1" />
                </svg>
              </span>
            </label>
          </>
        ) : isOrdered ? (
          <span class="md-ordered-number" data-content={block.prefix.trim()} />
        ) : null}
      </div>
      <div class="md-list-content">{isCheckbox ? <span class="md-checkbox-text">{content}</span> : content}</div>
    </div>
  );
};

const renderBlock = (block: BlockToken, index: number, onCheckboxToggle?: (lineIndex: number) => void) => {
  const blockClassName = block.type === "paragraph" ? "text" : block.type;
  const className = `md-line md-${blockClassName}`;
  const content = renderBlockContent(block);
  const codeBlockProps = block.codeBlockId ? { "data-code-block-id": block.codeBlockId } : {};

  switch (block.type) {
    case "h1":
    case "h2":
    case "h3":
      return renderHeader(block, className, content);
    case "checkbox":
    case "list":
    case "orderedList":
      return renderListItem(block, index, className, content, onCheckboxToggle);
    case "table":
      return <div class={className}>{renderBlockContent(block)}</div>;
    case "codeFence":
      return (
        <div
          class={`${className} md-code-block-line md-code-block-fence`}
          {...codeBlockProps}
          data-code-fence-kind={block.codeFenceKind}
        >
          <span class="markdown-fence-marker">{block.content || CODE_FENCE}</span>
        </div>
      );
    case "codeContent":
      return (
        <div class={`${className} md-code-block-line md-code-block-content`} {...codeBlockProps}>
          {block.content || "\u200B"}
        </div>
      );
    default:
      return block.content ? (
        <div class={className}>{block.disableInlineMarkdown ? block.content : renderInlineMarkdown(block.content)}</div>
      ) : (
        <div class={`${className} empty`}>{"\u200B"}</div>
      );
  }
};

const renderTableGroup = (rows: TableRow[]) => (
  <div class="md-table-scroll">
    <div class="md-table-group">
      {rows.map((row) => (
        <div class="md-line md-table">{renderBlockContent(row.token)}</div>
      ))}
    </div>
  </div>
);

// Group the per-line block tokens into render segments: a single line, or a run
// of consecutive table lines collapsed into one segment (so they share a
// horizontal scroll container — see `.md-table-scroll`/`.md-table-group`).
const buildSegments = (tokens: BlockToken[]): RenderSegment[] => {
  const segments: RenderSegment[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.type === "table") {
      const rows: TableRow[] = [{ index, token }];
      while (index + 1 < tokens.length && tokens[index + 1].type === "table") {
        index += 1;
        rows.push({ index, token: tokens[index] });
      }
      segments.push({ kind: "table", rows });
      continue;
    }

    segments.push({ kind: "line", index, token });
  }

  return segments;
};

const SIGNATURE_SEP = " ";

// A per-segment key over everything that affects how the segment renders. Two
// segments with equal signatures produce identical DOM, so the rendered node can
// be reused unchanged across edits.
const segmentSignature = (segment: RenderSegment): string => {
  if (segment.kind === "table") {
    return `T${segment.rows.map((row) => `${row.index}${SIGNATURE_SEP}${row.token.content}`).join("")}`;
  }

  const { token } = segment;
  return [
    "L",
    segment.index,
    token.type,
    token.prefix,
    token.content,
    token.codeBlockId ?? "",
    token.codeFenceKind ?? "",
  ].join(SIGNATURE_SEP);
};

const renderSegment = (segment: RenderSegment, onCheckboxToggle?: (lineIndex: number) => void): JSX.Element => {
  if (segment.kind === "table") return renderTableGroup(segment.rows);
  return renderBlock(segment.token, segment.index, onCheckboxToggle);
};

type EditorContentProps = {
  content: () => string;
  onCheckboxToggle?: (lineIndex: number) => void;
};

// Per-line rendering: each segment memoizes its rendered DOM node keyed on its
// signature, so a single-line edit only touches that line's DOM instead of
// rebuilding the whole document on every keystroke.
export const EditorContent = (props: EditorContentProps): JSX.Element => {
  const segments = createMemo(() => buildSegments(tokenizeLines(props.content())));

  return (
    <Index each={segments()}>
      {(segment) => {
        const signature = createMemo(() => segmentSignature(segment()));
        const node = createMemo(on(signature, () => renderSegment(segment(), props.onCheckboxToggle)));
        return <>{node()}</>;
      }}
    </Index>
  );
};
