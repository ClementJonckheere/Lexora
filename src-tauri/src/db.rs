use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection, OpenFlags};
use serde::Serialize;
use serde_json::{Map, Number, Value};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

const DB_FILE: &str = "lexora.db";
const BACKUP_DIR: &str = "backups";
const BACKUPS_KEPT: usize = 10;
const AUTO_BACKUP_EVERY: Duration = Duration::from_secs(24 * 3600);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecResult {
    rows_affected: usize,
    last_insert_id: i64,
}

/// Connexion SQLite unique, protégée par un mutex. Le front sérialise aussi ses
/// accès : une transaction ouverte (BEGIN … COMMIT) n'est jamais entrelacée.
pub struct AppDb {
    conn: Mutex<Connection>,
    pub path: PathBuf,
    pub backup_dir: PathBuf,
}

fn configure(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;",
    )
}

fn to_sql(v: &Value) -> Result<SqlValue, String> {
    Ok(match v {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(*b as i64),
        Value::Number(n) => match n.as_i64() {
            Some(i) => SqlValue::Integer(i),
            None => SqlValue::Real(n.as_f64().ok_or("nombre invalide")?),
        },
        Value::String(s) => SqlValue::Text(s.clone()),
        _ => return Err("paramètre SQL non pris en charge (tableau ou objet)".into()),
    })
}

fn to_json(v: ValueRef<'_>) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::Number(i.into()),
        ValueRef::Real(f) => Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(_) => Value::Null,
    }
}

impl AppDb {
    pub fn open(data_dir: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(data_dir).map_err(|e| format!("Dossier de données inaccessible : {e}"))?;
        let path = data_dir.join(DB_FILE);
        let conn = Connection::open_with_flags(
            &path,
            OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(|e| format!("Ouverture de la base impossible : {e}"))?;
        configure(&conn).map_err(|e| e.to_string())?;
        Ok(Self { conn: Mutex::new(conn), path, backup_dir: data_dir.join(BACKUP_DIR) })
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.conn.lock().map_err(|_| "base de données verrouillée (erreur interne)".to_string())
    }

    pub fn select(&self, sql: &str, params: &[Value]) -> Result<Vec<Map<String, Value>>, String> {
        let conn = self.lock()?;
        let values = params.iter().map(to_sql).collect::<Result<Vec<_>, _>>()?;
        let mut stmt = conn.prepare_cached(sql).map_err(|e| e.to_string())?;
        let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let mut rows = stmt.query(params_from_iter(values)).map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let mut obj = Map::with_capacity(names.len());
            for (i, name) in names.iter().enumerate() {
                obj.insert(name.clone(), to_json(row.get_ref(i).map_err(|e| e.to_string())?));
            }
            out.push(obj);
        }
        Ok(out)
    }

    pub fn execute(&self, sql: &str, params: &[Value]) -> Result<ExecResult, String> {
        let conn = self.lock()?;
        let values = params.iter().map(to_sql).collect::<Result<Vec<_>, _>>()?;
        let mut stmt = conn.prepare_cached(sql).map_err(|e| e.to_string())?;
        let rows_affected = stmt.execute(params_from_iter(values)).map_err(|e| e.to_string())?;
        Ok(ExecResult { rows_affected, last_insert_id: conn.last_insert_rowid() })
    }

    pub fn backup_to_dir(&self) -> Result<PathBuf, String> {
        std::fs::create_dir_all(&self.backup_dir).map_err(|e| e.to_string())?;
        let stamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S%.3f").to_string();
        let mut target = self.backup_dir.join(format!("lexora-{stamp}.db"));
        let mut n = 1;
        while target.exists() {
            target = self.backup_dir.join(format!("lexora-{stamp}-{n}.db"));
            n += 1;
        }
        let conn = self.lock()?;
        conn.execute("VACUUM INTO ?1", [target.to_string_lossy().as_ref()])
            .map_err(|e| format!("Sauvegarde impossible : {e}"))?;
        drop(conn);
        self.prune_backups();
        Ok(target)
    }

    /// Une sauvegarde par jour au maximum, au démarrage ; les 10 plus récentes sont conservées.
    pub fn auto_backup(&self) -> Result<(), String> {
        let has_data: i64 = {
            let conn = self.lock()?;
            conn.query_row("SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'notes'", [], |r| r.get(0))
                .map_err(|e| e.to_string())?
        };
        if has_data == 0 {
            return Ok(());
        }
        let latest = self.backups().into_iter().filter_map(|p| p.metadata().and_then(|m| m.modified()).ok()).max();
        let due = match latest {
            Some(t) => SystemTime::now().duration_since(t).unwrap_or_default() >= AUTO_BACKUP_EVERY,
            None => true,
        };
        if due {
            self.backup_to_dir()?;
        }
        Ok(())
    }

