export function productionConfig(env = process.env) {
  if (!env.SIGNING_SECRET || env.SIGNING_SECRET.length < 32)
    throw new Error(
      "A persistent SIGNING_SECRET of at least 32 characters is required.",
    );
  if (
    env.ADMIN_PASSWORD_HASH &&
    !/^\$2[aby]\$(1[2-9]|2\d|3[01])\$/.test(env.ADMIN_PASSWORD_HASH)
  )
    throw new Error(
      "Administrator password hash requires bcrypt cost 12 or higher.",
    );
  if (
    !(env.ADMIN_EMAIL && env.ADMIN_PASSWORD_HASH) &&
    !env.ADMIN_SETUP_TOKEN &&
    !env.DATABASE_URL
  )
    throw new Error(
      "Administrator credentials or one-time setup are required.",
    );
  if (env.ADMIN_SETUP_TOKEN && env.ADMIN_SETUP_TOKEN.length < 32)
    throw new Error("ADMIN_SETUP_TOKEN must have at least 32 characters.");
  if (
    env.PUBLIC_ORIGIN &&
    (new URL(env.PUBLIC_ORIGIN).protocol !== "https:" ||
      new URL(env.PUBLIC_ORIGIN).origin !== env.PUBLIC_ORIGIN)
  )
    throw new Error("PUBLIC_ORIGIN must be an HTTPS origin without a path.");
  if (env.BACKUP_ENCRYPTION_KEY && env.BACKUP_ENCRYPTION_KEY.length < 32)
    throw new Error("Backup encryption key is too short.");
  if (env.BACKUP_JOB_TOKEN && env.BACKUP_JOB_TOKEN.length < 32)
    throw new Error("Backup job token is too short.");
  return {
    secret: env.SIGNING_SECRET,
    backup: {
      encryptionKey: env.BACKUP_ENCRYPTION_KEY || "",
      jobToken: env.BACKUP_JOB_TOKEN || "",
      storeId: env.BLOB_STORE_ID || "",
    },
    publicOrigin: env.PUBLIC_ORIGIN || "",
    adminEmail: env.ADMIN_EMAIL || "",
    passwordHash: env.ADMIN_PASSWORD_HASH || "",
    demoMode: false,
    production: true,
    setupToken: env.ADMIN_SETUP_TOKEN || "",
    setupExpiresAt: Number(env.ADMIN_SETUP_EXPIRES_AT || 0),
  };
}
