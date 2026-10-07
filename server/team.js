import { Router } from "express";
import { z } from "zod";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { certificateSchema } from "./certificates.js";
const hash = (x) => createHash("sha256").update(x).digest("hex");
const error = (message, status = 409) =>
  Object.assign(new Error(message), { status });
export function teamRoutes({
  db,
  service,
  credentials,
  requireAdmin,
  requireRole,
  limiter,
  lock,
  ok,
  fail,
  publicOrigin,
}) {
  const router = Router();
  const audit = async (req, action, target) =>
    db
      .prepare(
        "INSERT INTO audit (id,actor,action,target,created) VALUES (?,?,?,?,?)",
      )
      .run(randomUUID(), req.user.id, action, target, new Date().toISOString());
  const password = z
    .string()
    .min(12)
    .max(128)
    .refine(
      (x) => Buffer.byteLength(x) <= 72,
      "Password must be at most 72 bytes",
    );
  router.get("/staff", requireAdmin, async (req, res) =>
    ok(
      res,
      await db
        .prepare(
          "SELECT id,email,name,role,active,created FROM staff ORDER BY created DESC",
        )
        .all(),
    ),
  );
  router.post(
    "/staff",
    requireAdmin,
    limiter(10, 60000, "staff"),
    async (req, res) => {
      const input = z
        .object({
          email: z.string().email().max(254),
          name: z.string().trim().min(2).max(100),
          role: z.enum(["issuer", "reviewer"]),
        })
        .strict()
        .parse(req.body);
      const token = randomBytes(32).toString("hex"),
        id = randomUUID();
      await db.transaction(async () => {
        await lock();
        const owner = await credentials();
        if (input.email.toLowerCase() === owner.email.toLowerCase())
          throw error("This email belongs to the workspace owner.");
        if (
          await db
            .prepare("SELECT id FROM staff WHERE email = ?")
            .get(input.email.toLowerCase())
        )
          throw error("A staff account with this email already exists.");
        await db
          .prepare(
            "INSERT INTO staff (id,email,name,role,invitation,expiry,created) VALUES (?,?,?,?,?,?,?)",
          )
          .run(
            id,
            input.email.toLowerCase(),
            input.name,
            input.role,
            hash(token),
            Date.now() + 86400000,
            new Date().toISOString(),
          );
        await audit(req, "Staff invited", id);
      });
      ok(
        res,
        {
          id,
          invitation: `${publicOrigin || `${req.protocol}://${req.get("host")}`}/?workspace#invite=${token}`,
        },
        201,
      );
    },
  );
  router.post(
    "/staff/:id/invitation",
    requireAdmin,
    limiter(5, 900000, "staff-reset"),
    async (req, res) => {
      const token = randomBytes(32).toString("hex");
      await db.transaction(async () => {
        await lock();
        const staff = await db
          .prepare("SELECT id FROM staff WHERE id = ?")
          .get(req.params.id);
        if (!staff) throw error("Staff account not found.", 404);
        await db
          .prepare(
            "UPDATE staff SET invitation = ?, expiry = ?, password = NULL, active = 1 WHERE id = ?",
          )
          .run(hash(token), Date.now() + 86400000, staff.id);
        await db
          .prepare(
            "DELETE FROM sessions WHERE tokenHash IN (SELECT tokenHash FROM session_principals WHERE principal = ?)",
          )
          .run(staff.id);
        await audit(req, "Staff invitation renewed", staff.id);
      });
      ok(res, {
        invitation: `${publicOrigin || `${req.protocol}://${req.get("host")}`}/?workspace#invite=${token}`,
      });
    },
  );
  router.post(
    "/staff/accept",
    limiter(5, 900000, "staff-accept"),
    async (req, res) => {
      const input = z
        .object({ token: z.string().regex(/^[a-f0-9]{64}$/), password })
        .strict()
        .parse(req.body);
      await db.transaction(async () => {
        await lock();
        const staff = await db
          .prepare(
            "SELECT * FROM staff WHERE invitation = ? AND expiry > ? AND active = 1",
          )
          .get(hash(input.token), Date.now());
        if (!staff) throw error("Invitation is invalid or expired.", 403);
        await db
          .prepare(
            "UPDATE staff SET password = ?, invitation = NULL, expiry = NULL WHERE id = ?",
          )
          .run(await bcrypt.hash(input.password, 12), staff.id);
      });
      ok(res, { accepted: true });
    },
  );
  router.patch("/staff/:id", requireAdmin, async (req, res) => {
    const input = z
      .object({ active: z.boolean(), role: z.enum(["issuer", "reviewer"]) })
      .strict()
      .parse(req.body);
    await db.transaction(async () => {
      await lock();
      if (
        !(await db
          .prepare("SELECT id FROM staff WHERE id = ?")
          .get(req.params.id))
      )
        throw error("Staff account not found.", 404);
      await db
        .prepare("UPDATE staff SET active = ?, role = ? WHERE id = ?")
        .run(input.active ? 1 : 0, input.role, req.params.id);
      await db
        .prepare(
          "DELETE FROM sessions WHERE tokenHash IN (SELECT tokenHash FROM session_principals WHERE principal = ?)",
        )
        .run(req.params.id);
      await audit(req, "Staff permissions updated", req.params.id);
    });
    ok(res, { updated: true });
  });
  router.post(
    "/staff/password",
    requireRole("issuer", "reviewer"),
    limiter(5, 900000, "staff-password"),
    async (req, res) => {
      const input = z
        .object({
          currentPassword: z.string().min(1).max(128),
          newPassword: password,
        })
        .strict()
        .parse(req.body);
      await db.transaction(async () => {
        await lock();
        const staff = await db
          .prepare("SELECT password FROM staff WHERE id = ? AND active = 1")
          .get(req.user.id);
        if (
          !staff ||
          !(await bcrypt.compare(input.currentPassword, staff.password))
        )
          throw error("Current password is incorrect.", 401);
        await db
          .prepare("UPDATE staff SET password = ? WHERE id = ?")
          .run(await bcrypt.hash(input.newPassword, 12), req.user.id);
        await db
          .prepare(
            "DELETE FROM sessions WHERE tokenHash IN (SELECT tokenHash FROM session_principals WHERE principal = ?)",
          )
          .run(req.user.id);
      });
      ok(res, { changed: true });
    },
  );
  const present = (r) => ({ ...r, payload: JSON.parse(r.payload) });
  router.get(
    "/requests",
    requireRole("admin", "issuer", "reviewer"),
    async (req, res) =>
      ok(
        res,
        (
          await db
            .prepare(
              req.user.role === "issuer"
                ? "SELECT * FROM requests WHERE submitter = ? ORDER BY created DESC LIMIT 200"
                : "SELECT * FROM requests ORDER BY created DESC LIMIT 200",
            )
            .all(...(req.user.role === "issuer" ? [req.user.id] : []))
        ).map(present),
      ),
  );
  router.post(
    "/requests",
    requireRole("admin", "issuer"),
    limiter(30, 60000, "requests"),
    async (req, res) => {
      const input = z
        .object({
          certificate: certificateSchema,
          replaces: z.string().max(40).optional(),
          note: z.string().trim().max(300).optional(),
        })
        .strict()
        .parse(req.body);
      if (input.replaces && !input.note?.length)
        throw error("A correction reason is required.", 400);
      const id = randomUUID(),
        now = new Date().toISOString();
      await db.transaction(async () => {
        await lock();
        if (input.replaces) {
          const old = await service.get(input.replaces);
          if (
            !old ||
            service.present(old).status === "Invalid" ||
            old.revokedAt
          )
            throw error(
              "Only an intact, unrevoked certificate can be corrected.",
            );
          if (
            await db
              .prepare(
                "SELECT id FROM requests WHERE replaces = ? AND state IN ('pending','approved')",
              )
              .get(input.replaces)
          )
            throw error("A correction already exists for this certificate.");
        }
        await db
          .prepare(
            "INSERT INTO requests (id,payload,submitter,state,note,replaces,created,updated) VALUES (?,?,?,?,?,?,?,?)",
          )
          .run(
            id,
            JSON.stringify(input.certificate),
            req.user.id,
            "pending",
            input.note || null,
            input.replaces || null,
            now,
            now,
          );
        await audit(req, "Review requested", id);
      });
      ok(
        res,
        present(
          await db.prepare("SELECT * FROM requests WHERE id = ?").get(id),
        ),
        201,
      );
    },
  );
  router.post(
    "/requests/:id/review",
    requireRole("admin", "reviewer"),
    limiter(30, 60000, "review"),
    async (req, res) => {
      const input = z
        .object({
          decision: z.enum(["approve", "reject"]),
          note: z.string().trim().min(5).max(300),
        })
        .strict()
        .parse(req.body);
      const result = await db.transaction(async () => {
        await lock();
        const row = await db
          .prepare("SELECT * FROM requests WHERE id = ?")
          .get(req.params.id);
        if (!row) throw error("Request not found.", 404);
        if (row.state !== "pending")
          throw error("This request has already been reviewed.");
        if (row.submitter === req.user.id)
          throw error("Another staff member must review this request.", 403);
        let issued = null;
        if (input.decision === "approve") {
          const payload = certificateSchema.parse(JSON.parse(row.payload));
          if (row.replaces) {
            const old = await service.get(row.replaces);
            if (
              !old ||
              old.revokedAt ||
              service.present(old).status === "Invalid"
            )
              throw error("The original certificate cannot be corrected.");
          }
          issued = await service.issue(payload);
          if (row.replaces)
            await service.revoke(
              row.replaces,
              `Replaced by ${issued.id}: ${row.note}`.slice(0, 300),
            );
        }
        await db
          .prepare(
            "UPDATE requests SET state = ?, reviewer = ?, note = ?, certificate = ?, updated = ? WHERE id = ?",
          )
          .run(
            input.decision === "approve" ? "approved" : "rejected",
            req.user.id,
            `${row.note ? row.note + " | " : ""}${input.note}`,
            issued?.id || null,
            new Date().toISOString(),
            row.id,
          );
        await audit(
          req,
          input.decision === "approve"
            ? "Request approved"
            : "Request rejected",
          row.id,
        );
        return present(
          await db.prepare("SELECT * FROM requests WHERE id = ?").get(row.id),
        );
      });
      ok(res, result);
    },
  );
  router.get("/audit", requireAdmin, async (req, res) =>
    ok(
      res,
      await db
        .prepare("SELECT * FROM audit ORDER BY created DESC LIMIT 200")
        .all(),
    ),
  );
  return router;
}