    fn backups(&self) -> Vec<PathBuf> {
        let mut list: Vec<PathBuf> = std::fs::read_dir(&self.backup_dir)
            .map(|rd| {
                rd.filter_map(|e| e.ok().map(|e| e.path()))
                    .filter(|p| p.extension().is_some_and(|x| x == "db"))
                    .collect()
            })
            .unwrap_or_default();
        list.sort();
        list
    }

    fn prune_backups(&self) {
        let list = self.backups();
        if list.len() > BACKUPS_KEPT {
            for p in &list[..list.len() - BACKUPS_KEPT] {
                let _ = std::fs::remove_file(p);
            }
        }
    }

    /// Restaure une sauvegarde .db : une copie de sécurité de l'état actuel est faite avant.
    pub fn restore_from(&self, source: &Path) -> Result<(), String> {
        let src = Connection::open_with_flags(source, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|e| format!("Fichier illisible : {e}"))?;
        let ok: i64 = src
            .query_row("SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name IN ('notes', 'cards')", [], |r| r.get(0))
            .map_err(|_| "Ce fichier n'est pas une base SQLite valide.".to_string())?;
        if ok != 2 {
            return Err("Ce fichier n'est pas une sauvegarde Lexora.".into());
        }
        self.backup_to_dir()?;
        let mut conn = self.lock()?;
        let backup = rusqlite::backup::Backup::new(&src, &mut conn).map_err(|e| e.to_string())?;
        backup
            .run_to_completion(256, Duration::from_millis(0), None)
            .map_err(|e| format!("Restauration impossible : {e}"))?;
        drop(backup);
        configure(&conn).map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("lexora-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn seed(db: &AppDb) {
        db.execute("CREATE TABLE notes (id INTEGER PRIMARY KEY, expression TEXT NOT NULL, score REAL)", &[]).unwrap();
        db.execute("CREATE TABLE cards (id INTEGER PRIMARY KEY)", &[]).unwrap();
    }

    #[test]
    fn select_execute_et_types() {
        let db = AppDb::open(&temp_dir("types")).unwrap();
        seed(&db);
        let r = db.execute("INSERT INTO notes (expression, score) VALUES (?, ?)", &[json!("To tackle"), json!(0.5)]).unwrap();
        assert_eq!(r.rows_affected, 1);
        assert_eq!(r.last_insert_id, 1);
        let rows = db.select("SELECT * FROM notes WHERE id = ?", &[json!(1)]).unwrap();
        assert_eq!(rows[0]["expression"], json!("To tackle"));
        assert_eq!(rows[0]["score"], json!(0.5));
        assert!(db.execute("INSERT INTO notes (expression) VALUES (?)", &[json!(null)]).is_err());
        assert!(db.select("SELECT ?", &[json!([1])]).is_err());
    }

    #[test]
    fn transaction_annulee() {
        let db = AppDb::open(&temp_dir("tx")).unwrap();
        seed(&db);
        db.execute("BEGIN IMMEDIATE", &[]).unwrap();
        db.execute("INSERT INTO notes (expression) VALUES ('a')", &[]).unwrap();
        db.execute("ROLLBACK", &[]).unwrap();
        assert!(db.select("SELECT * FROM notes", &[]).unwrap().is_empty());
    }

    #[test]
    fn sauvegarde_et_restauration() {
        let dir = temp_dir("backup");
        let db = AppDb::open(&dir).unwrap();
        seed(&db);
        db.execute("INSERT INTO notes (expression) VALUES ('kept')", &[]).unwrap();
        let backup = db.backup_to_dir().unwrap();
        assert!(backup.exists());
        db.execute("DELETE FROM notes", &[]).unwrap();
        db.restore_from(&backup).unwrap();
        let rows = db.select("SELECT expression FROM notes", &[]).unwrap();
        assert_eq!(rows[0]["expression"], json!("kept"));
        // Un fichier quelconque est refusé.
        let junk = dir.join("junk.db");
        std::fs::write(&junk, b"not a database").unwrap();
        assert!(db.restore_from(&junk).is_err());
    }
}
