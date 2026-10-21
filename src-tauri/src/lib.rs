mod db;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let conn = db::open_db(app.handle())?;
            app.manage(db::DbState(std::sync::Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::list_folders,
            db::create_folder,
            db::rename_folder,
            db::delete_folder,
            db::move_folder,
            db::list_notes,
            db::get_note,
            db::create_note,
            db::update_note_meta,
            db::set_note_flag,
            db::delete_note,
            db::list_tags,
            db::list_items,
            db::create_item,
            db::update_item,
            db::delete_item,
            db::reorder_items,
            db::store_blob,
            db::read_blob_b64,
            db::read_file_b64,
            db::export_blob,
            db::open_blob_temp,
            db::search_notes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
