import { Header, HeaderButton } from "ui/Header";
import { BackIcon } from "ui/Icons";
import { useNavigate } from "../hooks/useNavigate";
import { renderMarkdown } from "../services/markdown/renderer";
import { Page } from "ui/Page";

const ABOUT_CONTENT = `
Mono is a minimalist, local-first markdown editor.

### Markdown Basics
\`# Heading\` creates a title
\`## Subheading\` for sections
\`- list\` or \`1. ordered\` for lists
\`x task\` for todos

### Shortcuts
Mono uses intuitive shortcuts to keep you in the flow
- **Nest**: Type \`-\` or \`x\` after a bullet/checkbox to indent
- **Convert**: Type \`x\` after a list bullet to make it a task
- **Revert**: Type \`-\` after a checkbox to turn it back into a list
- **Tables**: Start a line with \`|\` to create a table
`.trim();

export const About = () => {
  const navigate = useNavigate();

  return (
    <>
      <Header>
        <HeaderButton onClick={() => navigate(-1, { back: true })}>
          <BackIcon />
        </HeaderButton>
      </Header>
      <Page>
        <div class="page-content">
          <div class="editor">
            <h1>About Mono</h1>
            {renderMarkdown(ABOUT_CONTENT, () => {})}
          </div>
        </div>
      </Page>
    </>
  );
};
