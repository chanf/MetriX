mod db;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent,
};

fn show_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let conn = db::open_db(app.handle())?;
            app.manage(db::DbState(std::sync::Mutex::new(conn)));

            let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出 MetriX", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-icon-template.png"))?;
            TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .icon_as_template(true)
                .tooltip("量枢 MetriX")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        let visible = app
                            .get_webview_window("main")
                            .map(|w| w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false))
                            .unwrap_or(false);
                        if visible {
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.hide();
                            }
                        } else {
                            show_main(app);
                        }
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    // 关闭窗口时隐藏到菜单栏，应用继续在后台运行
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
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
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // macOS：点击 Dock 图标时恢复主窗口
            if let RunEvent::Reopen { .. } = event {
                show_main(app);
            }
        });
}
