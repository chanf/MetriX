import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { isComposing } from "../ime";
import { IconFolder, IconSearch, IconTag } from "./Icons";
import { timeAgo } from "./NoteList";

export function SearchPalette() {
  const { searchOpen, setSearchOpen, doSearch, searchResults, searchLoading, openNote, folders } =
    useStore();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(!searchOpen);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [searchOpen, setSearchOpen]);

  useEffect(() => {
    if (searchOpen) {
      setQ("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [searchOpen]);

  useEffect(() => {
    const t = setTimeout(() => doSearch(q), 150);
    return () => clearTimeout(t);
  }, [q, doSearch]);

  if (!searchOpen) return null;

  const pick = (id: number) => {
    setSearchOpen(false);
    openNote(id);
  };

  const folderName = (id: number | null) =>
    id == null ? null : (folders.find((f) => f.id === id)?.name ?? null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setSearchOpen(false);
      }}
    >
      <div className="animate-fade-in w-[560px] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center gap-2.5 border-b border-zinc-100 px-4 py-3">
          <IconSearch width={16} height={16} className="text-zinc-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearchOpen(false);
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, searchResults.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              }
              if (e.key === "Enter" && !isComposing(e) && searchResults[cursor]) {
                pick(searchResults[cursor].id);
              }
            }}
            placeholder="搜索笔记名、标签、参数、文本…（密钥内容不参与搜索）"
            className="flex-1 bg-transparent text-[14px] text-zinc-800 outline-none placeholder:text-zinc-400"
          />
          {searchLoading && <span className="text-[11px] text-zinc-400">搜索中…</span>}
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-1.5">
          {q.trim() && searchResults.length === 0 && !searchLoading && (
            <p className="px-4 py-6 text-center text-[13px] text-zinc-400">没有匹配的笔记</p>
          )}
          {!q.trim() && (
            <p className="px-4 py-6 text-center text-[13px] text-zinc-400">
              输入关键字开始搜索，Enter 打开
            </p>
          )}
          {searchResults.map((n, i) => (
            <button
              key={n.id}
              onMouseEnter={() => setCursor(i)}
              onClick={() => pick(n.id)}
              className={`flex w-full items-center gap-2 px-4 py-2.5 text-left ${
                i === cursor ? "bg-accent-50" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {n.sensitive && <span className="text-[11px]">🔒</span>}
                  <span className="truncate text-[13px] font-medium text-zinc-800">{n.name}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-400">
                  {folderName(n.folder_id) && (
                    <span className="flex items-center gap-0.5">
                      <IconFolder width={10} height={10} />
                      {folderName(n.folder_id)}
                    </span>
                  )}
                  {n.tags.slice(0, 2).map((t) => (
                    <span key={t} className="flex items-center gap-0.5">
                      <IconTag width={9} height={9} />#{t}
                    </span>
                  ))}
                  <span className="ml-auto">{timeAgo(n.updated_at)}</span>
                </div>
              </div>
              <span className="text-[11px] text-zinc-300 tabular-nums">{n.item_count} 项</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 border-t border-zinc-100 bg-zinc-50/60 px-4 py-2 text-[11px] text-zinc-400">
          <span>↑↓ 选择</span>
          <span>Enter 打开</span>
          <span>Esc 关闭</span>
        </div>
      </div>
    </div>
  );
}
