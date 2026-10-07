import { z } from "zod";
export const defaultInstitution = {
  name: "Credence Academy",
  signatory: "Authorised registrar",
};
export const institutionSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    signatory: z.string().trim().min(2).max(100),
  })
  .strict();
export async function institution(db) {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get("institution");
  return row
    ? institutionSchema.parse(JSON.parse(row.value))
    : defaultInstitution;
}
