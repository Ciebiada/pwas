/* @refresh reload */

import { Route, Router } from "@solidjs/router";
import { render } from "solid-js/web";
import "./index.css";
import App from "./App.tsx";
import About from "./components/About";
import Library from "./components/Library";
import Reader from "./components/Reader";
import { useNavigate } from "./hooks/useNavigate";
import "./pwa";

const LibraryPage = () => {
  const navigate = useNavigate();
  return (
    <div class="app-container">
      <Library onSelect={(id) => navigate(`/book/${id}`)} />
    </div>
  );
};

const ReaderPage = () => {
  const navigate = useNavigate();
  return <Reader onClose={() => navigate("/", { back: true })} />;
};

const root = document.getElementById("root");

render(
  () => (
    <Router root={App}>
      <Route path="/" component={LibraryPage} />
      <Route path="/book/:id" component={ReaderPage} />
      <Route path="/about" component={About} />
    </Router>
  ),
  root!,
);
