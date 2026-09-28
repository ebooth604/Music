import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function migrate(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);
  const dir = path.join(here, "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const done = await pool.query(`SELECT 1 FROM _migrations WHERE name = $1`, [f]);
    if (done.rowCount) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query(`INSERT INTO _migrations (name) VALUES ($1)`, [f]);
      await pool.query("COMMIT");
      console.log(`applied ${f}`);
    } catch (e) {
      await pool.query("ROLLBACK");
      throw e;
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
