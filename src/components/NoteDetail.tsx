import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { isComposing } from "../ime";
import * as api from "../api";
import { useStore } from "../store";
import { ItemCard } from "./ItemCard";
import { Modal } from "./ui";
import {
  ITEM_TYPE_DESC,
  ITEM_TYPE_LABEL,
  type ItemType,
} from "../types";
import {
  IconChevronDown,
  IconFolder,
  IconKey,
  IconKv,
  IconImage,
  IconLink,
  IconLock,
  IconPlus,
  IconStar,
  IconText,
  IconFile,
  IconTrash,
  IconX,
} from "./Icons";

const TYPE_ICON: Record<ItemType, React.ReactNode> = {
  kv: <IconKv width={20} height={20} />,
  image: <IconImage width={20} height={20} />,
  text: <IconText width={20} height={20} />,
  secret: <IconKey width={20} height={20} />,
  file: <IconFile width={20} height={20} />,
  url: <IconLink width={20} height={20} />,
};

const ALL_TYPES: ItemType[] = ["kv", "image", "text", "secret", "file", "url"];

export function NoteDetail() {
  const {
    detail,
    items,
    folders,
    detailLoading,
    setDetail,
    reloadItems,
    addItem,
    toggleFavorite,
    toggleSensitive,
    deleteSelectedNote,
    showToast,
    refreshNotes,
  } = useStore();

  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tagEditing, setTagEditing] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // reset reveal state when note changes
  useEffect(() => {
    setRevealed(new Set());
    setPickerOpen(false);
    setTagEditing(false);
  }, [detail?.id]);

  const onDragEnd = useCallback(
    async (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id || detail == null) return;
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const next = arrayMove(items, oldIndex, newIndex);
      useStore.setState({ items: next });
      await api.reorderItems(
        detail.id,
        next.map((i) => i.id),
      );
    },
    [items, detail],
  );

  const attachBlobToNote = useCallback(
    async (
      noteId: number,
      type: "image" | "file",
      f: { name: string; mime: string; size: number; dataB64: string },
    ) => {
      try {
        const blob = await api.storeBlob(f.name, f.mime, f.dataB64);
        const meta = { blobId: blob.id, name: blob.name, mime: blob.mime, size: blob.size };
        const existing = useStore
          .getState()
          .items.find((i) => i.type === type && !(i.meta as { blobId?: number })?.blobId);
        if (existing) {
          const updated = await api.updateItem(existing.id, { meta });
          useStore.setState((s) => ({
            items: s.items.map((i) => (i.id === updated.id ? updated : i)),
          }));
        } else {
          const item = await api.createItem(noteId, type, "");
          const updated = await api.updateItem(item.id, { meta });
          useStore.setState((s) => ({ items: [...s.items, updated] }));
        }
        showToast(`已添加${type === "image" ? "图片" : "文件"}：${f.name}`);
      } catch (err) {
        showToast(String(err));
      }
    },
    [showToast],
  );

  const importPaths = useCallback(
    async (paths: string[]) => {
      if (!detail) return;
      for (const p of paths) {
        try {
          const f = await api.readFileB64(p);
          const type: "image" | "file" = f.mime.startsWith("image/") ? "image" : "file";
          await attachBlobToNote(detail.id, type, f);
        } catch (err) {
          showToast(String(err));
        }
      }
      reloadItems();
    },
    [detail, attachBlobToNote, reloadItems, showToast],
  );

  // Tauri drag-drop (file paths from OS)
  useEffect(() => {
    if (!detail) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "drop" && event.payload.paths.length > 0) {
          importPaths(event.payload.paths);
        }
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [detail, importPaths]);

  // Paste image from clipboard
  useEffect(() => {
    if (!detail) return;
    const h = (e: ClipboardEvent) => {
      const files: File[] = [];
      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        for (const f of Array.from(e.clipboardData.files)) files.push(f);
      }
      if (files.length === 0) return;
      e.preventDefault();
      (async () => {
        for (const file of files) {
          try {
            const dataUrl = await api.fileToDataUrl(file);
            const b64 = api.dataUrlToB64(dataUrl);
            const type: "image" | "file" = file.type.startsWith("image/") ? "image" : "file";
            await attachBlobToNote(detail.id, type, {
              name: file.name || (type === "image" ? "pasted-image" : "pasted-file"),
              mime: file.type,
              size: file.size,
              dataB64: b64,
            });
          } catch (err) {
            showToast(String(err));
          }
        }
        reloadItems();
      })();
    };
    window.addEventListener("paste", h);
    return () => window.removeEventListener("paste", h);
  }, [detail, attachBlobToNote, reloadItems, showToast]);

  const addTag = async () => {
    const t = tagInput.trim().replace(/^#/, "");
    if (!t || !detail) return;
    if (detail.tags.includes(t)) {
      setTagInput("");
      return;
    }
    const tags = [...detail.tags, t];
    const updated = await api.updateNoteMeta(detail.id, { tags });
    setDetail(updated);
    setTagInput("");
    useStore.getState().refreshMeta();
  };

  const removeTag = async (t: string) => {
    if (!detail) return;
    const tags = detail.tags.filter((x) => x !== t);
    const updated = await api.updateNoteMeta(detail.id, { tags });
    setDetail(updated);
    useStore.getState().refreshMeta();
  };

  const flatFolders = useMemo(() => {
    const out: { id: number; label: string }[] = [];
    const walk = (parent: number | null, depth: number) => {
      for (const f of folders.filter((x) => x.parent_id === parent)) {
        out.push({ id: f.id, label: "　".repeat(depth) + f.name });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [folders]);

  if (detailLoading) {
    return (
      <section className="flex flex-1 items-center justify-center text-[13px] text-zinc-400">
        加载中…
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-3 bg-zinc-50/50 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-100 text-accent-600">
          <IconKey width={26} height={26} />
        </div>
        <p className="text-[15px] font-medium text-zinc-700">选择或新建一个参数笔记</p>
        <p className="max-w-[320px] text-[13px] leading-relaxed text-zinc-400">
          把 API Key、配置、图片、文件、链接统一收进参数笔记，随时检索、一键复制。
          <br />
          <span className="mt-1 inline-block">⌘K 搜索 · ⌘N 新建</span>
        </p>
      </section>
    );
  }

  const toggleReveal = (id: number) => {
    setRevealed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-zinc-50/50">
      {/* header */}
      <header className="border-b border-zinc-200 bg-white px-6 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <input
            value={detail.name}
            onChange={(e) => setDetail({ ...detail, name: e.target.value })}
            onBlur={async () => {
              const n = detail.name.trim();
              if (!n) return;
              const updated = await api.updateNoteMeta(detail.id, { name: n });
              setDetail(updated);
              refreshNotes();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isComposing(e)) (e.target as HTMLInputElement).blur();
            }}
            className="min-w-0 flex-1 bg-transparent text-[18px] font-semibold text-zinc-800 outline-none"
          />
          <button
            onClick={toggleFavorite}
            title={detail.favorite ? "取消收藏" : "收藏"}
            className={`rounded-lg p-2 transition hover:bg-zinc-100 ${
              detail.favorite ? "text-amber-400" : "text-zinc-300 hover:text-zinc-500"
            }`}
          >
            <IconStar width={16} height={16} fill={detail.favorite ? "currentColor" : "none"} />
          </button>
          <button
            onClick={toggleSensitive}
            title={detail.sensitive ? "取消敏感标记" : "标记为敏感（所有密钥强制打码）"}
            className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] transition hover:bg-zinc-100 ${
              detail.sensitive ? "bg-rose-50 text-rose-600" : "text-zinc-400 hover:text-zinc-600"
            }`}
          >
            <IconLock width={14} height={14} />
            敏感
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            title="删除笔记"
            className="rounded-lg p-2 text-zinc-300 transition hover:bg-rose-50 hover:text-rose-500"
          >
            <IconTrash width={16} height={16} />
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-1.5 text-[12px] text-zinc-500">
            <IconFolder width={13} height={13} className="text-zinc-400" />
            <select
              value={detail.folder_id ?? ""}
              onChange={async (e) => {
                const fid = e.target.value ? Number(e.target.value) : null;
                const updated = await api.updateNoteMeta(detail.id, { folderId: fid });
                setDetail(updated);
                refreshNotes();
              }}
              className="rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[12px] text-zinc-600 outline-none transition hover:border-zinc-200 hover:bg-zinc-50"
            >
              <option value="">未分类</option>
              {flatFolders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-center gap-1.5">
            {detail.tags.map((t) => (
              <span
                key={t}
                className="group flex items-center gap-1 rounded-full bg-accent-50 px-2.5 py-0.5 text-[12px] text-accent-700"
              >
                #{t}
                <button
                  onClick={() => removeTag(t)}
                  className="text-accent-300 transition hover:text-accent-600"
                >
                  <IconX width={10} height={10} />
                </button>
              </span>
            ))}
            {tagEditing ? (
              <input
                autoFocus
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onBlur={() => {
                  addTag();
                  setTagEditing(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isComposing(e)) addTag();
                  if (e.key === "Escape" && !isComposing(e)) setTagEditing(false);
                }}
                placeholder="标签名"
                className="w-20 rounded-full border border-accent-300 bg-white px-2 py-0.5 text-[12px] outline-none"
              />
            ) : (
              <button
                onClick={() => setTagEditing(true)}
                className="flex items-center gap-0.5 rounded-full border border-dashed border-zinc-300 px-2 py-0.5 text-[12px] text-zinc-400 transition hover:border-accent-300 hover:text-accent-500"
              >
                <IconPlus width={10} height={10} />
                标签
              </button>
            )}
          </div>

          <span className="ml-auto text-[11px] text-zinc-400">
            {items.length} 项 · 更新于{" "}
            {new Date(detail.updated_at).toLocaleString("zh-CN", {
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </header>

      {/* body */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 py-4">
        {items.length === 0 && !pickerOpen && (
          <div className="mx-auto mt-10 max-w-[560px] rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-8 text-center">
            <p className="text-[14px] font-medium text-zinc-600">从这里添加第一个参数</p>
            <p className="mt-1 text-[12px] text-zinc-400">
              支持 6 种形式 · 也可以直接拖入文件或粘贴截图
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2.5">
              {ALL_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => addItem(t)}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-2 py-4 transition hover:border-accent-300 hover:bg-accent-50/50"
                >
                  <span className="text-accent-600">{TYPE_ICON[t]}</span>
                  <span className="text-[12px] font-medium text-zinc-700">
                    {ITEM_TYPE_LABEL[t]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mx-auto max-w-[720px]">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2.5">
                {items.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    revealed={revealed.has(item.id)}
                    onReveal={() => toggleReveal(item.id)}
                    onOpenImage={setLightbox}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* add row */}
          <div className="mt-3">
            {pickerOpen && (
              <div className="mb-2 grid animate-fade-in grid-cols-3 gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg">
                {ALL_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => addItem(t)}
                    className="flex flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left transition hover:bg-accent-50"
                  >
                    <span className="flex items-center gap-1.5 text-[12px] font-semibold text-zinc-700">
                      <span className="text-accent-600">
                        {TYPE_ICON[t] && (
                          <span className="scale-75 origin-left inline-flex">
                            {TYPE_ICON[t]}
                          </span>
                        )}
                      </span>
                      {ITEM_TYPE_LABEL[t]}
                    </span>
                    <span className="text-[11px] leading-snug text-zinc-400">
                      {ITEM_TYPE_DESC[t]}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => {
                const next = !pickerOpen;
                setPickerOpen(next);
                if (next) {
                  requestAnimationFrame(() =>
                    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" }),
                  );
                }
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 py-2.5 text-[13px] text-zinc-500 transition hover:border-accent-400 hover:bg-white hover:text-accent-600"
            >
              <IconPlus width={14} height={14} />
              添加参数
              <IconChevronDown
                width={12}
                height={12}
                className={`transition-transform ${pickerOpen ? "rotate-180" : ""}`}
              />
            </button>
          </div>
          <p className="mt-3 text-center text-[11px] text-zinc-300">
            拖动 ⠿ 调整顺序 · 拖入文件 / 粘贴截图直接入库
          </p>
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-10"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-lg shadow-2xl" />
        </div>
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="删除参数笔记"
      >
        <p className="text-[13px] text-zinc-600">
          确定删除「{detail.name}」？其中的 {items.length} 个参数项将一并删除，不可恢复。
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => setConfirmDelete(false)}
            className="rounded-lg px-3 py-1.5 text-[13px] text-zinc-600 hover:bg-zinc-100"
          >
            取消
          </button>
          <button
            onClick={async () => {
              setConfirmDelete(false);
              await deleteSelectedNote();
              showToast("笔记已删除");
            }}
            className="rounded-lg bg-rose-600 px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-rose-700"
          >
            删除
          </button>
        </div>
      </Modal>
    </section>
  );
}
