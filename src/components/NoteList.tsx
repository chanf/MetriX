import { useStore } from "../store";
import { IconFolder, IconStar, IconTag } from "./Icons";

export function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(ms).toLocaleDateString("zh-CN");
}

export function NoteList() {
  const { notes, scope, selectedNoteId, openNote, folders, setNewNoteOpen } = useStore();

  const folderName = (id: number | null | undefined) =>
    id == null ? null : (folders.find((f) => f.id === id)?.name ?? null);
  const title =
    scope.kind === "folder"
      ? (folderName(scope.folderId) ?? "文件夹")
      : scope.kind === "tag"
        ? `# ${scope.tag}`
        : scope.kind === "favorite"
          ? "收藏"
          : scope.kind === "recent"
            ? "最近编辑"
            : "全部笔记";

  return (
    <section className="flex w-[300px] shrink-0 flex-col border-r border-zinc-200 bg-white">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h1 className="text-[14px] font-semibold text-zinc-800">{title}</h1>
        <span className="text-[12px] text-zinc-400 tabular-nums">{notes.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {notes.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-2 px-6 text-center">
            <p className="text-[13px] text-zinc-500">这里还没有笔记</p>
            <button
              onClick={() => setNewNoteOpen(true)}
              className="mt-1 rounded-lg bg-accent-50 px-3 py-1.5 text-[12px] font-medium text-accent-700 transition hover:bg-accent-100"
            >
              + 新建参数笔记
            </button>
          </div>
        )}
        {notes.map((n) => {
          const active = n.id === selectedNoteId;
          return (
            <button
              key={n.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-note", String(n.id));
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => openNote(n.id)}
              className={`mb-1 w-full rounded-lg px-3 py-2.5 text-left transition ${
                active ? "bg-accent-50 ring-1 ring-accent-200" : "hover:bg-zinc-50"
              }`}
            >
              <div className="flex items-center gap-1.5">
                {n.sensitive && (
                  <span className="text-[11px]" title="敏感笔记">
                    🔒
                  </span>
                )}
                <span className="flex-1 truncate text-[13px] font-medium text-zinc-800">
                  {n.name}
                </span>
                {n.favorite && (
                  <IconStar
                    width={12}
                    height={12}
                    className="shrink-0 text-amber-400"
                    fill="currentColor"
                  />
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-400">
                {folderName(n.folder_id) && (
                  <span className="flex items-center gap-0.5">
                    <IconFolder width={10} height={10} />
                    {folderName(n.folder_id)}
                  </span>
                )}
                <span className="ml-auto tabular-nums">{n.item_count} 项</span>
                <span>·</span>
                <span>{timeAgo(n.updated_at)}</span>
              </div>
              {n.tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {n.tags.slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="flex items-center gap-0.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500"
                    >
                      <IconTag width={9} height={9} />
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
