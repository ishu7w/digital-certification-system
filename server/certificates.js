import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(value);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Enter a valid calendar date");
export const certificateSchema = z
  .object({
    recipient: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254),
    course: z.string().trim().min(3).max(140),
    category: z.enum([
      "Course completion",
      "Professional certification",
      "Achievement",
      "Participation",
    ]),
    issuedAt: date.refine(
      (value) => value <= new Date().toISOString().slice(0, 10),
      "Issue date cannot be in the future",
    ),
    expiresAt: z.union([date, z.literal(""), z.null()]).optional(),
  })
  .refine((data) => !data.expiresAt || data.expiresAt >= data.issuedAt, {
    message: "Expiry must be on or after issue date",
    path: ["expiresAt"],
  });
export function createCertificateService(db, secret) {
  const signature = (c) =>
    createHmac("sha256", secret)
      .update(
        JSON.stringify([
          c.id,
          c.recipient,
          c.email,
          c.course,
          c.category,
          c.issuedAt,
          c.expiresAt,
        ]),
      )
      .digest("hex");
  const integrity = (c) => {
    const expected = Buffer.from(signature(c), "hex");
    const actual = Buffer.from(c.signature, "hex");
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  };
  const status = (c) =>
    !integrity(c)
      ? "Invalid"
      : c.revokedAt
        ? "Revoked"
        : c.expiresAt && c.expiresAt < new Date().toISOString().slice(0, 10)
          ? "Expired"
          : "Active";
  const present = (c) => ({ ...c, status: status(c) });
  const get = (id) =>
    db.prepare("SELECT * FROM certificates WHERE id = ?").get(id);
  function transaction(action) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  function issue(input, demo = false, explicitId) {
    const c = {
      ...input,
      expiresAt: input.expiresAt || null,
      id:
        explicitId ||
        `CRD-${new Date().getFullYear()}-${randomBytes(8).toString("hex").toUpperCase()}`,
      createdAt: new Date().toISOString(),
      demo: demo ? 1 : 0,
    };
    return transaction(() => {
      db.prepare(
        "INSERT INTO certificates (id,recipient,email,course,category,issuedAt,expiresAt,createdAt,signature,demo) VALUES (?,?,?,?,?,?,?,?,?,?)",
      ).run(
        c.id,
        c.recipient,
        c.email,
        c.course,
        c.category,
        c.issuedAt,
        c.expiresAt,
        c.createdAt,
        signature(c),
        c.demo,
      );
      db.prepare(
        "INSERT INTO activity (certificateId,action,detail,createdAt,demo) VALUES (?,?,?,?,?)",
      ).run(
        c.id,
        "Issued",
        `Certificate issued to ${c.recipient}`,
        c.createdAt,
        c.demo,
      );
      return present(get(c.id));
    });
  }
  function revoke(id, reason) {
    const c = get(id);
    if (!c)
      throw Object.assign(new Error("Certificate not found"), { status: 404 });
    if (c.revokedAt)
      throw Object.assign(
        new Error("This certificate has already been revoked"),
        { status: 409 },
      );
    return transaction(() => {
      const now = new Date().toISOString();
      db.prepare(
        "UPDATE certificates SET revokedAt = ?, reason = ? WHERE id = ?",
      ).run(now, reason, id);
      db.prepare(
        "INSERT INTO activity (certificateId,action,detail,createdAt,demo) VALUES (?,?,?,?,?)",
      ).run(
        id,
        "Revoked",
        `Certificate for ${c.recipient} revoked: ${reason}`,
        now,
        c.demo,
      );
      return present(get(id));
    });
  }
  function seed() {
    if (db.prepare("SELECT id FROM certificates WHERE demo = 1 LIMIT 1").get())
      return;
    const people = [
      ["Aarav Sharma", "Data Structures & Algorithms", "Course completion"],
      ["Priya Mehta", "UI/UX Design Foundations", "Professional certification"],
      ["Arjun Patel", "Full Stack Web Development", "Course completion"],
      [
        "Ananya Singh",
        "Cloud Computing Essentials",
        "Professional certification",
      ],
      ["Rohan Desai", "Introduction to Cybersecurity", "Course completion"],
      ["Meera Iyer", "Design Thinking Workshop", "Participation"],
      ["Kabir Verma", "Python for Data Science", "Achievement"],
      ["Sara Khan", "Product Management", "Professional certification"],
      ["Dev Shah", "Machine Learning Fundamentals", "Course completion"],
      ["Isha Rao", "Open Source Contributor", "Achievement"],
      ["Neel Joshi", "JavaScript Essentials", "Course completion"],
      ["Zoya Ali", "Research & Innovation Summit", "Participation"],
    ];
    people.forEach(([recipient, course, category], i) => {
      const issuedAt = new Date(Date.now() - (i + 1) * 86400000)
        .toISOString()
        .slice(0, 10);
      const expiresAt =
        i === 4
          ? new Date(Date.now() - 86400000).toISOString().slice(0, 10)
          : null;
      const c = issue(
        {
          recipient,
          course,
          category,
          email: `${recipient.toLowerCase().replaceAll(" ", ".")}@example.com`,
          issuedAt,
          expiresAt,
        },
        true,
        `CRD-${new Date().getFullYear()}-${String(1001 + i)}`,
      );
      if (i === 7) revoke(c.id, "Replaced with an updated credential.");
    });
  }
  return {
    issue,
    revoke,
    seed,
    get,
    present,
    list: (demoOnly) =>
      db
        .prepare(
          `SELECT * FROM certificates ${demoOnly ? "WHERE demo = 1" : ""} ORDER BY issuedAt DESC, createdAt DESC`,
        )
        .all()
        .map(present),
    activity: (demoOnly) =>
      db
        .prepare(
          `SELECT * FROM activity ${demoOnly ? "WHERE demo = 1" : ""} ORDER BY id DESC LIMIT 100`,
        )
        .all(),
    verify: (id) => {
      const c = get(id);
      if (!c) return null;
      const { email, signature: sig, demo, ...publicData } = present(c);
      return publicData;
    },
  };
}
