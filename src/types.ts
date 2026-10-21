export type ItemType = "kv" | "image" | "text" | "secret" | "file" | "url";

export interface Folder {
  id: number;
  name: string;
  parent_id: number | null;
  sort: number;
}

export interface NoteSummary {
  id: number;
  name: string;
  folder_id: number | null;
  favorite: boolean;
  sensitive: boolean;
  item_count: number;
  tags: string[];
  updated_at: number;
  created_at: number;
}

export interface Item {
  id: number;
  note_id: number;
  type: ItemType;
  title: string;
  content: string;
  meta: Record<string, unknown> | null;
  sort: number;
  created_at: number;
  updated_at: number;
}

export interface Tag {
  id: number;
  name: string;
}

export interface BlobMeta {
  id: number;
  name: string;
  mime: string;
  size: number;
}

export interface Scope {
  kind: "all" | "folder" | "tag" | "favorite" | "recent";
  folderId?: number;
  tag?: string;
}

export const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  kv: "键值对",
  image: "图片",
  text: "文本",
  secret: "密钥/密码",
  file: "文件",
  url: "URL",
};

export const ITEM_TYPE_DESC: Record<ItemType, string> = {
  kv: "一行 key = value，快速复制",
  image: "截图、二维码、设计稿",
  text: "多行文本、备注、配置片段",
  secret: "API Key、密码、Token（默认打码）",
  file: "小文件附件（≤ 20MB）",
  url: "链接地址，点击打开",
};
