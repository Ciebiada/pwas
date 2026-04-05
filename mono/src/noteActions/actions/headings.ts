import { createHeadingAction } from "./createHeadingAction";

export const titleHeadingAction = createHeadingAction({
  id: "title-heading",
  label: "Title",
  icon: "#",
  level: 1,
});

export const headingLevel2Action = createHeadingAction({
  id: "heading-level-2",
  label: "Heading",
  icon: "##",
  level: 2,
});

export const subheadingAction = createHeadingAction({
  id: "subheading",
  label: "Subheading",
  icon: "###",
  level: 3,
});
