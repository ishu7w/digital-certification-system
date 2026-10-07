import { AsyncLocalStorage } from "node:async_hooks";
import { readFile } from "node:fs/promises";
import pg from "pg";

const wrapped = new WeakMap();
export function asyncDatabase(raw) {
  if (raw.transaction) return raw;
  if (wrapped.has(raw)) return wrapped.get(raw);
  const context = new AsyncLocalStorage();
  let queue = Promise.resolve();
  const exclusive = (action) => {
    const result = queue.then(action);
    queue = result.catch(() => {});
    return result;
  };
  const execute = (action) =>
    context.getStore() ? Promise.resolve().then(action) : exclusive(action);
  const db = {
    dialect: "sqlite",
    prepare: (query) =>
      Object.fromEntries(
        ["get", "all", "run"].map((method) => [
          method,
          (...values) => execute(() => raw.prepare(query)[method](...values)),
        ]),
      ),
    transaction: (action) =>
      exclusive(() =>
        context.run(true, async () => {
          raw.exec("BEGIN IMMEDIATE");
          try {
            const result = await action();
            raw.exec("COMMIT");
            return result;
          } catch (error) {
            raw.exec("ROLLBACK");
            throw error;
          }
        }),
      ),
    close: () => raw.close(),
  };
  wrapped.set(raw, db);
  return db;
}

export function postgresDatabase(connectionString, { schema } = {}) {
  if (schema && !/^[a-z][a-z0-9_]*$/.test(schema))
    throw new Error("Invalid database schema");
  const url = new URL(connectionString);
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (
    !local &&
    !["require", "verify-full", "verify-ca"].includes(
      url.searchParams.get("sslmode"),
    )
  )
    throw new Error("Hosted DATABASE_URL must require TLS (sslmode=require).");
  // Let pg verify the server certificate rather than disabling verification.
  if (!local) url.searchParams.set("sslmode", "verify-full");
  const pool = new pg.Pool({
    connectionString: url.toString(),
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
    ...(schema ? { options: `-c search_path=${schema}` } : {}),
  });
  pool.on("error", () => console.error("Database connection interrupted"));
  const context = new AsyncLocalStorage();
  const names =
    /\b(certificateId|issuedAt|expiresAt|createdAt|revokedAt|tokenHash|resetAt|signatureVersion)\b/g;
  const sql = (query) => {
    let index = 0;
    return query.replace(names, '"$1"').replace(/\?/g, () => `$${++index}`);
  };
  const query = (text, values) =>
    (context.getStore() || pool).query(sql(text), values);
  return {
    dialect: "postgres",
    prepare: (text) => ({
      get: async (...values) => (await query(text, values)).rows[0],
      all: async (...values) => (await query(text, values)).rows,
      run: async (...values) => ({
        changes: (await query(text, values)).rowCount,
      }),
    }),
    transaction: async (action) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await context.run(client, action);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    migrate: async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(728431)");
        await client.query(
          await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
