import { useSearchParams } from "@solidjs/router";
import { onMount } from "solid-js";
import { useNavigate } from "../hooks/useNavigate";
import { db } from "../services/db";
import { allocateUniqueNoteName } from "../services/noteNames";

export const NewNote = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  onMount(async () => {
    const name = searchParams.name ? await allocateUniqueNoteName(String(searchParams.name)) : "";
    const id = await db.notes.add({
      name,
      content: "",
      cursor: name.length,
      lastOpened: Date.now(),
      lastModified: Date.now(),
      status: "pending",
    });
    navigate(`/note/${id}`, { replace: true });
  });

  return null;
};
