import type { JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { triggerHaptic } from "../../hooks/useHaptic";

type InlineTokenType = "text" | "strong" | "emphasis" | "strikethrough" | "link" | "code";
type BlockType = "h1" | "h2" | "h3" | "paragraph" | "checkbox" | "list" | "orderedList" | "table";

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
};

type InlinePattern = {
  type: Exclude<InlineTokenType, "text">;
  regex: RegExp;
  delimiter?: string;
  createToken?: (match: RegExpMatchArray) => InlineToken;
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
  { type: "strong", regex: /^\*\*(\S(?:.*?\S)?)\*\*/, delimiter: "**" },
  { type: "strong", regex: /^__(\S(?:.*?\S)?)__/, delimiter: "__" },
  { type: "strikethrough", regex: /^~~(\S(?:.*?\S)?)~~/, delimiter: "~~" },
  { type: "emphasis", regex: /^\*(\S(?:.*?\S)?)\*/, delimiter: "*" },
  { type: "emphasis", regex: /^_(?!_)([^_]+)_/, delimiter: "_" },
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

const tryMatchPattern = (text: string): InlineToken | null => {
  for (const pattern of INLINE_PATTERNS) {
    const match = text.match(pattern.regex);
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
  return null;
};

const parseInlineMarkdown = (text: string): InlineToken[] => {
  const tokens: InlineToken[] = [];
  let index = 0;
  while (index < text.length) {
    const token = tryMatchPattern(text.slice(index));
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
      return <strong>{wrapWithDelimiters(token.content, token.delimiter!)}</strong>;
    case "emphasis":
      return <em>{wrapWithDelimiters(token.content, token.delimiter!)}</em>;
    case "strikethrough":
      return <s>{wrapWithDelimiters(token.content, token.delimiter!)}</s>;
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
      return <code class="md-inline-code">{wrapWithDelimiters(token.content, token.delimiter!)}</code>;
    default:
      return token.content;
  }
};

const renderInlineMarkdown = (text: string) => parseInlineMarkdown(text).map(renderInlineToken);

const parseBlockLine = (line: string): BlockToken => {
  for (const pattern of BLOCK_PATTERNS) {
    const match = line.match(pattern.regex);
    if (match) return { type: pattern.type, prefix: match[1], content: match[2] };
  }
  return { type: "paragraph", prefix: "", content: line };
};

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
    <div class={className} style={{ "padding-left": `${indentation}ch` }}>
      <label
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
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => {
              triggerHaptic();
              onCheckboxToggle?.(index);
            }}
            onPointerDown={(e) => e.preventDefault()}
          />
        ) : isOrdered ? (
          <span class="md-ordered-number" data-content={block.prefix.trim()} />
        ) : null}
      </label>
      <div class="md-list-content">{content}</div>
    </div>
  );
};

const renderBlock = (block: BlockToken, index: number, onCheckboxToggle?: (lineIndex: number) => void) => {
  const className = `md-line md-${block.type}`;
  const content = renderBlockContent(block);

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
      return <div class="md-line md-table">{renderBlockContent(block)}</div>;
    default:
      return block.content ? (
        <div class="md-line md-text">{renderInlineMarkdown(block.content)}</div>
      ) : (
        <div class="md-line md-text empty">{"\u200B"}</div>
      );
  }
};

export const renderMarkdown = (markdown: string, onCheckboxToggle?: (lineIndex: number) => void) =>
  markdown.split("\n").map((line, index) => renderBlock(parseBlockLine(line), index, onCheckboxToggle));
