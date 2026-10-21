import { useEffect, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open } from "@tauri-apps/plugin-dialog";
import { isComposing } from "../ime";
import * as api from "../api";
import { useStore } from "../store";
import { useBlobUrl } from "../hooks/useBlob";
import type { Item } from "../types";
import {
  IconCheck,
  IconComment,
  IconCopy,
  IconDownload,
  IconExternal,
  IconEye,
  IconEyeOff,
  IconFile,
  IconGrip,
  IconImage,
  IconTrash,
} from "./Icons";

async function copyText(text: string, showToast: (m: string) => void) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("已复制到剪贴板");
  } catch {
    showToast("复制失败");
  }
}

function CopyBtn({ text, title = "复制" }: { text: string; title?: string }) {
  const showToast = useStore((s) => s.showToast);
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => copyText(text, showToast).then(() => {
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      })}
      title={title}
      className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
    >
      {done ? (
        <IconCheck width={14} height={14} className="text-emerald-500" />
      ) : (
        <IconCopy width={14} height={14} />
      )}
    </button>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  kv: { label: "KV", cls: "bg-sky-50 text-sky-600 ring-sky-200" },
  image: { label: "IMG", cls: "bg-violet-50 text-violet-600 ring-violet-200" },
  text: { label: "TXT", cls: "bg-zinc-50 text-zinc-500 ring-zinc-200" },
  secret: { label: "SEC", cls: "bg-rose-50 text-rose-600 ring-rose-200" },
  file: { label: "FILE", cls: "bg-amber-50 text-amber-600 ring-amber-200" },
  url: { label: "URL", cls: "bg-emerald-50 text-emerald-600 ring-emerald-200" },
};

