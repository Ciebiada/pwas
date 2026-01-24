/* @refresh reload */

import { Router } from "@solidjs/router";
import { render } from "solid-js/web";
import "./index.css";
import App from "./App.tsx";
import "./pwa";

const root = document.getElementById("root");

render(
  () => (
    <Router>
      <App />
    </Router>
  ),
  root!,
);
