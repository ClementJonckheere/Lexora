//! Lexora — couche native.
//!
//! Le Rust reste volontairement mince : il expose une connexion SQLite unique
//! (rusqlite, SQLite embarqué), la lecture/écriture de fichiers choisis par
//! l'utilisateur et des sauvegardes automatiques. Toute la logique métier
//! (notes, FSRS, statistiques) vit côté TypeScript et est testée.

mod db;
mod oauth;

use db::{AppDb, ExecResult};
use serde::Serialize;
use serde_json::{Map, Value};
use tauri::{Manager, State};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: String,
    db_path: String,
    backup_dir: String,
}

#[tauri::command]
fn db_select(db: State<'_, AppDb>, sql: String, params: Vec<Value>) -> Result<Vec<Map<String, Value>>, String> {
    db.select(&sql, &params)
}

#[tauri::command]
fn db_execute(db: State<'_, AppDb>, sql: String, params: Vec<Value>) -> Result<ExecResult, String> {
    db.execute(&sql, &params)
}

#[tauri::command]
fn app_info(app: tauri::AppHandle, db: State<'_, AppDb>) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        db_path: db.path.display().to_string(),
        backup_dir: db.backup_dir.display().to_string(),
    }
}

/// Copie cohérente de la base dans le dossier des sauvegardes (VACUUM INTO).
#[tauri::command]
fn backup_now(db: State<'_, AppDb>) -> Result<String, String> {
    db.backup_to_dir().map(|p| p.display().to_string())
}

/// Connexion Google : écoute le retour du navigateur sur 127.0.0.1 et renvoie le port.
#[tauri::command]
fn oauth_start(app: tauri::AppHandle) -> Result<u16, String> {
    oauth::start(app)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Lecture impossible de {path} : {e}"))
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("Écriture impossible de {path} : {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        // Une seule instance : relancer Lexora ramène la fenêtre existante au premier plan.
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.unminimize();
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }))
            .plugin(tauri_plugin_global_shortcut::Builder::new().build());
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let db = AppDb::open(&data_dir).map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;
            if let Err(e) = db.auto_backup() {
                eprintln!("Sauvegarde automatique impossible : {e}");
            }
            app.manage(db);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db_select,
            db_execute,
            app_info,
            backup_now,
            oauth_start,
            read_text_file,
            write_text_file
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Lexora");
}
