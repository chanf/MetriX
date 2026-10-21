use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

pub const MAX_BLOB_BYTES: usize = 20 * 1024 * 1024;

pub struct DbState(pub Mutex<Connection>);

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn open_db(app: &AppHandle) -> Result<Connection, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("metrix.db");
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL").map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON").map_err(|e| e.to_string())?;
    init_schema(&conn)?;
    Ok(conn)
}

fn init_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
            sort INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
            favorite INTEGER NOT NULL DEFAULT 0,
            sensitive INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS note_tags (
            note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (note_id, tag_id)
        );
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            type TEXT NOT NULL CHECK(type IN ('kv','image','text','secret','file','url')),
            title TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL DEFAULT '',
            meta TEXT NOT NULL DEFAULT '{}',
            sort INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS blobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            mime TEXT NOT NULL,
            size INTEGER NOT NULL,
            data BLOB NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_items_note ON items(note_id, sort);
        CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id);
        "#,
    )
    .map_err(|e| e.to_string())
}

// ---------- models ----------

#[derive(Serialize)]
pub struct Folder {
    pub id: i64,
    pub name: String,
    pub parent_id: Option<i64>,
    pub sort: i64,
}

#[derive(Serialize)]
pub struct NoteSummary {
    pub id: i64,
    pub name: String,
    pub folder_id: Option<i64>,
    pub favorite: bool,
    pub sensitive: bool,
    pub item_count: i64,
    pub tags: Vec<String>,
    pub updated_at: i64,
    pub created_at: i64,
}

#[derive(Serialize)]
pub struct Item {
    pub id: i64,
    pub note_id: i64,
    #[serde(rename = "type")]
    pub item_type: String,
    pub title: String,
    pub content: String,
    pub meta: Value,
    pub sort: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize)]
pub struct Tag {
    pub id: i64,
    pub name: String,
}

#[derive(Serialize)]
pub struct BlobMeta {
    pub id: i64,
    pub name: String,
    pub mime: String,
    pub size: i64,
}

// ---------- folders ----------

#[tauri::command]
pub fn list_folders(state: State<DbState>) -> Result<Vec<Folder>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, parent_id, sort FROM folders ORDER BY sort, id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Folder {
                id: r.get(0)?,
                name: r.get(1)?,
                parent_id: r.get(2)?,
                sort: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_folder(
    state: State<DbState>,
    name: String,
    parent_id: Option<i64>,
) -> Result<Folder, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("文件夹名不能为空".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let sort: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort), 0) + 1 FROM folders WHERE parent_id IS ?1",
            params![parent_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO folders (name, parent_id, sort) VALUES (?1, ?2, ?3)",
        params![name, parent_id, sort],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(Folder { id, name, parent_id, sort })
}

