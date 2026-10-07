import { Router } from "express";
import { randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { Webhook } from "svix";
import { certificatePdf } from "./pdf.js";
export function deliveryService({
  db,
  service,
  config = {},
  origin,
  lock,
  send = fetch,
}) {
  const configured = Boolean(
    config.apiKey && config.from && config.webhookSecret && origin,
  );
  async function queue(id) {
    if (!configured)
      throw Object.assign(
        new Error(
          "Email delivery needs a verified sender, provider key and webhook secret.",
        ),
        { status: 503 },
      );
    return db.transaction(async () => {
      await lock();
      const existing = await db
        .prepare("SELECT id,state FROM deliveries WHERE certificate = ?")
        .get(id);
      if (existing) return { ...existing };
      const raw = await service.get(id);
      if (!raw)
        throw Object.assign(new Error("Certificate not found."), {
          status: 404,
        });
      const c = service.present(raw);
      if (c.status !== "Active")
        throw Object.assign(
          new Error("Only active certificates can be emailed."),
          { status: 409 },
        );
      const negative = await db
        .prepare(
          "SELECT payload FROM deliveries WHERE state IN ('bounced','complained')",
        )
        .all();
      if (negative.some((row) => JSON.parse(row.payload).to?.includes(c.email)))
        throw Object.assign(
          new Error(
            "This recipient has a previous bounce or complaint. Resolve it with the email provider before sending again.",
          ),
          { status: 409 },
        );
      const pdf = await certificatePdf(c, origin, db),
        job = randomUUID();
      const payload = {
        from: config.from,
        to: [c.email],
        subject: `Your certificate — ${c.issuer?.name || "Credence"}`,
        text: `Hello ${c.recipient},\n\nYour certificate for ${c.course} is attached. Verify its current status: ${origin}/?verify=${encodeURIComponent(c.id)}\n\n${c.issuer?.name || "Credence"}`,
        attachments: [
          { filename: `${c.id}.pdf`, content: pdf.toString("base64") },
        ],
      };
      await db
        .prepare(
          "INSERT INTO deliveries (id,certificate,payload,state,due,created) VALUES (?,?,?,?,?,?)",
        )
        .run(
          job,
          id,
          JSON.stringify(payload),
          "queued",
          Date.now(),
          new Date().toISOString(),
        );
      return { id: job, state: "queued" };
    });
  }
  async function process() {
    if (!configured)
      throw Object.assign(new Error("Email delivery is not configured."), {
        status: 503,
      });
    // The row and shared lock serialize concurrent workers. Stable stored payload and
    // provider idempotency protect retries after a network or transaction failure.
    return db.transaction(async () => {
      await lock();
      const job = await db
        .prepare(
          "SELECT * FROM deliveries WHERE state IN ('queued','retry') AND due <= ? ORDER BY created LIMIT 1",
        )
        .get(Date.now());
      if (!job) return { processed: 0 };
      const raw = await service.get(job.certificate);
      if (!raw || service.present(raw).status !== "Active") {
        await db
          .prepare("UPDATE deliveries SET state = ?, error = ? WHERE id = ?")
          .run("cancelled", "Certificate is no longer active.", job.id);
        return { processed: 1, state: "cancelled" };
      }
      if (Date.now() - Date.parse(job.created) > 23 * 3600000) {
        await db
          .prepare("UPDATE deliveries SET state = ?, error = ? WHERE id = ?")
          .run(
            "held",
            "Provider retry window elapsed; reconcile delivery before resending.",
            job.id,
          );
        return { processed: 1, state: "held" };
      }
      const started = job.started || Date.parse(job.created);
      await db
        .prepare(
          "UPDATE deliveries SET started = ?, attempts = attempts + 1 WHERE id = ?",
        )
        .run(started, job.id);
      let response;
      try {
        response = await send("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `credence-${job.id}`,
          },
          body: job.payload,
          signal: AbortSignal.timeout(15000),
        });
      } catch {}
      if (response?.ok) {
        let body;
        try {
          body = await response.json();
        } catch {}
        if (body?.id) {
          await db
            .prepare(
              "UPDATE deliveries SET state = ?, provider = ?, error = NULL WHERE id = ?",
            )
            .run("sent", body.id, job.id);
          return { processed: 1, state: "sent" };
        }
      }
      const permanent =
        response &&
        response.status >= 400 &&
        response.status < 500 &&
        ![408, 409, 429].includes(response.status);
      const state = permanent || job.attempts >= 4 ? "failed" : "retry";
      await db
        .prepare(
          "UPDATE deliveries SET state = ?, error = ?, due = ? WHERE id = ?",
        )
        .run(
          state,
          response
            ? `Provider returned HTTP ${response.status}.`
            : "Provider response could not be confirmed.",
          Date.now() + Math.min(3600000, 60000 * 2 ** job.attempts),
          job.id,
        );
      return { processed: 1, state };
    });
  }
  return { configured, queue, process };
}
export function deliveryRoutes({
  db,
  delivery,
  config = {},
  requireAdmin,
  limiter,
  lock,
  ok,
  fail,
}) {
  const router = Router();
  router.post(
    "/ops/delivery",
    limiter(15, 60000, "delivery-job"),
    async (req, res) => {
      const supplied = (req.get("Authorization") || "").replace(/^Bearer /, "");
      const digest = (value) => createHash("sha256").update(value).digest();
      if (
        !config.jobToken ||
        !timingSafeEqual(digest(supplied), digest(config.jobToken))
      )
        return fail(res, "Unauthorized delivery job.", 401);
      ok(res, await delivery.process());
    },
  );
  router.get("/deliveries", requireAdmin, async (req, res) =>
    ok(res, {
      configured: delivery.configured,
      rows: await db
        .prepare(
          "SELECT id,certificate,state,attempts,provider,error,due,created FROM deliveries ORDER BY created DESC LIMIT 200",
        )
        .all(),
    }),
  );
  router.post(
    "/certificates/:id/email",
    requireAdmin,
    limiter(10, 60000, "email-queue"),
    async (req, res) => ok(res, await delivery.queue(req.params.id), 201),
  );
  router.post(
    "/deliveries/process",
    requireAdmin,
    limiter(10, 60000, "email-worker"),
    async (req, res) => ok(res, await delivery.process()),
  );
  router.post(
    "/deliveries/:id/retry",
    requireAdmin,
    limiter(5, 60000, "email-retry"),
    async (req, res) => {
      await db.transaction(async () => {
        await lock();
        const job = await db
          .prepare("SELECT * FROM deliveries WHERE id = ?")
          .get(req.params.id);
        if (!job) return fail(res, "Delivery not found.", 404);
        if (
          job.state !== "failed" ||
          job.attempts >= 5 ||
          Date.now() - Date.parse(job.created) > 23 * 3600000
        )
          return fail(
            res,
            "This delivery cannot be retried automatically. Reconcile it with the provider first.",
            409,
          );
        await db
          .prepare("UPDATE deliveries SET state = ?, due = ? WHERE id = ?")
          .run("retry", Date.now(), job.id);
        ok(res, { queued: true });
      });
    },
  );
  router.post(
    "/email/webhook",
    limiter(120, 60000, "email-webhook"),
    async (req, res) => {
      if (!config.webhookSecret)
        return fail(res, "Email provider is not configured.", 503);
      let event;
      try {
        new Webhook(config.webhookSecret).verify(req.rawBody || "", {
          "svix-id": req.get("svix-id"),
          "svix-timestamp": req.get("svix-timestamp"),
          "svix-signature": req.get("svix-signature"),
        });
        event = JSON.parse(req.rawBody);
      } catch {
        return fail(res, "Invalid webhook signature.", 401);
      }
      if (
        !event?.data?.email_id ||
        ![
          "email.delivered",
          "email.bounced",
          "email.complained",
          "email.delivery_delayed",
          "email.failed",
        ].includes(event.type)
      )
        return ok(res, { received: true });
      await db.transaction(async () => {
        await lock();
        const id = req.get("svix-id");
        if (
          await db
            .prepare("SELECT id FROM delivery_events WHERE id = ?")
            .get(id)
        )
          return;
        await db
          .prepare(
            "INSERT INTO delivery_events (id,provider,type,created) VALUES (?,?,?,?)",
          )
          .run(
            id,
            event.data.email_id,
            event.type,
            event.created_at || new Date().toISOString(),
          );
        // Terminal negative events take precedence even if callbacks arrive out of order.
        const events = await db
          .prepare("SELECT type FROM delivery_events WHERE provider = ?")
          .all(event.data.email_id);
        const types = new Set(events.map((x) => x.type));
        const state = types.has("email.complained")
          ? "complained"
          : types.has("email.bounced")
            ? "bounced"
            : types.has("email.failed")
              ? "failed"
              : types.has("email.delivered")
                ? "delivered"
                : "delayed";
        await db
          .prepare("UPDATE deliveries SET state = ? WHERE provider = ?")
          .run(state, event.data.email_id);
      });
      ok(res, { received: true });
    },
  );
  return router;
}
