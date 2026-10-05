import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createInitialReceipt } from "../src/lib/receipt.js";
import { generateReceipt } from "../src/lib/document.js";

// Only the engine's same-origin static assets are mocked. PDF generation is real.
globalThis.document = { baseURI: "http://receipt.test/" };
globalThis.location = { origin: "http://receipt.test" };
globalThis.fetch = async (url) => {
  assert.equal(url.origin, "http://receipt.test");
  const bytes = await readFile(
    new URL(`../public${url.pathname}`, import.meta.url),
  );
  return new Response(bytes);
};

const example = () => ({
  ...createInitialReceipt(),
  customer: { organisation: "Example Studio", contact: "", phone: "" },
});

async function checkDocument(receipt) {
  const result = await generateReceipt(receipt);
  const data = new Uint8Array(await result.blob.arrayBuffer());
  assert.equal(new TextDecoder().decode(data.slice(0, 5)), "%PDF-");
  const pdf = await getDocument({ data, useSystemFonts: false }).promise;
  assert.equal(pdf.numPages, result.pages.length);
  const allText = [];
  for (let i = 0; i < pdf.numPages; i++) {
    const page = await pdf.getPage(i + 1);
    const layout = result.pages[i];
    const viewport = page.getViewport({ scale: 1 });
    assert.ok(Math.abs(viewport.width - 595.28) < 0.1);
    assert.ok(Math.abs(viewport.height - 841.89) < 0.1);
    const content = await page.getTextContent();
    const actual = content.items.filter(
      (item) => typeof item.str === "string" && item.str.trim(),
    );
    const expected = layout.elements.filter(
      (element) => element.kind === "text" && element.text.trim(),
    );
    // Extraction contains exactly the same selectable strings as the SVG preview.
    const normalise = (strings) => strings.join("").replace(/\s+/gu, "");
    assert.equal(
      normalise(actual.map((item) => item.str)),
      normalise(expected.map((element) => element.text)),
    );
    for (const item of actual) {
      const x = item.transform[4],
        y = viewport.height - item.transform[5];
      assert.ok(
        x >= -0.1 && x + item.width <= viewport.width + 0.1,
        `Clipped horizontally: ${item.str}`,
      );
      assert.ok(
        y >= item.height * 0.7 && y <= viewport.height - 10,
        `Clipped vertically: ${item.str}`,
      );
    }
    for (const element of layout.elements) {
      if (element.kind !== "text") {
        assert.ok(element.x >= 0 && element.y >= 0);
        assert.ok(element.x + element.width <= layout.width + 0.1);
        assert.ok(element.y + element.height <= layout.height + 0.1);
      }
    }
    allText.push(...actual.map((item) => item.str));
  }
  await pdf.destroy();
  return { ...result, text: allText.join(" ") };
}

test("reference-style receipt has one A4 page and actual selectable text", async () => {
  const receipt = example();
  receipt.payment = {
    name: "Example Account Holder",
    bank: "Example Bank",
    account: "TEST-ACCOUNT",
    ifsc: "TEST-CODE",
  };
  const result = await checkDocument(receipt);
  assert.equal(result.pages.length, 1);
  assert.match(result.text, /Example Studio/);
  assert.match(result.text, /₹30,000\.00/);
  assert.match(result.text, /Thirty thousand rupees only/);
  assert.equal(result.filename, "receipt-184.pdf");
});

test("many services and 2000-character unbroken names paginate without clipping", async () => {
  const receipt = example();
  receipt.customer.organisation = "W".repeat(2000);
  receipt.services = Array.from({ length: 30 }, (_, index) => ({
    id: String(index),
    name: index === 0 ? "M".repeat(2000) : `Production service ${index + 1}`,
    price: "10.25",
    paid: "5",
  }));
  const result = await checkDocument(receipt);
  assert.ok(result.pages.length > 4);
  assert.match(result.text, /Production service 30/);
  assert.match(result.text, /₹307\.50/);
  assert.equal(
    result.pages
      .flatMap((page) => page.elements)
      .filter((element) => element.text === "TOTAL").length,
    1,
  );
});

test("very long payment details continue on extra pages without losing text", async () => {
  const receipt = example();
  receipt.payment.name = "Account holder ".repeat(180);
  const result = await checkDocument(receipt);
  assert.ok(result.pages.length > 1);
  assert.match(result.text, /PAYMENT METHOD \(CONTINUED\)/);
});

test("each supported currency exports exact text, and invoice is optional", async () => {
  for (const [currency, price, expected] of [
    ["USD", "0.30", "$0.30"],
    ["EUR", "15.50", "€15.50"],
    ["GBP", "1.01", "£1.01"],
    ["JPY", "1000", "¥1,000"],
    ["KWD", "12.345", "KWD 12.345"],
  ]) {
    const receipt = example();
    receipt.currency = currency;
    receipt.documentType = "INVOICE";
    receipt.services = [
      { id: "1", name: "Example service", price, paid: price },
    ];
    const result = await checkDocument(receipt);
    assert.ok(result.text.includes(expected));
    assert.match(result.text, /INVOICE/);
    assert.equal(result.filename, "invoice-184.pdf");
  }
});
