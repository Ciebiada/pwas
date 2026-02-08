import { createEffect } from "solid-js";
import { settings } from "./store/settings";
import { UpdateToast } from "./components/UpdateToast";
import "./App.css";

import type { ParentProps } from "solid-js";

const App = (props: ParentProps) => {
  createEffect(() => {
    document.documentElement.dataset.theme = settings().theme;
  });

  return (
    <>
      {props.children}
      <UpdateToast />
    </>
  );
};

export default App;
