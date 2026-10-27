//! Icône dans la zone de notification de Windows.
//!
//! Lexora peut rester lancé en arrière-plan : le raccourci global d'ajout et le rappel
//! quotidien fonctionnent alors en permanence. Fermer la fenêtre la masque (si l'option
//! est activée) ; « Quitter » dans le menu de l'icône ferme réellement l'application.

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// Fermer la fenêtre = la masquer dans la zone de notification (réglage de l'utilisateur).
pub static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);

pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn setup<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Ouvrir Lexora", true, None::<&str>)?;
    let add = MenuItem::with_id(app, "add", "Ajouter une expression", true, None::<&str>)?;
    let review = MenuItem::with_id(app, "review", "Réviser", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &add, &review, &PredefinedMenuItem::separator(app)?, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Lexora")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "add" => {
                show_main(app);
                let _ = app.emit("tray-action", "add");
            }
            "review" => {
                show_main(app);
                let _ = app.emit("tray-action", "review");
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// Infobulle de l'icône (ex. « Lexora — 12 fiches à réviser »).
pub fn set_tooltip<R: Runtime>(app: &AppHandle<R>, text: &str) {
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(text));
    }
}

pub fn set_close_to_tray(enabled: bool) {
    CLOSE_TO_TRAY.store(enabled, Ordering::Relaxed);
}

pub fn close_to_tray() -> bool {
    CLOSE_TO_TRAY.load(Ordering::Relaxed)
}
