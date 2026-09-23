import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Writable } from "node:stream";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";

let hidden = false;
const output = new Writable({
  write(chunk, encoding, callback) {
    if (!hidden) stdout.write(chunk, encoding);
    callback();
  },
});
const rl = createInterface({
  input: stdin,
  output,
  terminal: Boolean(stdin.isTTY && stdout.isTTY),
});
try {
  const email = z
    .string()
    .email()
    .parse((await rl.question("Administrator email: ")).trim());
  console.log(
    "Use a unique password of at least 12 characters. Input is hidden.",
  );
  stdout.write("Administrator password: ");
  hidden = true;
  const password = await rl.question("");
  hidden = false;
  stdout.write("\n");
  if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72)
    throw new Error(
      "Password must be at least 12 characters and at most 72 UTF-8 bytes.",
    );
  const hash = await bcrypt.hash(password, 12);
  let env = existsSync(".env")
    ? readFileSync(".env", "utf8")
    : "PORT=3001\nDEMO_MODE=true\n";
  const set = (key, value) => {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    env = re.test(env)
      ? env.replace(re, () => line)
      : env.trimEnd() + "\n" + line + "\n";
  };
  set("ADMIN_EMAIL", email);
  set("ADMIN_PASSWORD_HASH", hash);
  // Preserve the existing development signing key so already-issued records stay valid.
  if (!/^SIGNING_SECRET=.+$/m.test(env)) {
    let secret;
    if (existsSync("data/credence.sqlite")) {
      const { openDatabase, localSecret } = await import("../server/db.js");
      const db = openDatabase();
      secret = localSecret(db);
      db.close();
    } else secret = randomBytes(32).toString("hex");
    set("SIGNING_SECRET", secret);
  }
  writeFileSync(".env", env, { mode: 0o600 });
  console.log(
    "Administrator configured. Restart npm run dev, then sign in from the workspace.",
  );
} catch (error) {
  console.error(
    error instanceof z.ZodError
      ? "Enter a valid email address."
      : error.message,
  );
  process.exitCode = 1;
} finally {
  rl.close();
}
