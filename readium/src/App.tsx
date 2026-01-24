import { Route } from "@solidjs/router";
import { createEffect } from "solid-js";
import About from "./components/About";
import Library from "./components/Library";
import Reader from "./components/Reader";
import { useNavigate } from "./hooks/useNavigate";
import { settings } from "./store/settings";
import "./App.css";

const LibraryPage = () => {
  const navigate = useNavigate();

  const openBook = (id: number) => {
    navigate(`/book/${id}`);
  };

  return (
    <div class="app-container">
      <Library onSelect={openBook} />
    </div>
  );
};

const ReaderPage = () => {
  const navigate = useNavigate();

  const closeBook = () => {
    navigate("/", { back: true });
  };

  return <Reader onClose={closeBook} />;
};

const App = () => {
  createEffect(() => {
    document.documentElement.dataset.theme = settings().theme;
  });

  return (
    <>
      <Route path="/" component={LibraryPage} />
      <Route path="/book/:id" component={ReaderPage} />
      <Route path="/about" component={About} />
    </>
  );
};

export default App;
