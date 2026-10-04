import test from "node:test";
import assert from "node:assert/strict";
import app from "../api/index.js";

test("hosted demo serves samples and rejects all writes", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const session = await (await fetch(`${base}/api/session`)).json();
    assert.equal(session.data.role, "viewer");
    assert.equal(session.data.configured, false);
    const list = await (await fetch(`${base}/api/certificates`)).json();
    assert.equal(list.data.length, 12);
    const verified = await (
      await fetch(`${base}/api/verify/${list.data[0].id}`)
    ).json();
    assert.equal(verified.success, true);
    assert.equal(verified.data.email, undefined);
    for (const path of [
      "login",
      "certificates",
      `certificates/${list.data[0].id}/revoke`,
    ]) {
      const response = await fetch(`${base}/api/${path}`, { method: "POST" });
      assert.equal(response.status, 403);
      assert.match((await response.json()).error, /read-only demo/);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
