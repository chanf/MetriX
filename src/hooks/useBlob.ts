import { useEffect, useState } from "react";
import { readBlobB64 } from "../api";

const cache = new Map<number, string>();
const pending = new Map<number, Promise<string>>();

export function blobDataUrl(blobId: number): Promise<string> {
  const hit = cache.get(blobId);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(blobId);
  if (!p) {
    p = readBlobB64(blobId).then((b64) => {
      const mime = mimeCache.get(blobId) ?? "application/octet-stream";
      const url = `data:${mime};base64,${b64}`;
      cache.set(blobId, url);
      pending.delete(blobId);
      return url;
    });
    pending.set(blobId, p);
  }
  return p;
}

const mimeCache = new Map<number, string>();

export function rememberMime(blobId: number, mime: string) {
  mimeCache.set(blobId, mime);
}

export function useBlobUrl(blobId: number | undefined, mime?: string): string | null {
  const [url, setUrl] = useState<string | null>(
    blobId != null ? (cache.get(blobId) ?? null) : null,
  );
  useEffect(() => {
    if (blobId == null) {
      setUrl(null);
      return;
    }
    if (mime) rememberMime(blobId, mime);
    let alive = true;
    blobDataUrl(blobId)
      .then((u) => {
        if (alive) setUrl(u);
      })
      .catch(() => {
        if (alive) setUrl(null);
      });
    return () => {
      alive = false;
    };
  }, [blobId, mime]);
  return url;
}

export function invalidateBlob(blobId: number) {
  cache.delete(blobId);
}
