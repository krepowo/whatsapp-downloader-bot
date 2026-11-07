import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "path";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { BufferJSON, initAuthCreds, proto } from "@whiskeysockets/baileys";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * SQLite-backed Baileys auth state (single file: auth.db).
 * Same interface as useMultiFileAuthState: { state: { creds, keys: { get, set } }, saveCreds }.
 * Writes are transactional, so an interrupted write can no longer corrupt the session.
 */
export const useSqliteAuthState = async (dbPath = join(__dirname, "..", "..", "auth.db")) => {
    mkdirSync(dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("CREATE TABLE IF NOT EXISTS auth (key TEXT PRIMARY KEY, value TEXT NOT NULL)");

    const getStmt = db.prepare("SELECT value FROM auth WHERE key = ?");
    const upsertStmt = db.prepare("INSERT INTO auth (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    const delStmt = db.prepare("DELETE FROM auth WHERE key = ?");

    const readKey = (key) => {
        const row = getStmt.get(key);
        return row ? JSON.parse(row.value, BufferJSON.reviver) : null;
    };

    const writeKey = (key, value) => {
        if (value === null || value === undefined) {
            delStmt.run(key);
        } else {
            upsertStmt.run(key, JSON.stringify(value, BufferJSON.replacer));
        }
    };

    const creds = readKey("creds") || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    for (const id of ids) {
                        let value = readKey(`${type}-${id}`);
                        if (type === "app-state-sync-key" && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }
                    return data;
                },
                set: async (data) => {
                    db.exec("BEGIN");
                    try {
                        for (const category in data) {
                            for (const id in data[category]) {
                                writeKey(`${category}-${id}`, data[category][id]);
                            }
                        }
                        db.exec("COMMIT");
                    } catch (err) {
                        db.exec("ROLLBACK");
                        throw err;
                    }
                },
            },
        },
        saveCreds: async () => {
            writeKey("creds", creds);
        },
    };
};
