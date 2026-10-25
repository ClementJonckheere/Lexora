//! Retour de la connexion Google (OAuth, flux PKCE de Supabase).
//!
//! Le navigateur système est redirigé vers http://127.0.0.1:<port>/?code=… ; ce mini-serveur
//! local, actif quelques minutes, récupère l'adresse et la transmet à l'interface
//! (événement « oauth-callback »), qui échange le code contre une session.

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Ports à déclarer dans Supabase (Authentication → URL Configuration → Redirect URLs).
pub const PORTS: [u16; 3] = [47821, 47822, 47823];
const TIMEOUT: Duration = Duration::from_secs(300);

const PAGE: &str = r#"<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Lexora</title>
<style>body{font-family:'Segoe UI',system-ui,sans-serif;background:#fafaf9;color:#1c1917;display:grid;place-items:center;height:100vh;margin:0}
div{background:#fff;border:1px solid #e7e5e4;border-radius:14px;padding:32px 40px;text-align:center}
h1{font-size:20px;margin:0 0 8px;color:#4f46e5}</style></head>
<body><div><h1>Connexion réussie</h1><p>Vous pouvez fermer cet onglet et revenir dans Lexora.</p></div></body></html>"#;

fn respond(stream: &mut std::net::TcpStream, status: &str, body: &str) {
    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.flush();
}

/// Démarre l'écoute et retourne le port utilisé.
pub fn start(app: AppHandle) -> Result<u16, String> {
    let (listener, port) = PORTS
        .iter()
        .find_map(|p| TcpListener::bind(("127.0.0.1", *p)).ok().map(|l| (l, *p)))
        .ok_or("Les ports de connexion (47821-47823) sont occupés. Fermez les autres fenêtres de connexion puis réessayez.")?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;

    std::thread::spawn(move || {
        let deadline = Instant::now() + TIMEOUT;
        while Instant::now() < deadline {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let _ = stream.set_nonblocking(false);
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                    let mut line = String::new();
                    if BufReader::new(&stream).read_line(&mut line).is_err() {
                        continue;
                    }
                    // « GET /?code=…&state=… HTTP/1.1 »
                    let path = line.split_whitespace().nth(1).unwrap_or("/").to_string();
                    if !path.contains("code=") && !path.contains("error") {
                        respond(&mut stream, "404 Not Found", "");
                        continue;
                    }
                    respond(&mut stream, "200 OK", PAGE);
                    let _ = app.emit("oauth-callback", path);
                    return;
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(100)),
                Err(_) => std::thread::sleep(Duration::from_millis(100)),
            }
        }
    });
    Ok(port)
}