export function ItemCard({
  item,
  revealed,
  onReveal,
  onOpenImage,
}: {
  item: Item;
  revealed: boolean;
  onReveal: () => void;
  onOpenImage: (url: string) => void;
}) {
  const { patchItemLocal, removeItemLocal, reloadItems, showToast } = useStore();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const [localTitle, setLocalTitle] = useState(item.title);
  const [localContent, setLocalContent] = useState(item.content);
  const [menuOpen, setMenuOpen] = useState(false);
  const [textExpanded, setTextExpanded] = useState(item.type !== "text" || item.content.trim() === "");
  const remark = typeof item.meta?.remark === "string" ? item.meta.remark : "";
  const [localRemark, setLocalRemark] = useState(remark);
  const [editRemark, setEditRemark] = useState(false);

  useEffect(() => setLocalTitle(item.title), [item.title]);
  useEffect(() => setLocalContent(item.content), [item.content]);
  useEffect(() => setLocalRemark(remark), [remark]);

  const saveRemark = async () => {
    if (localRemark === remark) return;
    const meta = { ...(item.meta ?? {}), remark: localRemark };
    const updated = await api.updateItem(item.id, { meta });
    patchItemLocal(item.id, { meta: updated.meta });
  };

  const saveTitle = async () => {
    if (localTitle === item.title) return;
    const updated = await api.updateItem(item.id, { title: localTitle });
    patchItemLocal(item.id, { title: updated.title });
  };
  const saveContent = async () => {
    if (localContent === item.content) return;
    const updated = await api.updateItem(item.id, { content: localContent });
    patchItemLocal(item.id, { content: updated.content });
  };

  const attachFile = async () => {
    try {
      const filters =
        item.type === "image"
          ? [{ name: "图片", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"] }]
          : undefined;
      const picked = await open({ multiple: false, filters, title: item.type === "image" ? "选择图片" : "选择文件" });
      if (!picked || Array.isArray(picked)) return;
      const f = await api.readFileB64(picked);
      const blob = await api.storeBlob(f.name, f.mime, f.dataB64);
      const updated = await api.updateItem(item.id, {
        meta: { blobId: blob.id, name: blob.name, mime: blob.mime, size: blob.size },
      });
      patchItemLocal(item.id, { meta: updated.meta });
      showToast(`已添加${item.type === "image" ? "图片" : "文件"}：${blob.name}`);
    } catch (err) {
      showToast(String(err));
    }
  };

  const remove = async () => {    await api.deleteItem(item.id);
    removeItemLocal(item.id);
    reloadItems();
    showToast("已删除参数项");
  };

  const meta = (item.meta ?? {}) as {
    blobId?: number;
    name?: string;
    mime?: string;
    size?: number;
  };

  const badge = TYPE_BADGE[item.type] ?? TYPE_BADGE.kv;
  const showSecret = revealed;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative rounded-xl border bg-white p-3 transition ${
        isDragging ? "z-10 border-accent-300 shadow-lg" : "border-zinc-200 hover:border-zinc-300"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab rounded p-1 text-zinc-300 opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
          title="拖拽排序"
        >
          <IconGrip width={14} height={14} />
        </button>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${badge.cls}`}
        >
          {badge.label}
        </span>

        {item.type === "image" || item.type === "file" ? (
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-700">
            {meta.name ?? (item.type === "image" ? "图片" : "文件")}
            {meta.size != null && (
              <span className="ml-2 text-[11px] font-normal text-zinc-400">
                {formatSize(meta.size)}
              </span>
            )}
          </span>
        ) : (
          <input
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isComposing(e)) (e.target as HTMLInputElement).blur();
            }}
            placeholder={item.type === "secret" ? "用途（如：生产环境 API Key）" : "标题"}
            className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-zinc-800 outline-none placeholder:font-normal placeholder:text-zinc-300"
          />
        )}

        <div className="flex items-center opacity-0 transition group-hover:opacity-100">
          {item.type === "secret" && (
            <button
              onClick={onReveal}
              title={showSecret ? "隐藏" : "显示"}
              className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
            >
              {showSecret ? <IconEye width={14} height={14} /> : <IconEyeOff width={14} height={14} />}
            </button>
          )}
          <button
            onClick={() => setEditRemark(true)}
            title={remark ? "编辑备注" : "添加备注"}
            className={`rounded-md p-1.5 transition hover:bg-zinc-100 ${
              remark ? "text-accent-500 hover:text-accent-600" : "text-zinc-400 hover:text-zinc-700"
            }`}
          >
            <IconComment width={14} height={14} />
          </button>
          {item.type === "kv" && (localTitle || localContent) && (
            <CopyBtn text={`${localTitle}=${localContent}`} title="复制 key=value" />
          )}
          {item.type === "secret" && showSecret && localContent && <CopyBtn text={localContent} />}
          {item.type === "text" && localContent && <CopyBtn text={localContent} />}
          {item.type === "url" && localContent && <CopyBtn text={localContent} />}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              title="更多"
              className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
            >
              <IconTrash width={14} height={14} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-8 z-30 w-36 animate-fade-in rounded-lg border border-zinc-200 bg-white p-1 shadow-lg">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      remove();
                    }}
                    className="w-full rounded-md px-2.5 py-1.5 text-left text-[12px] text-rose-600 transition hover:bg-rose-50"
                  >
                    删除此项
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-1.5 pl-7">
        {item.type === "kv" && (
          <input
            value={localContent}
            onChange={(e) => setLocalContent(e.target.value)}
            onBlur={saveContent}
            placeholder="value"
            spellCheck={false}
            className="w-full rounded-lg bg-zinc-50 px-3 py-2 font-mono text-[13px] text-zinc-700 outline-none transition placeholder:font-sans placeholder:text-zinc-300 focus:bg-white focus:ring-1 focus:ring-accent-300"
          />
        )}

        {item.type === "secret" && (
          <div className="flex items-center gap-1.5">
            <input
              value={showSecret ? localContent : "••••••••••••"}
              onChange={(e) => setLocalContent(e.target.value)}
              onFocus={() => {
                if (!showSecret) onReveal();
              }}
              onBlur={saveContent}
              readOnly={!showSecret}
              placeholder="粘贴密钥或密码"
              spellCheck={false}
              type={showSecret ? "text" : "password"}
              className="w-full rounded-lg bg-rose-50/50 px-3 py-2 font-mono text-[13px] text-zinc-700 outline-none transition placeholder:font-sans placeholder:text-zinc-300 focus:bg-rose-50 focus:ring-1 focus:ring-rose-200"
            />
          </div>
        )}

        {item.type === "text" &&
          (textExpanded ? (
            <textarea
              autoFocus
              value={localContent}
              onChange={(e) => setLocalContent(e.target.value)}
              onBlur={() => {
                saveContent();
                if (localContent.trim() !== "") setTextExpanded(false);
              }}
              placeholder="输入多行文本…"
              rows={Math.min(12, Math.max(3, localContent.split("\n").length))}
              spellCheck={false}
              className="w-full resize-y rounded-lg bg-zinc-50 px-3 py-2 text-[13px] leading-relaxed text-zinc-700 outline-none transition placeholder:text-zinc-300 focus:bg-white focus:ring-1 focus:ring-accent-300"
            />
          ) : (
            <button
              onClick={() => setTextExpanded(true)}
              title="点击展开编辑"
              className="flex w-full items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-left transition hover:bg-zinc-100"
            >
              <span className="min-w-0 flex-1 truncate text-[13px] leading-relaxed text-zinc-500">
                {localContent.split("\n").find((l) => l.trim() !== "") ?? "空文本"}
              </span>
              <span className="shrink-0 text-[11px] text-zinc-400 tabular-nums">
                {localContent.split("\n").length} 行
              </span>
              <span className="shrink-0 text-[11px] text-zinc-300">点击展开</span>
            </button>
          ))}

        {item.type === "url" && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50/50 px-3 py-2">
            <input
              value={localContent}
              onChange={(e) => setLocalContent(e.target.value)}
              onBlur={saveContent}
              placeholder="https://…"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-emerald-800 outline-none placeholder:font-sans placeholder:text-zinc-300"
            />
            {localContent && (
              <button
                onClick={() => openUrl(localContent).catch(() => showToast("无法打开链接"))}
                title="在浏览器打开"
                className="rounded-md p-1 text-emerald-600 transition hover:bg-emerald-100"
              >
                <IconExternal width={14} height={14} />
              </button>
            )}
          </div>
        )}

        {item.type === "image" &&
          (meta.blobId != null ? (
            <ImageBody blobId={meta.blobId} mime={meta.mime} onOpen={onOpenImage} />
          ) : (
            <EmptySlot
              icon={<IconImage width={18} height={18} />}
              label="点击选择图片"
              hint="或直接拖入窗口 / 粘贴截图（⌘V）"
              onClick={attachFile}
            />
          ))}

        {item.type === "file" &&
          (meta.blobId != null ? (
            <FileBody blobId={meta.blobId} name={meta.name ?? "file"} />
          ) : (
            <EmptySlot
              icon={<IconFile width={18} height={18} />}
              label="点击选择文件"
              hint="或直接拖入窗口（≤ 20MB）"
              onClick={attachFile}
            />
          ))}
      </div>

      {/* remark */}
      {(editRemark || remark) && (
        <div className="mt-1.5 pl-7">
          {editRemark ? (
            <input
              autoFocus
              value={localRemark}
              onChange={(e) => setLocalRemark(e.target.value)}
              onBlur={() => {
                saveRemark();
                setEditRemark(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isComposing(e)) (e.target as HTMLInputElement).blur();
                if (e.key === "Escape" && !isComposing(e)) {
                  setLocalRemark(remark);
                  setEditRemark(false);
                }
              }}
              placeholder="备注（可选），回车确认"
              className="w-full rounded-md border border-dashed border-zinc-300 bg-transparent px-2 py-1 text-[12px] text-zinc-500 outline-none focus:border-accent-400 focus:bg-white"
            />
          ) : (
            <button
              onClick={() => setEditRemark(true)}
              title="点击编辑备注"
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[12px] text-zinc-400 transition hover:bg-zinc-50 hover:text-zinc-600"
            >
              <span className="shrink-0 text-zinc-300">备注</span>
              <span className="truncate">{remark}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EmptySlot({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full flex-col items-center gap-1 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 px-3 py-5 text-center transition hover:border-accent-400 hover:bg-accent-50/50"
    >
      <span className="text-zinc-400">{icon}</span>
      <span className="text-[13px] font-medium text-zinc-600">{label}</span>
      <span className="text-[11px] text-zinc-400">{hint}</span>
    </button>
  );
}

function ImageBody({ blobId, mime, onOpen }: { blobId: number; mime?: string; onOpen: (url: string) => void }) {
  const url = useBlobUrl(blobId, mime);
  if (!url) {
    return <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />;
  }
  return (
    <div className="flex items-start gap-2">
      <button
        onClick={() => onOpen(url)}
        className="block max-h-[96px] max-w-[160px] overflow-hidden rounded-lg border border-zinc-200 transition hover:border-accent-300"
        title="点击预览"
      >
        <img src={url} alt="" className="max-h-[96px] max-w-[160px] object-contain" />
      </button>
      <ExportBtn blobId={blobId} name="image" />
    </div>
  );
}

function FileBody({ blobId, name }: { blobId: number; name: string }) {
  const showToast = useStore((s) => s.showToast);
  return (
    <div className="flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2">
      <IconFile width={18} height={18} className="shrink-0 text-zinc-400" />
      <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-700">{name}</span>
      <button
        onClick={() => api.openBlobTemp(blobId).catch((e) => showToast(String(e)))}
        className="rounded-md px-2 py-1 text-[12px] text-zinc-500 transition hover:bg-zinc-200"
      >
        打开
      </button>
      <ExportBtn blobId={blobId} name={name} />
    </div>
  );
}

function ExportBtn({ blobId, name }: { blobId: number; name: string }) {
  const showToast = useStore((s) => s.showToast);
  return (
    <button
      onClick={() =>
        api
          .exportBlob(blobId, name)
          .then((ok) => {
            if (ok) showToast("已导出");
          })
          .catch((e) => showToast(String(e)))
      }
      className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-zinc-500 transition hover:bg-zinc-200"
    >
      <IconDownload width={12} height={12} />
      另存为
    </button>
  );
}
