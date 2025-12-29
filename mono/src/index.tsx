/* @refresh reload */
import { render } from "solid-js/web";
import { Route, Router } from "@solidjs/router";
import "solid-devtools";
import { NotesList } from "./pages/NotesList";
import { EditNote } from "./pages/EditNote";
import { NewNote } from "./pages/NewNote";

import { About } from "./pages/About";
import "./reset.css";
import "./theme.css";
import "./typography.css";
import { DropboxCallback } from "./pages/DropboxCallback";
import { GoogleDriveCallback } from "./pages/GoogleDriveCallback";

const root = document.getElementById("root");

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    "Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?",
  );
}

render(() => {
  return (
    <Router explicitLinks>
      <Route path="/" component={NotesList} />
      <Route path="/new" component={NewNote} />
      <Route path="/note/:id" component={EditNote} />
      <Route path="/about" component={About} />
      <Route path="/dropbox-callback" component={DropboxCallback} />
      <Route path="/google-callback" component={GoogleDriveCallback} />
    </Router>
  );
}, root!);
