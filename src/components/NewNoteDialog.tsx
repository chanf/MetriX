import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { isComposing } from "../ime";
import { Modal } from "./ui";

export function NewNoteDialog() {
  const { newNoteOpen, setNewNoteOpen, createNote, folders, showToast } = useStore();
  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState<number | null>(null);
  const [tagsRaw, setTagsRaw] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (newNoteOpen) {
      setName("");
      setFolderId(null);
      setTagsRaw("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [newNoteOpen]);

  const submit = async () => {
    const n = name.trim();
    if (!n) {
      showToast("请输入笔记名字");
      return;
    }
    const tags = tagsRaw
      .split(/[,，\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    await createNote(n, folderId, tags).catch((e) => showToast(String(e)));
  };

  const flat = (() => {
    const out: { id: number; label: string }[] = [];
    const walk = (parent: number | null, depth: number) => {
      for (const f of folders.filter((x) => x.parent_id === parent)) {
        out.push({ id: f.id, label: "　".repeat(depth) + f.name });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  })();

  return (
    <Modal open={newNoteOpen} onClose={() => setNewNoteOpen(false)} title="新建参数笔记">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-zinc-600">名字</span>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isComposing(e)) submit();
            }}
            placeholder="例如：生产环境 API、支付服务配置"
            className="rounded-lg border border-zinc-200 px-3 py-2 text-[13px] outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-100"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-zinc-600">文件夹（可选）</span>
          <select
            value={folderId ?? ""}
            onChange={(e) => setFolderId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px] outline-none transition focus:border-accent-500"
          >
            <option value="">未分类</option>
            {flat.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-zinc-600">标签（可选，逗号分隔）</span>
          <input
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isComposing(e)) submit();
            }}
            placeholder="api, 生产, 待迁移"
            className="rounded-lg border border-zinc-200 px-3 py-2 text-[13px] outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-100"
          />
        </label>
        <div className="mt-1 flex justify-end gap-2">
          <button
            onClick={() => setNewNoteOpen(false)}
            className="rounded-lg px-3 py-1.5 text-[13px] text-zinc-600 transition hover:bg-zinc-100"
          >
            取消
          </button>
          <button
            onClick={submit}
            className="rounded-lg bg-accent-600 px-4 py-1.5 text-[13px] font-medium text-white shadow-sm transition hover:bg-accent-700"
          >
            创建并开始
          </button>
        </div>
      </div>
    </Modal>
  );
}
