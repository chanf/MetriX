import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import * as api from "../api";
import { isComposing } from "../ime";
import type { Folder } from "../types";
import {
  IconChevronDown,
  IconChevronRight,
  IconClock,
  IconFolder,
  IconFolderPlus,
  IconLayers,
  IconPlus,
  IconStar,
  IconTag,
  IconTrash,
} from "./Icons";

// 这些组件必须定义在模块级：定义在组件内部时，每次父级渲染都会产生新的组件类型，
// React 会卸载重建整棵子树，正在输入中文的 <input> 会因此被重建并重新全选，导致输入互相覆盖。
function NavItem({
  icon,
  label,
  active,
  onClick,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition ${
        active
          ? "bg-accent-600 text-white shadow-sm"
          : "text-zinc-600 hover:bg-zinc-200/60"
      }`}
    >
      <span className={active ? "text-white/90" : "text-zinc-400"}>{icon}</span>
      <span className="flex-1 truncate text-left">{label}</span>
      {count != null && count > 0 && (
        <span
          className={`text-[11px] tabular-nums ${active ? "text-white/70" : "text-zinc-400"}`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function FolderNameInput({
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  // 只在挂载时聚焦并全选一次。不能放在 onFocus 上：输入法组合期间焦点事件可能重复触发，
  // 每次都全选会让后续输入覆盖已有内容。
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !isComposing(e)) onCommit();
        if (e.key === "Escape" && !isComposing(e)) onCancel();
      }}
      onClick={(e) => e.stopPropagation()}
      className="w-full rounded border border-accent-500 bg-white px-1 text-[13px] text-zinc-800 outline-none"
    />
  );
}

type FolderTreeState = {
  folders: Folder[];
  collapsed: Set<number>;
  activeFolderId: number | null;
  editingId: number | null;
  editName: string;
  setEditName: (v: string) => void;
  commitEdit: () => void;
  cancelEdit: () => void;
  startEdit: (id: number, name: string) => void;
  toggleCollapse: (id: number) => void;
  openFolder: (id: number) => void;
  dropOn: (e: React.DragEvent, targetId: number | null) => void;
  newChild: (parentId: number) => void;
  remove: (id: number) => void;
};

function FolderNode({
  folder,
  depth,
  t,
}: {
  folder: Folder;
  depth: number;
  t: FolderTreeState;
}) {
  const kids = t.folders.filter((f) => f.parent_id === folder.id);
  const isCollapsed = t.collapsed.has(folder.id);
  const active = t.activeFolderId === folder.id;
  const editing = t.editingId === folder.id;
  return (
    <div
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-folder", String(folder.id));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => t.dropOn(e, folder.id)}
    >
      <div
        className={`group relative flex items-center gap-1 rounded-lg pr-1 transition ${
          active ? "bg-accent-600 text-white" : "text-zinc-600 hover:bg-zinc-200/60"
        }`}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        <button
          onClick={() => t.toggleCollapse(folder.id)}
          className={`p-1 ${kids.length ? "" : "invisible"} ${
            active ? "text-white/80" : "text-zinc-400"
          }`}
        >
          {isCollapsed ? (
            <IconChevronRight width={12} height={12} />
          ) : (
            <IconChevronDown width={12} height={12} />
          )}
        </button>
        <button
          onClick={() => t.openFolder(folder.id)}
          onDoubleClick={() => t.startEdit(folder.id, folder.name)}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-[13px]"
        >
          <IconFolder
            width={14}
            height={14}
            className={active ? "text-white/90" : "text-zinc-400"}
          />
          {editing ? (
            <FolderNameInput
              value={t.editName}
              onChange={t.setEditName}
              onCommit={t.commitEdit}
              onCancel={t.cancelEdit}
            />
          ) : (
            <span className="truncate">{folder.name}</span>
          )}
        </button>
        <div className="hidden items-center gap-0.5 group-hover:flex">
          <button
            onClick={() => t.newChild(folder.id)}
            title="新建子文件夹"
            className={`rounded p-1 ${active ? "text-white/80 hover:bg-white/15" : "text-zinc-400 hover:bg-zinc-300/60"}`}
          >
            <IconPlus width={12} height={12} />
          </button>
          <button
            onClick={() => t.remove(folder.id)}
            title="删除文件夹"
            className={`rounded p-1 ${active ? "text-white/80 hover:bg-white/15" : "text-zinc-400 hover:bg-zinc-300/60"}`}
          >
            <IconTrash width={12} height={12} />
          </button>
        </div>
      </div>
      {!isCollapsed && kids.length > 0 && (
        <div>
          {kids.map((k) => (
            <FolderNode key={k.id} folder={k} depth={depth + 1} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const { folders, tags, scope, setScope, refreshMeta, refreshNotes, showToast, setNewNoteOpen } =
    useStore();
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const rootFolders = folders.filter((f) => f.parent_id == null);

  const toggleCollapse = (id: number) => {
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const newFolder = async (parentId: number | null) => {
    const f = await api.createFolder("新建文件夹", parentId);
    await refreshMeta();
    setEditingId(f.id);
    setEditName(f.name);
    if (parentId != null) {
      setCollapsed((s) => {
        const n = new Set(s);
        n.delete(parentId);
        return n;
      });
    }
  };

  const commitEdit = async () => {
    if (editingId == null) return;
    const name = editName.trim();
    if (name) {
      await api.renameFolder(editingId, name).catch((e) => showToast(String(e)));
      await refreshMeta();
      await refreshNotes();
    }
    setEditingId(null);
  };

  const removeFolder = async (id: number) => {
    await api.deleteFolder(id);
    await refreshMeta();
    if (scope.kind === "folder" && scope.folderId === id) {
      await setScope({ kind: "all" });
    } else {
      await refreshNotes();
    }
    showToast("文件夹已删除（其中笔记移到未分类）");
  };

  const onDropFolder = async (e: React.DragEvent, targetId: number | null) => {
    e.preventDefault();
    e.stopPropagation();
    const raw = e.dataTransfer.getData("application/x-folder");
    if (raw) {
      const id = Number(raw);
      if (id !== targetId) {
        await api.moveFolder(id, targetId).catch((err) => showToast(String(err)));
        await refreshMeta();
      }
      return;
    }
    const noteRaw = e.dataTransfer.getData("application/x-note");
    if (noteRaw) {
      const noteId = Number(noteRaw);
      await api.updateNoteMeta(noteId, { folderId: targetId });
      await refreshNotes();
      showToast("已移动到文件夹");
    }
  };

  const t: FolderTreeState = {
    folders,
    collapsed,
    activeFolderId: scope.kind === "folder" ? (scope.folderId ?? null) : null,
    editingId,
    editName,
    setEditName,
    commitEdit,
    cancelEdit: () => setEditingId(null),
    startEdit: (id, name) => {
      setEditingId(id);
      setEditName(name);
    },
    toggleCollapse,
    openFolder: (id) => setScope({ kind: "folder", folderId: id }),
    dropOn: onDropFolder,
    newChild: (parentId) => {
      newFolder(parentId);
    },
    remove: (id) => {
      removeFolder(id);
    },
  };

  return (
    <aside
      className="flex w-[220px] shrink-0 flex-col border-r border-zinc-200 bg-zinc-100/80"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => onDropFolder(e, null)}
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-bold tracking-tight text-zinc-800">量枢</span>
          <span className="text-[11px] font-medium text-zinc-400">MetriX</span>
        </div>
        <button
          onClick={() => setNewNoteOpen(true)}
          title="新建参数笔记 (⌘N)"
          className="rounded-lg bg-accent-600 p-1.5 text-white shadow-sm transition hover:bg-accent-700"
        >
          <IconPlus width={14} height={14} />
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 px-2">
        <NavItem
          icon={<IconLayers width={15} height={15} />}
          label="全部笔记"
          active={scope.kind === "all"}
          onClick={() => setScope({ kind: "all" })}
        />
        <NavItem
          icon={<IconStar width={15} height={15} />}
          label="收藏"
          active={scope.kind === "favorite"}
          onClick={() => setScope({ kind: "favorite" })}
        />
        <NavItem
          icon={<IconClock width={15} height={15} />}
          label="最近编辑"
          active={scope.kind === "recent"}
          onClick={() => setScope({ kind: "recent" })}
        />
      </nav>

      <div className="mt-4 flex items-center justify-between px-4 pb-1">
        <span className="text-[11px] font-semibold tracking-wide text-zinc-400">文件夹</span>
        <button
          onClick={() => newFolder(null)}
          title="新建文件夹"
          className="rounded p-1 text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-600"
        >
          <IconFolderPlus width={13} height={13} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {rootFolders.length === 0 && (
          <p className="px-3 py-2 text-[12px] text-zinc-400">暂无文件夹</p>
        )}
        {rootFolders.map((f) => (
          <FolderNode key={f.id} folder={f} depth={0} t={t} />
        ))}
      </div>

      {tags.length > 0 && (
        <>
          <div className="px-4 pb-1 pt-2">
            <span className="text-[11px] font-semibold tracking-wide text-zinc-400">标签</span>
          </div>
          <div className="flex max-h-[140px] flex-wrap gap-1.5 overflow-y-auto px-3 pb-3">
            {tags.map((tag) => {
              const active = scope.kind === "tag" && scope.tag === tag.name;
              return (
                <button
                  key={tag.id}
                  onClick={() => setScope({ kind: "tag", tag: tag.name })}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] transition ${
                    active
                      ? "bg-accent-600 text-white"
                      : "bg-zinc-200/80 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  <IconTag width={11} height={11} />
                  {tag.name}
                </button>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}
