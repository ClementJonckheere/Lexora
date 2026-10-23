// Pas de console supplémentaire sous Windows en version release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lexora_lib::run()
}
