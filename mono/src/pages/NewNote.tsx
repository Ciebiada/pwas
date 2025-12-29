import { onMount } from "solid-js";
import { useNavigate } from "../hooks/useNavigate";
import { db } from "../services/db";

export const NewNote = () => {
  const navigate = useNavigate();

  onMount(async () => {
    const id = await db.notes.add({
      name: "",
      content: "",
      cursor: 0,
      lastOpened: Date.now(),
      lastModified: Date.now(),
      status: "pending",
    });
    navigate(`/note/${id}`, { replace: true });
  });

  return null;
};
