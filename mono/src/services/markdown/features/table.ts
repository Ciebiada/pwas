import { TABLE_PATTERN, lineEnd } from "../utils";
import { MarkdownFeature } from "./types";

const parseTableRow = (line: string): string[] | null => {
    if (!line.startsWith("|")) return null;

    const cells = line.split("|");
    // cells[0] is empty (before first |)
    const row = cells.slice(1);

    // If ends with |, last element is empty, remove it
    if (row.length > 0 && row[row.length - 1] === "") {
        return row.slice(0, -1);
    }
    return row;
};

const ensureClosingPipe = (line: string): string =>
    line.endsWith("|") ? line : line + "|";

const getTableBlock = (content: string, lineIndex: number) => {
    const lines = content.split("\n");
    let start = lineIndex;
    let end = lineIndex;

    // Search up - any line starting with | is part of the table
    while (start > 0 && lines[start - 1].startsWith("|")) {
        start--;
    }

    // Search down
    while (end < lines.length - 1 && lines[end + 1].startsWith("|")) {
        end++;
    }

    return { start, end, lines: lines.slice(start, end + 1) };
};

const isSeparatorRow = (cells: string[]): boolean => {
    if (cells.length === 0) return false;
    // Detect unformatted: first cell is just "-"
    if (cells[0].trim() === "-") return true;
    // Detect already formatted: all cells contain only dashes (e.g., "----" from "|----+----+---|")
    return cells.every((cell) => /^-+$/.test(cell.trim()));
};

const formatTable = (
    lines: string[],
): { formatted: string[]; columnWidths: number[] } => {
    // Normalize all lines (add closing pipe if missing) before parsing
    const parsedRows = lines
        .map((line) => parseTableRow(ensureClosingPipe(line)))
        .filter((row): row is string[] => row !== null);

    const colCount = parsedRows.reduce(
        (max, row) => Math.max(max, row.length),
        0,
    );
    const colWidths = new Array(colCount).fill(0);

    // Calculate widths (content only, skip separator rows)
    parsedRows.forEach((row) => {
        if (isSeparatorRow(row)) return;
        row.forEach((cell, i) => {
            colWidths[i] = Math.max(colWidths[i], cell.trim().length);
        });
    });

    // Ensure minimum width of 1 for empty columns
    for (let i = 0; i < colWidths.length; i++) {
        if (colWidths[i] === 0) colWidths[i] = 1;
    }

    // Rebuild lines
    const formatted = parsedRows.map((row) => {
        if (isSeparatorRow(row)) {
            // Format as standard markdown separator: |----|----|
            const pieces = colWidths.map((w) => "-".repeat(w + 2));
            return `|${pieces.join("|")}|`;
        }

        const pieces = [];
        for (let i = 0; i < colCount; i++) {
            const cellContent = row[i] ? row[i].trim() : "";
            const width = colWidths[i];
            const padding = " ".repeat(Math.max(0, width - cellContent.length));
            pieces.push(` ${cellContent}${padding} `);
        }
        return `|${pieces.join("|")}|`;
    });

    return { formatted, columnWidths: colWidths };
};

export const TableFeature: MarkdownFeature = {
    name: "table",
    pattern: TABLE_PATTERN,

    onEnter(content, selection, match, lineRange) {
        const { start: lineStart, line } = lineRange;

        // Ensure line has closing pipe for proper parsing
        const normalizedLine = ensureClosingPipe(line);
        const cells = parseTableRow(normalizedLine);
        if (!cells || cells.length === 0) return null;

        // Exit condition: if every cell is empty/whitespace
        const isEmpty = cells.every((c) => c.trim() === "");
        if (isEmpty) {
            const endOfLine = lineEnd(content, lineStart);
            const hasNewlineAfter = endOfLine < content.length;

            return {
                content:
                    content.slice(0, lineStart) +
                    content.slice(endOfLine + (hasNewlineAfter ? 1 : 0)),
                cursor: lineStart,
            };
        }

        // 3. Realign table and insert new row
        const lines = content.split("\n");
        const lineIndex = content.slice(0, lineStart).split("\n").length - 1;

        // Get the whole table block
        const { start, end, lines: tableLines } = getTableBlock(content, lineIndex);

        const { formatted, columnWidths } = formatTable(tableLines);

        // Construct the new empty row based on widths
        const newRowCells = columnWidths.map((w) => " " + " ".repeat(w) + " ");
        const newRow = `|${newRowCells.join("|")}|`;

        // Insert into the formatted lines
        const relativeIndex = lineIndex - start;
        formatted.splice(relativeIndex + 1, 0, newRow);

        // Reconstruct content
        const beforeTable = lines.slice(0, start).join("\n");
        const afterTable = lines.slice(end + 1).join("\n");
        const newTableBlock = formatted.join("\n");

        const newContent =
            (start > 0 ? beforeTable + "\n" : "") +
            newTableBlock +
            (end < lines.length - 1 ? "\n" + afterTable : "");

        // Calculate new cursor position
        const newRowStart =
            (start > 0 ? beforeTable.length + 1 : 0) +
            formatted.slice(0, relativeIndex + 1).join("\n").length +
            1;

        return {
            content: newContent,
            cursor: newRowStart + 2, // "| "
        };
    },

    onTab(content, selection, shiftKey, match, lineRange) {
        const { start: lineStart, line } = lineRange;
        const relativeCursor = selection.start - lineStart;

        const pipeIndices: number[] = [];
        for (let i = 0; i < line.length; i++) {
            if (line[i] === "|") pipeIndices.push(i);
        }

        if (pipeIndices.length === 1) {
            if (!shiftKey) {
                return { content, cursor: lineStart + line.length };
            }
            return null;
        }

        let currentCellIndex = -1;
        for (let i = 0; i < pipeIndices.length - 1; i++) {
            if (
                relativeCursor >= pipeIndices[i] &&
                relativeCursor <= pipeIndices[i + 1]
            ) {
                currentCellIndex = i;
                break;
            }
        }

        if (
            currentCellIndex === -1 &&
            relativeCursor >= pipeIndices[pipeIndices.length - 1]
        ) {
            currentCellIndex = pipeIndices.length - 1;
        }

        if (currentCellIndex === -1) return null;

        if (!shiftKey) {
            if (currentCellIndex < pipeIndices.length - 1) {
                const nextCellStart = pipeIndices[currentCellIndex] + 1;
                return {
                    content,
                    cursor:
                        lineStart + nextCellStart + (line[nextCellStart] === " " ? 1 : 0),
                };
            }
        } else {
            if (currentCellIndex > 0) {
                const prevCellStart = pipeIndices[currentCellIndex - 1] + 1;
                return {
                    content,
                    cursor:
                        lineStart + prevCellStart + (line[prevCellStart] === " " ? 1 : 0),
                };
            }
        }

        return null;
    },

    onBackspace(content, selection, match, lineRange) {
        const { start: lineStart, line } = lineRange;
        const cells = parseTableRow(line);
        if (!cells) return null;

        const isEmpty = cells.every((c) => c.trim() === "");
        if (isEmpty) {
            const endOfLine = lineEnd(content, lineStart);
            const hasNewlineAfter = endOfLine < content.length;
            return {
                content:
                    content.slice(0, lineStart) +
                    content.slice(endOfLine + (hasNewlineAfter ? 1 : 0)),
                cursor: lineStart,
            };
        }

        return null;
    },
};
