import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { BlobMeta, Folder, Item, ItemType, NoteSummary, Tag } from "./types";

// ---------- folders ----------
export const listFolders = () => invoke<Folder[]>("list_folders");
export const createFolder = (name: string, parentId: number | null) =>
  invoke<Folder>("create_folder", { name, parentId });
export const renameFolder = (id: number, name: string) =>
  invoke<void>("rename_folder", { id, name });
export const deleteFolder = (id: number) => invoke<void>("delete_folder", { id });
export const moveFolder = (id: number, parentId: number | null) =>
  invoke<void>("move_folder", { id, parentId });

// ---------- notes ----------
export const listNotes = (kind: string, folderId?: number | null, tag?: string | null) =>
  invoke<NoteSummary[]>("list_notes", { kind, folderId: folderId ?? null, tag: tag ?? null });
export const getNote = (id: number) => invoke<NoteSummary | null>("get_note", { id });
export const createNote = (name: string, folderId: number | null, tags: string[]) =>
  invoke<NoteSummary>("create_note", { name, folderId, tags });
export const updateNoteMeta = (
  id: number,
  opts: { name?: string; folderId?: number | null; tags?: string[] },
) =>
  invoke<NoteSummary>("update_note_meta", {
    id,
    name: opts.name,
    folderId: "folderId" in opts ? opts.folderId : undefined,
    tags: opts.tags,
  });
export const setNoteFlag = (id: number, flag: "favorite" | "sensitive", value: boolean) =>
  invoke<void>("set_note_flag", { id, flag, value });
export const deleteNote = (id: number) => invoke<void>("delete_note", { id });
export const listTags = () => invoke<Tag[]>("list_tags");
export const searchNotes = (query: string) => invoke<NoteSummary[]>("search_notes", { query });

// ---------- items ----------
export const listItems = (noteId: number) => invoke<Item[]>("list_items", { noteId });
export const createItem = (noteId: number, itemType: ItemType, title: string) =>
  invoke<Item>("create_item", { noteId, itemType, title });
export const updateItem = (
  id: number,
  opts: { title?: string; content?: string; meta?: Record<string, unknown> },
) =>
  invoke<Item>("update_item", {
    id,
    title: opts.title,
    content: opts.content,
    meta: opts.meta,
  });
export const deleteItem = (id: number) => invoke<void>("delete_item", { id });
export const reorderItems = (noteId: number, ids: number[]) =>
  invoke<void>("reorder_items", { noteId, ids });

// ---------- blobs ----------
export const storeBlob = (name: string, mime: string, dataB64: string) =>
  invoke<BlobMeta>("store_blob", { name, mime, dataB64 });
export const readBlobB64 = (id: number) => invoke<string>("read_blob_b64", { id });
export const readFileB64 = (path: string) =>
  invoke<{ name: string; mime: string; size: number; dataB64: string }>("read_file_b64", {
    path,
  });
export const openBlobTemp = (id: number) => invoke<void>("open_blob_temp", { id });
export const exportBlob = async (id: number, defaultName: string) => {
  const dest = await save({ defaultPath: defaultName });
  if (!dest) return false;
  await invoke<void>("export_blob", { id, dest });
  return true;
};

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function dataUrlToB64(dataUrl: string): string {
  const idx = dataUrl.indexOf(",");
  return dataUrl.slice(idx + 1);
}
