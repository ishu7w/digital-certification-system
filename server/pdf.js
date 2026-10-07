import "regenerator-runtime/runtime.js";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import QRCode from "qrcode";
import { defaultInstitution } from "./institution.js";
const fontBytes = Promise.all([
  readFile(new URL("./fonts/NotoSans-Regular.ttf", import.meta.url)),
  readFile(new URL("./fonts/NotoSansDevanagari-Regular.ttf", import.meta.url)),
  readFile(new URL("./fonts/NotoSansGujarati-Regular.ttf", import.meta.url)),
]);
export async function certificatePdf(c, origin) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts = await Promise.all(
    (await fontBytes).map((bytes) => doc.embedFont(bytes, { subset: true })),
  );
  const sets = fonts.map((font) => new Set(font.getCharacterSet()));
  const page = doc.addPage([842, 595]);
  const dark = rgb(0.08, 0.16, 0.18),
    accent = rgb(0.2, 0.38, 0.4),
    muted = rgb(0.4, 0.45, 0.46);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: 842,
    height: 595,
    color: rgb(0.98, 0.98, 0.96),
  });
  page.drawRectangle({
    x: 28,
    y: 28,
    width: 786,
    height: 539,
    borderColor: accent,
    borderWidth: 1,
  });
  const draw = (text, y, size = 16, color = dark, x = null, max = 720) => {
    // Refuse unsupported characters rather than silently produce an incorrect name.
    const index = sets.findIndex((chars) =>
      [...text].every((ch) => chars.has(ch.codePointAt(0))),
    );
    if (index < 0)
      throw Object.assign(
        new Error(
          "This name uses characters not supported by the PDF font. Use Print / save PDF for this certificate.",
        ),
        { status: 422 },
      );
    const font = fonts[index];
    while (font.widthOfTextAtSize(text, size) > max && size > 9) size -= 0.5;
    page.drawText(text, {
      x: x ?? (842 - font.widthOfTextAtSize(text, size)) / 2,
      y,
      size,
      font,
      color,
    });
  };
  const issuer = c.issuer || defaultInstitution;
  draw(issuer.name, 520, 20);
  draw(c.category.toUpperCase(), 477, 11, accent);
  draw(
    "Certificate of " +
      (c.category === "Participation"
        ? "Participation"
        : c.category === "Achievement"
          ? "Achievement"
          : "Completion"),
    425,
    34,
  );
  draw("Presented to", 384, 13, muted);
  draw(c.recipient, 340, 30);
  draw("In recognition of", 307, 13, muted);
  draw(c.course, 271, 23);
  draw(issuer.signatory, 169, 14, dark, 65, 510);
  draw("Authorised signatory", 146, 10, muted, 65);
  draw(
    "Issued " +
      c.issuedAt +
      (c.expiresAt ? "   ·   Expires " + c.expiresAt : ""),
    116,
    11,
    muted,
    65,
  );
  const verification = `${origin}/?verify=${encodeURIComponent(c.id)}`;
  const qr = await doc.embedPng(
    await QRCode.toBuffer(verification, { type: "png", width: 240, margin: 1 }),
  );
  page.drawImage(qr, { x: 671, y: 107, width: 98, height: 98 });
  draw(c.id, 77, 10, muted);
  draw(
    `${c.status.toUpperCase()} · Status at download · Scan to verify the current record`,
    50,
    10,
    accent,
  );
  doc.setTitle(`${c.id} — ${c.recipient}`);
  doc.setAuthor(issuer.name);
  return Buffer.from(await doc.save());
}
