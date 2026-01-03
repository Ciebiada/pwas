export const toggleCheckbox = (content: string, lineIndex: number): string => {
  const lines = content.split("\n");
  const line = lines[lineIndex];

  const match = line.match(/^(\s*[-*] )\[([ x])\](.*)/);
  if (match) {
    const prefix = match[1];
    const isChecked = match[2] === "x";
    const rest = match[3];
    lines[lineIndex] = `${prefix}[${isChecked ? " " : "x"}]${rest}`;
  }

  return lines.join("\n");
};
