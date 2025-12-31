import { Header, HeaderButton, BackIcon } from "rams";
import { useNavigate } from "../hooks/useNavigate";
import { renderMarkdown } from "../services/markdown";

const ABOUT_CONTENT = `### Private & Secure
Unlike most other note-taking apps, Mono is **open source** and runs entirely in your browser. There is no backend - your notes are synced by calling the official APIs of your storage provider directly from your device. Your data remains under your control.

### No Proprietary Lock-in
Mono uses **Markdown**, the industry standard for plain-text notes. You can access your synced notes folder on your computer and edit them in any editor you like. If you ever decide to move on, your notes are already in a portable format that works everywhere.

### Offline First
Even though Mono is a web app, it is built to be offline-first. You can view, create, and edit notes without an internet connection, and your changes will automatically sync once you're back online.

### Cross-Platform
Mono is optimized for both mobile (as a PWA) and desktop. Whether you use iOS, Android, Windows, macOS, or Linux, Mono provides a seamless experience and keeps your notes in sync across all your devices.`.trim();

export const About = () => {
  const navigate = useNavigate();

  return (
    <>
      <Header>
        <HeaderButton onClick={() => navigate("/", { back: true })}>
          <BackIcon />
        </HeaderButton>
      </Header>
      <div class="page-container">
        <div class="page-content">
          <div class="editor">
            <h1>About Mono</h1>
            {renderMarkdown(ABOUT_CONTENT, () => {})}
          </div>
        </div>
      </div>
    </>
  );
};
