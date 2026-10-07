import { postgresDatabase } from "../server/storage.js";
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is required for PostgreSQL migration.");
const db = postgresDatabase(process.env.DATABASE_URL);
try {
  await db.migrate();
  console.log("Database schema is ready.");
} finally {
  await db.close();
}
