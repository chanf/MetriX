import { create } from "zustand";
import * as api from "./api";
import type { Item, ItemType, NoteSummary, Folder, Scope, Tag } from "./types";

let toastTimer: number | undefined;

interface AppState {
  folders: Folder[];
  tags: Tag[];
  scope: Scope;
  notes: NoteSummary[];
  selectedNoteId: number | null;
  detail: NoteSummary | null;
  items: Item[];
  detailLoading: boolean;
  searchOpen: boolean;
  searchQuery: string;
  searchResults: NoteSummary[];
  searchLoading: boolean;
  newNoteOpen: boolean;
  toast: string | null;

  refreshMeta: () => Promise<void>;
  refreshNotes: () => Promise<void>;
  setScope: (scope: Scope) => Promise<void>;
  openNote: (id: number) => Promise<void>;
  closeNote: () => void;
  reloadItems: () => Promise<void>;
  addItem: (type: ItemType) => Promise<void>;
  patchItemLocal: (id: number, patch: Partial<Item>) => void;
  removeItemLocal: (id: number) => void;
  setDetail: (n: NoteSummary | null) => void;
  toggleFavorite: () => Promise<void>;
  toggleSensitive: () => Promise<void>;
  setSearchOpen: (open: boolean) => void;
  doSearch: (q: string) => Promise<void>;
  setNewNoteOpen: (open: boolean) => void;
  createNote: (name: string, folderId: number | null, tags: string[]) => Promise<void>;
  showToast: (msg: string) => void;
  deleteSelectedNote: () => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  folders: [],
  tags: [],
  scope: { kind: "all" },
  notes: [],
  selectedNoteId: null,
  detail: null,
  items: [],
  detailLoading: false,
  searchOpen: false,
  searchQuery: "",
  searchResults: [],
  searchLoading: false,
  newNoteOpen: false,
  toast: null,

  refreshMeta: async () => {
    const [folders, tags] = await Promise.all([api.listFolders(), api.listTags()]);
    set({ folders, tags });
  },

  refreshNotes: async () => {
    const { scope } = get();
    const notes = await api.listNotes(
      scope.kind,
      scope.kind === "folder" ? scope.folderId : null,
      scope.kind === "tag" ? scope.tag : null,
    );
    set({ notes });
  },

  setScope: async (scope) => {
    set({ scope });
    await get().refreshNotes();
  },

  openNote: async (id) => {
    set({ selectedNoteId: id, detailLoading: true, items: [] });
    const [detail, items] = await Promise.all([api.getNote(id), api.listItems(id)]);
    if (get().selectedNoteId !== id) return;
    set({ detail, items, detailLoading: false });
  },

  closeNote: () => set({ selectedNoteId: null, detail: null, items: [] }),

  reloadItems: async () => {
    const id = get().selectedNoteId;
    if (id == null) return;
    const items = await api.listItems(id);
    set({ items });
  },

  addItem: async (type) => {
    const id = get().selectedNoteId;
    if (id == null) return;
    const titles: Record<ItemType, string> = {
      kv: "参数名",
      image: "",
      text: "标题",
      secret: "用途",
      file: "",
      url: "链接名",
    };
    const item = await api.createItem(id, type, titles[type]);
    set((s) => ({ items: [...s.items, item] }));
    get().refreshNotes();
  },

  patchItemLocal: (id, patch) =>
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),

  removeItemLocal: (id) =>
    set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

  setDetail: (n) => set({ detail: n }),

  toggleFavorite: async () => {
    const d = get().detail;
    if (!d) return;
    await api.setNoteFlag(d.id, "favorite", !d.favorite);
    const next = { ...d, favorite: !d.favorite };
    set({ detail: next });
    get().refreshNotes();
  },

  toggleSensitive: async () => {
    const d = get().detail;
    if (!d) return;
    await api.setNoteFlag(d.id, "sensitive", !d.sensitive);
    const next = { ...d, sensitive: !d.sensitive };
    set({ detail: next });
    get().refreshNotes();
  },

  setSearchOpen: (open) => set({ searchOpen: open, searchQuery: open ? "" : "", searchResults: [] }),

  doSearch: async (q) => {
    set({ searchQuery: q, searchLoading: true });
    if (!q.trim()) {
      set({ searchResults: [], searchLoading: false });
      return;
    }
    const searchResults = await api.searchNotes(q);
    set({ searchResults, searchLoading: false });
  },

  setNewNoteOpen: (open) => set({ newNoteOpen: open }),

  createNote: async (name, folderId, tags) => {
    const note = await api.createNote(name, folderId, tags);
    await get().refreshMeta();
    await get().refreshNotes();
    set({ newNoteOpen: false });
    await get().openNote(note.id);
  },

  showToast: (msg) => {
    set({ toast: msg });
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => set({ toast: null }), 2200);
  },

  deleteSelectedNote: async () => {
    const id = get().selectedNoteId;
    if (id == null) return;
    await api.deleteNote(id);
    set({ selectedNoteId: null, detail: null, items: [] });
    await get().refreshNotes();
  },
}));
