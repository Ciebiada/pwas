/* @refresh reload */

import { Route, Router } from "@solidjs/router";
import type { ParentProps } from "solid-js";
import { render } from "solid-js/web";
import "solid-devtools";

import { About } from "./pages/About";
import { DropboxCallback } from "./pages/DropboxCallback";
import { EditNote } from "./pages/EditNote";
import { GoogleDriveCallback } from "./pages/GoogleDriveCallback";
import { NewNote } from "./pages/NewNote";
import { NotesList } from "./pages/NotesList";
import "ui/reset.css";
import "ui/theme.css";
import "ui/typography.css";
import { useLocation } from "@solidjs/router";
import { getScrollPosition, setIsScrolled } from "ui/scrollState";
import "./pwa";

const root = document.getElementById("root");

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    "Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?",
  );
}

const App = (props: ParentProps) => {
  const location = useLocation();
  const saved = getScrollPosition(location.pathname);
  setIsScrolled(saved !== undefined ? saved > 10 : false);
  return props.children;
};

render(() => {
  return (
    <Router explicitLinks root={App}>
      <Route path="/" component={NotesList} />
      <Route path="/new" component={NewNote} />
      <Route path="/note/:id" component={EditNote} />
      <Route path="/about" component={About} />
      <Route path="/dropbox-callback" component={DropboxCallback} />
      <Route path="/google-callback" component={GoogleDriveCallback} />
    </Router>
  );
}, root!);
