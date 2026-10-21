import { useEffect } from "react";
import type { ReactNode } from "react";
import { IconX } from "./Icons";

export function Modal({
  open,
  onClose,
  title,
  children,
  width = "w-[420px]",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`${width} animate-fade-in rounded-xl bg-white shadow-2xl ring-1 ring-black/5`}>
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-zinc-800">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600"
          >
            <IconX width={14} height={14} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="animate-toast pointer-events-none fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-lg bg-zinc-900 px-4 py-2 text-[13px] text-white shadow-lg">
      {msg}
    </div>
  );
}
