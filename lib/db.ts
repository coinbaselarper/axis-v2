import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export interface Db {
  get: (key: string) => any;
  set: (key: string, value: any) => void;
  del: (key: string) => void;
  close: () => void;
}

export function createDb(filePath = path.join(process.cwd(), "data", "chat.db")): Db {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  const getStmt = sqlite.prepare<[string]>("SELECT value FROM kv WHERE key = ?");
  const setStmt = sqlite.prepare<[string, string]>(
    "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  const delStmt = sqlite.prepare<[string]>("DELETE FROM kv WHERE key = ?");

  return {
    get(key) {
      const row = getStmt.get(key) as { value: string } | undefined;
      if (!row) return undefined;
      try { return JSON.parse(row.value); } catch { return undefined; }
    },
    set(key, value) {
      if (value === null || value === undefined) {
        delStmt.run(key);
        return;
      }
      setStmt.run(key, JSON.stringify(value));
    },
    del(key) {
      delStmt.run(key);
    },
    close() {
      sqlite.close();
    },
  };
}
