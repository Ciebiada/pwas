export const splitNote = (s: string) => {
  const i = s.indexOf("\n");
  if (i < 0) return { name: s, content: "" };
  return {
    name: s.slice(0, i),
    content: s.slice(i + 1),
  };
};

export const normalizeNoteName = (name: string) => name.trim().toLocaleLowerCase();