#[tauri::command]
pub fn rename_folder(state: State<DbState>, id: i64, name: String) -> Result<(), String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("文件夹名不能为空".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE folders SET name = ?1 WHERE id = ?2", params![name, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_folder(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM folders WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn move_folder(
    state: State<DbState>,
    id: i64,
    parent_id: Option<i64>,
) -> Result<(), String> {
    if Some(id) == parent_id {
        return Err("不能把文件夹移动到自身".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    // prevent moving into own descendant
    let mut cur = parent_id;
    while let Some(p) = cur {
        if p == id {
            return Err("不能把文件夹移动到它的子目录".into());
        }
        let parent: Option<i64> = conn
            .query_row("SELECT parent_id FROM folders WHERE id = ?1", params![p], |r| {
                r.get::<_, Option<i64>>(0)
            })
            .optional()
            .map_err(|e| e.to_string())?
            .flatten();
        cur = parent;
    }
    conn.execute(
        "UPDATE folders SET parent_id = ?1 WHERE id = ?2",
        params![parent_id, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------- notes ----------

fn tags_of(conn: &Connection, note_id: i64) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.name FROM tags t JOIN note_tags nt ON nt.tag_id = t.id
             WHERE nt.note_id = ?1 ORDER BY t.name",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![note_id], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn summary_from(conn: &Connection, id: i64) -> Result<Option<NoteSummary>, String> {
    conn.query_row(
        "SELECT id, name, folder_id, favorite, sensitive, created_at, updated_at
         FROM notes WHERE id = ?1",
        params![id],
        |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<i64>>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, i64>(5)?,
                r.get::<_, i64>(6)?,
            ))
        },
    )
    .optional()
    .map_err(|e| e.to_string())
    .map(|row| {
        row.map(|(id, name, folder_id, fav, sen, created_at, updated_at)| {
            let item_count = conn
                .query_row(
                    "SELECT COUNT(*) FROM items WHERE note_id = ?1",
                    params![id],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            NoteSummary {
                id,
                name,
                folder_id,
                favorite: fav != 0,
                sensitive: sen != 0,
                item_count,
                tags: tags_of(conn, id).unwrap_or_default(),
                updated_at,
                created_at,
            }
        })
    })
}

#[tauri::command]
pub fn list_notes(
    state: State<DbState>,
    kind: String,
    folder_id: Option<i64>,
    tag: Option<String>,
) -> Result<Vec<NoteSummary>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    match kind.as_str() {
        "folder" => {
            let fid = folder_id.ok_or("缺少文件夹")?;
            let mut stmt = conn
                .prepare(
                    "SELECT id FROM notes WHERE folder_id IN (
                        WITH RECURSIVE sub(id) AS (
                            SELECT ?1
                            UNION ALL
                            SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id
                        ) SELECT id FROM sub
                     ) ORDER BY updated_at DESC",
                )
                .map_err(|e| e.to_string())?;
            let ids: Vec<i64> = stmt
                .query_map(params![fid], |r| r.get(0))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            for id in ids {
                if let Some(s) = summary_from(&conn, id)? {
                    out.push(s);
                }
            }
        }
        "tag" => {
            let t = tag.ok_or("缺少标签")?;
            let mut stmt = conn
                .prepare(
                    "SELECT nt.note_id FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
                     WHERE t.name = ?1",
                )
                .map_err(|e| e.to_string())?;
            let ids: Vec<i64> = stmt
                .query_map(params![t], |r| r.get(0))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            for id in ids {
                if let Some(s) = summary_from(&conn, id)? {
                    out.push(s);
                }
            }
            out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        }
        "favorite" => {
            let mut stmt = conn
                .prepare("SELECT id FROM notes WHERE favorite = 1 ORDER BY updated_at DESC")
                .map_err(|e| e.to_string())?;
            let ids: Vec<i64> = stmt
                .query_map([], |r| r.get(0))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            for id in ids {
                if let Some(s) = summary_from(&conn, id)? {
                    out.push(s);
                }
            }
        }
        "recent" => {
            let mut stmt = conn
                .prepare("SELECT id FROM notes ORDER BY updated_at DESC LIMIT 50")
                .map_err(|e| e.to_string())?;
            let ids: Vec<i64> = stmt
                .query_map([], |r| r.get(0))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            for id in ids {
                if let Some(s) = summary_from(&conn, id)? {
                    out.push(s);
                }
            }
        }
        _ => {
            let mut stmt = conn
                .prepare("SELECT id FROM notes ORDER BY updated_at DESC")
                .map_err(|e| e.to_string())?;
            let ids: Vec<i64> = stmt
                .query_map([], |r| r.get(0))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            for id in ids {
                if let Some(s) = summary_from(&conn, id)? {
                    out.push(s);
                }
            }
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn get_note(state: State<DbState>, id: i64) -> Result<Option<NoteSummary>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    summary_from(&conn, id)
}

fn upsert_tags(conn: &Connection, note_id: i64, tags: &[String]) -> Result<(), String> {
    conn.execute("DELETE FROM note_tags WHERE note_id = ?1", params![note_id])
        .map_err(|e| e.to_string())?;
    for raw in tags {
        let name = raw.trim().to_string();
        if name.is_empty() {
            continue;
        }
        conn.execute("INSERT OR IGNORE INTO tags (name) VALUES (?1)", params![name])
            .map_err(|e| e.to_string())?;
        let tag_id: i64 = conn
            .query_row("SELECT id FROM tags WHERE name = ?1", params![name], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
            params![note_id, tag_id],
        )
        .map_err(|e| e.to_string())?;
    }
    // cleanup orphan tags
    conn.execute("DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM note_tags)", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn create_note(
    state: State<DbState>,
    name: String,
    folder_id: Option<i64>,
    tags: Vec<String>,
) -> Result<NoteSummary, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("笔记名不能为空".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let ts = now_ms();
    conn.execute(
        "INSERT INTO notes (name, folder_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
        params![name, folder_id, ts],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    upsert_tags(&conn, id, &tags)?;
    summary_from(&conn, id)?.ok_or_else(|| "创建失败".to_string())
}

#[tauri::command]
pub fn update_note_meta(
    state: State<DbState>,
    id: i64,
    name: Option<String>,
    folder_id: Option<Option<i64>>,
    tags: Option<Vec<String>>,
) -> Result<NoteSummary, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(n) = name.as_deref().map(str::trim) {
        if n.is_empty() {
            return Err("笔记名不能为空".into());
        }
        conn.execute(
            "UPDATE notes SET name = ?1, updated_at = ?2 WHERE id = ?3",
            params![n, now_ms(), id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(fid) = folder_id {
        conn.execute(
            "UPDATE notes SET folder_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![fid, now_ms(), id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(t) = tags {
        upsert_tags(&conn, id, &t)?;
        conn.execute("UPDATE notes SET updated_at = ?1 WHERE id = ?2", params![now_ms(), id])
            .map_err(|e| e.to_string())?;
    }
    summary_from(&conn, id)?.ok_or_else(|| "笔记不存在".to_string())
}

#[tauri::command]
pub fn set_note_flag(state: State<DbState>, id: i64, flag: String, value: bool) -> Result<(), String> {
    let col = match flag.as_str() {
        "favorite" => "favorite",
        "sensitive" => "sensitive",
        _ => return Err("未知标记".into()),
    };
    let sql = format!("UPDATE notes SET {col} = ?1, updated_at = ?2 WHERE id = ?3");
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(&sql, params![value as i64, now_ms(), id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_note(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    // collect blob ids first
    let mut blob_ids: Vec<i64> = Vec::new();
    {
        let mut stmt = conn
            .prepare("SELECT meta FROM items WHERE note_id = ?1 AND type IN ('image','file')")
            .map_err(|e| e.to_string())?;
        let metas: Vec<String> = stmt
            .query_map(params![id], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        for m in metas {
            if let Ok(v) = serde_json::from_str::<Value>(&m) {
                if let Some(bid) = v.get("blobId").and_then(|x| x.as_i64()) {
                    blob_ids.push(bid);
                }
            }
        }
    }
    conn.execute("DELETE FROM notes WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    for bid in blob_ids {
        conn.execute("DELETE FROM blobs WHERE id = ?1", params![bid])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn list_tags(state: State<DbState>) -> Result<Vec<Tag>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name FROM tags ORDER BY name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok(Tag { id: r.get(0)?, name: r.get(1)? }))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

// ---------- items ----------

fn row_to_item(r: &rusqlite::Row) -> rusqlite::Result<Item> {
    let meta_str: String = r.get(5)?;
    Ok(Item {
        id: r.get(0)?,
        note_id: r.get(1)?,
        item_type: r.get(2)?,
        title: r.get(3)?,
        content: r.get(4)?,
        meta: serde_json::from_str(&meta_str).unwrap_or(Value::Null),
        sort: r.get(6)?,
        created_at: r.get(7)?,
        updated_at: r.get(8)?,
    })
}

#[tauri::command]
pub fn list_items(state: State<DbState>, note_id: i64) -> Result<Vec<Item>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, note_id, type, title, content, meta, sort, created_at, updated_at
             FROM items WHERE note_id = ?1 ORDER BY sort, id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![note_id], row_to_item)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_item(
    state: State<DbState>,
    note_id: i64,
    item_type: String,
    title: String,
) -> Result<Item, String> {
    const TYPES: [&str; 6] = ["kv", "image", "text", "secret", "file", "url"];
    if !TYPES.contains(&item_type.as_str()) {
        return Err("未知参数类型".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let sort: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort), 0) + 1 FROM items WHERE note_id = ?1",
            params![note_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let ts = now_ms();
    conn.execute(
        "INSERT INTO items (note_id, type, title, content, meta, sort, created_at, updated_at)
         VALUES (?1, ?2, ?3, '', '{}', ?4, ?5, ?5)",
        params![note_id, item_type, title.trim(), sort, ts],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE notes SET updated_at = ?1 WHERE id = ?2",
        params![ts, note_id],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let mut stmt = conn
        .prepare(
            "SELECT id, note_id, type, title, content, meta, sort, created_at, updated_at
             FROM items WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;
    stmt.query_row(params![id], row_to_item).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_item(
    state: State<DbState>,
    id: i64,
    title: Option<String>,
    content: Option<String>,
    meta: Option<Value>,
) -> Result<Item, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(t) = title {
        conn.execute("UPDATE items SET title = ?1 WHERE id = ?2", params![t, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(c) = content {
        conn.execute("UPDATE items SET content = ?1 WHERE id = ?2", params![c, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(m) = meta {
        let s = serde_json::to_string(&m).map_err(|e| e.to_string())?;
        conn.execute("UPDATE items SET meta = ?1 WHERE id = ?2", params![s, id])
            .map_err(|e| e.to_string())?;
    }
    let ts = now_ms();
    conn.execute("UPDATE items SET updated_at = ?1 WHERE id = ?2", params![ts, id])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE notes SET updated_at = ?1 WHERE id = (SELECT note_id FROM items WHERE id = ?2)",
        params![ts, id],
    )
    .map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, note_id, type, title, content, meta, sort, created_at, updated_at
             FROM items WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;
    stmt.query_row(params![id], row_to_item).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_item(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let meta_str: Option<String> = conn
        .query_row("SELECT meta FROM items WHERE id = ?1", params![id], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();
    conn.execute("DELETE FROM items WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    if let Some(m) = meta_str {
        if let Ok(v) = serde_json::from_str::<Value>(&m) {
            if let Some(bid) = v.get("blobId").and_then(|x| x.as_i64()) {
                conn.execute("DELETE FROM blobs WHERE id = ?1", params![bid])
                    .map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn reorder_items(state: State<DbState>, note_id: i64, ids: Vec<i64>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    for (i, id) in ids.iter().enumerate() {
        conn.execute(
            "UPDATE items SET sort = ?1 WHERE id = ?2 AND note_id = ?3",
            params![i as i64 + 1, id, note_id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------- blobs ----------

#[tauri::command]
pub fn store_blob(
    state: State<DbState>,
    name: String,
    mime: String,
    data_b64: String,
) -> Result<BlobMeta, String> {
    let data = B64.decode(data_b64.trim()).map_err(|e| format!("解码失败: {e}"))?;
    if data.len() > MAX_BLOB_BYTES {
        return Err(format!(
            "文件超过 20MB 上限（当前 {:.1}MB）",
            data.len() as f64 / 1024.0 / 1024.0
        ));
    }
    let size = data.len() as i64;
    let mime = if mime.trim().is_empty() {
        "application/octet-stream".to_string()
    } else {
        mime
    };
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO blobs (name, mime, size, data) VALUES (?1, ?2, ?3, ?4)",
        params![name, mime, size, data],
    )
    .map_err(|e| e.to_string())?;
    Ok(BlobMeta { id: conn.last_insert_rowid(), name, mime, size })
}

#[tauri::command]
pub fn read_blob_b64(state: State<DbState>, id: i64) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let data: Vec<u8> = conn
        .query_row("SELECT data FROM blobs WHERE id = ?1", params![id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    Ok(B64.encode(data))
}

#[tauri::command]
pub fn read_file_b64(path: String) -> Result<serde_json::Value, String> {
    let p = PathBuf::from(&path);
    let data = std::fs::read(&p).map_err(|e| format!("读取文件失败: {e}"))?;
    if data.len() > MAX_BLOB_BYTES {
        return Err(format!(
            "文件超过 20MB 上限（当前 {:.1}MB）",
            data.len() as f64 / 1024.0 / 1024.0
        ));
    }
    let name = p
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".into());
    let mime = mime_guess_from_name(&name);
    Ok(serde_json::json!({
        "name": name,
        "mime": mime,
        "size": data.len(),
        "dataB64": B64.encode(data),
    }))
}

fn mime_guess_from_name(name: &str) -> String {
    let ext = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "txt" | "log" | "md" => "text/plain; charset=utf-8",
        "json" => "application/json",
        "xml" => "application/xml",
        "yaml" | "yml" => "text/yaml",
        "toml" => "application/toml",
        "csv" => "text/csv",
        "pdf" => "application/pdf",
        "zip" => "application/zip",
        "gz" | "tgz" => "application/gzip",
        "tar" => "application/x-tar",
        "7z" => "application/x-7z-compressed",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "mp4" => "video/mp4",
        "html" | "htm" => "text/html",
        "js" | "mjs" => "text/javascript",
        "ts" => "text/typescript",
        "py" => "text/x-python",
        "rs" => "text/rust",
        _ => "application/octet-stream",
    };
    mime.to_string()
}

#[tauri::command]
pub fn export_blob(state: State<DbState>, id: i64, dest: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let data: Vec<u8> = conn
        .query_row("SELECT data FROM blobs WHERE id = ?1", params![id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    drop(conn);
    std::fs::write(&dest, data).map_err(|e| format!("写入失败: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn open_blob_temp(app: AppHandle, state: State<DbState>, id: i64) -> Result<(), String> {
    let (data, name) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let row: (Vec<u8>, String) = conn
            .query_row("SELECT data, name FROM blobs WHERE id = ?1", params![id], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .map_err(|e| e.to_string())?;
        row
    };
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("tmp_open");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let safe: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let path = dir.join(format!("{id}_{}", safe));
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    tauri_plugin_opener::open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}

// ---------- search ----------

fn escape_like(q: &str) -> String {
    q.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
}

#[tauri::command]
pub fn search_notes(state: State<DbState>, query: String) -> Result<Vec<NoteSummary>, String> {
    let q = format!("%{}%", escape_like(query.trim()));
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT n.id FROM notes n
             LEFT JOIN items i ON i.note_id = n.id
             WHERE n.name LIKE ?1 ESCAPE '\\'
                OR n.id IN (SELECT nt.note_id FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE t.name LIKE ?1 ESCAPE '\\')
                OR (i.type != 'secret' AND (i.title LIKE ?1 ESCAPE '\\' OR i.content LIKE ?1 ESCAPE '\\'))
             ORDER BY n.updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let ids: Vec<i64> = stmt
        .query_map(params![q], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for id in ids {
        if let Some(s) = summary_from(&conn, id)? {
            out.push(s);
        }
    }
    Ok(out)
}
