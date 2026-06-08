import type { JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { ChevronRightIcon } from "ui/Icons";
import { triggerHaptic } from "../../hooks/useHaptic";
import type { FoldLineState, MarkdownFoldState } from "./folding";
import { matchInlineFormatAt } from "./inlineFormat";

type InlineTokenType = "text" | "strong" | "emphasis" | "strikethrough" | "link" | "code";
type BlockType =
  | "h1"
  | "h2"
  | "h3"
  | "paragraph"
  | "checkbox"
  | "list"
  | "orderedList"
  | "table"
  | "codeFence"
  | "codeContent";

type InlineToken = {
  type: InlineTokenType;
  content: string;
  delimiter?: string;
  url?: string;
  raw?: string;
};

type BlockToken = {
  type: BlockType;
  prefix: string;
  content: string;
  disableInlineMarkdown?: boolean;
  codeBlockId?: string;
  codeFenceKind?: "open" | "close";
};

type InlinePattern = {
  type: Exclude<InlineTokenType, "text">;
  regex: RegExp;
  delimiter?: string;
  createToken?: (match: RegExpMatchArray) => InlineToken;
};

type RenderMarkdownOptions = {
  foldState?: MarkdownFoldState;
  onFoldToggle?: (sectionId: string) => void;
};

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

const BLOCK_PATTERNS = [
  { type: "table" as const, regex: /^()(\|.*)$/ },
  { type: "h3" as const, regex: /^(### )(.*)/ },
  { type: "h2" as const, regex: /^(## )(.*)/ },
  { type: "h1" as const, regex: /^(# )(.*)/ },
  { type: "checkbox" as const, regex: /^(\s*[-*] \[(?:x| )\] )(.*)/ },
  { type: "orderedList" as const, regex: /^(\s*\d+\. )(.*)/ },
  { type: "list" as const, regex: /^(\s*[-*] )(.*)/ },
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
    const token = tryMatchPattern(text, index);
    if (token) {
      tokens.push(token);
      index += token.raw ? token.raw.length : token.delimiter!.length * 2 + token.content.length;
      continue;
    }
    const lastToken = tokens[tokens.length - 1];
    if (lastToken?.type === "text") {
      lastToken.content += text[index];
    } else {
      tokens.push({ type: "text", content: text[index] });
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

const CODE_FENCE = "```";

const isOpeningCodeFence = (line: string) => line.startsWith(CODE_FENCE);

const isClosingCodeFence = (line: string) => line.trim() === CODE_FENCE;

const findClosingCodeFence = (lines: string[], startIndex: number) => {
  for (let index = startIndex + 1; index < lines.length; index++) {
    if (isClosingCodeFence(lines[index])) return index;
  }
  return -1;
};

const parseBlockLine = (line: string, index: number): BlockToken => {
  if (index === 0) return { type: "paragraph", prefix: "", content: line, disableInlineMarkdown: true };

  for (const pattern of BLOCK_PATTERNS) {
    const match = line.match(pattern.regex);
    if (match) return { type: pattern.type, prefix: match[1], content: match[2] };
  }
  return { type: "paragraph", prefix: "", content: line };
};

const parseBlocks = (markdown: string): BlockToken[] => {
  const blocks: BlockToken[] = [];
  const lines = markdown.split("\n");
  let activeCodeBlockId: string | null = null;
  let codeBlockCount = 0;
  let activeCodeBlockClosingIndex = -1;

  for (const [index, line] of lines.entries()) {
    if (index === 0) {
      blocks.push(parseBlockLine(line, index));
      continue;
    }

    if (activeCodeBlockId) {
      if (index === activeCodeBlockClosingIndex) {
        blocks.push({
          type: "codeFence",
          prefix: "",
          content: line,
          codeBlockId: activeCodeBlockId,
          codeFenceKind: "close",
        });
        activeCodeBlockId = null;
        activeCodeBlockClosingIndex = -1;
        continue;
      }

      blocks.push({
        type: "codeContent",
        prefix: "",
        content: line,
        disableInlineMarkdown: true,
        codeBlockId: activeCodeBlockId,
      });
      continue;
    }

    if (isOpeningCodeFence(line)) {
      const closingFenceIndex = findClosingCodeFence(lines, index);
      if (closingFenceIndex === -1) {
        blocks.push(parseBlockLine(line, index));
        continue;
      }

      activeCodeBlockId = `code-block-${codeBlockCount++}`;
      activeCodeBlockClosingIndex = closingFenceIndex;
      blocks.push({
        type: "codeFence",
        prefix: "",
        content: line,
        codeBlockId: activeCodeBlockId,
        codeFenceKind: "open",
      });
      continue;
    }

    blocks.push(parseBlockLine(line, index));
  }

  return blocks;
};

const renderBlockContent = (block: BlockToken) => (
  <>
    <span class="markdown-prefix">{block.prefix}</span>
    {block.content ? renderInlineMarkdown(block.content) : "\u200B"}
  </>
);

const renderFoldToggle = (foldLine: FoldLineState | undefined, onFoldToggle?: (sectionId: string) => void) => {
  if (!foldLine?.isFoldableHeading || !foldLine.sectionId) return null;

  return (
    <button
      type="button"
      class="fold-toggle"
      classList={{ "is-folded": foldLine.isFolded }}
      aria-label={foldLine.isFolded || foldLine.isShowingChildren ? "Unfold section" : "Fold section"}
      title={foldLine.isFolded || foldLine.isShowingChildren ? "Unfold section" : "Fold section"}
      contentEditable={false}
      tabIndex={-1}
      onPointerDown={(event) => event.preventDefault()}
      onTouchStart={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault();
        triggerHaptic();
        onFoldToggle?.(foldLine.sectionId!);
      }}
    >
      <ChevronRightIcon />
    </button>
  );
};

const renderHeader = (
  block: BlockToken,
  className: string,
  content: JSX.Element,
  foldLine?: FoldLineState,
  onFoldToggle?: (sectionId: string) => void,
) => {
  const Tag = block.type as "h1" | "h2" | "h3";
  return (
    <Dynamic component={Tag} class={className}>
      {renderFoldToggle(foldLine, onFoldToggle)}
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

const renderBlock = (
  block: BlockToken,
  index: number,
  onCheckboxToggle?: (lineIndex: number) => void,
  options: RenderMarkdownOptions = {},
) => {
  const foldLine = options.foldState?.lines[index];
  const blockClassName = block.type === "paragraph" ? "text" : block.type;
  const className = `md-line md-${blockClassName}${foldLine?.isHidden ? " is-fold-hidden" : ""}`;
  const content = renderBlockContent(block);
  const codeBlockProps = block.codeBlockId ? { "data-code-block-id": block.codeBlockId } : {};

  switch (block.type) {
    case "h1":
    case "h2":
    case "h3":
      return renderHeader(block, className, content, foldLine, options.onFoldToggle);
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

const renderTableGroup = (blocks: BlockToken[], startIndex: number, options: RenderMarkdownOptions = {}) => (
  <div class="md-table-scroll">
    <div class="md-table-group">
      {blocks.map((block, index) => {
        const foldLine = options.foldState?.lines[startIndex + index];
        const className = `md-line md-table${foldLine?.isHidden ? " is-fold-hidden" : ""}`;
        return <div class={className}>{renderBlockContent(block)}</div>;
      })}
    </div>
  </div>
);

export const renderMarkdown = (
  markdown: string,
  onCheckboxToggle?: (lineIndex: number) => void,
  options: RenderMarkdownOptions = {},
) => {
  const blocks = parseBlocks(markdown);
  const rendered: JSX.Element[] = [];

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];

    if (block.type !== "table") {
      rendered.push(renderBlock(block, index, onCheckboxToggle, options));
      continue;
    }

    const startIndex = index;
    const tableBlocks = [block];
    while (index + 1 < blocks.length && blocks[index + 1].type === "table") {
      tableBlocks.push(blocks[++index]);
    }
    rendered.push(renderTableGroup(tableBlocks, startIndex, options));
  }

  return rendered;
};
