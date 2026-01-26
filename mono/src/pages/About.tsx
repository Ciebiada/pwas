import { Header, HeaderButton } from "ui/Header";
import { BackIcon } from "ui/Icons";
import { Page } from "ui/Page";
import { useNavigate } from "../hooks/useNavigate";
import { renderMarkdown } from "../services/markdown/renderer";

const ABOUT_CONTENT = `
Use \`#\` followed by a space for headings.
Try \`x\` and a space to create a task.
Start a line with \`|\` to create a table.
Use \`**bold**\` and  \`*italic*\` for styling.
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
