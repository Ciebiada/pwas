import { createInlineFormatAction } from "./createInlineFormatAction";

export const boldAction = createInlineFormatAction({
  id: "bold",
  label: "Bold",
  icon: "**",
  format: {
    type: "strong",
    delimiter: "**",
  },
});

export const italicAction = createInlineFormatAction({
  id: "italic",
  label: "Italic",
  icon: "*",
  format: {
    type: "emphasis",
    delimiter: "*",
  },
});
