import { useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { NoteList } from "./components/NoteList";
import { NoteDetail } from "./components/NoteDetail";
import { NewNoteDialog } from "./components/NewNoteDialog";
import { SearchPalette } from "./components/SearchPalette";
import { Toast } from "./components/ui";
import { useStore } from "./store";

export default function App() {
  const { refreshMeta, refreshNotes, setNewNoteOpen, toast } = useStore();

  useEffect(() => {
    refreshMeta().then(refreshNotes).catch(console.error);
  }, [refreshMeta, refreshNotes]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setNewNoteOpen(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [setNewNoteOpen]);

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar />
      <NoteList />
      <NoteDetail />
      <NewNoteDialog />
      <SearchPalette />
      <Toast msg={toast} />
    </div>
  );
}
