import { z } from "zod";
import { createHash } from "node:crypto";
export const defaultInstitution = {
  name: "Credence Academy",
  signatory: "Authorised registrar",
};
export const institutionSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    signatory: z.string().trim().min(2).max(100),
    template: z.enum(["classic", "modern"]).optional(),
    logo: z
      .string()
      .max(66000)
      .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/)
      .nullable()
      .optional(),
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

export async function issuerSnapshot(db) {
  const issuer = await institution(db);
  if (!issuer.logo) return issuer;
  const logoHash = createHash("sha256").update(issuer.logo).digest("hex");
  await db
    .prepare(
      "INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT (key) DO NOTHING",
    )
    .run(`logo:${logoHash}`, JSON.stringify(issuer.logo));
  const { logo, ...details } = issuer;
  return { ...details, logoHash };
}
export async function resolveIssuer(db, issuer) {
  if (!issuer?.logoHash || !db) return issuer;
  const asset = await db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(`logo:${issuer.logoHash}`);
  if (!asset)
    throw Object.assign(new Error("Certificate logo asset is unavailable."), {
      status: 409,
    });
  const logo = JSON.parse(asset.value);
  if (createHash("sha256").update(logo).digest("hex") !== issuer.logoHash)
    throw Object.assign(new Error("Certificate logo integrity check failed."), {
      status: 409,
    });
  return { ...issuer, logo };
}
