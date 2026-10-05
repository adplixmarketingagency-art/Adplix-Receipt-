import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createInitialReceipt,
  parseMoney,
  formatMoney,
  calculateTotals,
  validateReceipt,
  amountInWords,
} from "../src/lib/receipt.js";

const validReceipt = () => {
  const receipt = createInitialReceipt();
  receipt.customer.organisation = "Example Studio";
  return receipt;
};

test("decimal totals use integer minor units, never floating-point addition", () => {
  const receipt = validReceipt();
  receipt.services = [
    { id: "a", name: "Design", price: "0.10", paid: "0.10" },
    { id: "b", name: "Production", price: "0.20", paid: "" },
  ];
  assert.deepEqual(calculateTotals(receipt), {
    total: 30,
    paid: 10,
    balance: 20,
  });
  assert.equal(formatMoney(30, "INR"), "₹0.30");
  assert.deepEqual(validateReceipt(receipt), {});
});

test("strict prices reject negatives, invalid syntax, precision loss and overflow", () => {
  for (const value of [
    "",
    "-1",
    "1e3",
    "NaN",
    "Infinity",
    "1,000",
    "0.001",
    "9007199254740992",
  ]) {
    assert.equal(parseMoney(value, "INR"), null, value);
  }
  assert.equal(parseMoney(" 12.50 ", "INR"), 1250);
  assert.equal(parseMoney("0", "INR"), 0);
  assert.equal(parseMoney("001.2", "USD"), 120);
  assert.equal(parseMoney("12.1", "JPY"), null);
  assert.equal(parseMoney("12", "JPY"), 12);
  assert.equal(parseMoney("12.345", "KWD"), 12345);
  assert.equal(parseMoney("12.3456", "KWD"), null);
  assert.equal(parseMoney("1", "XYZ"), null);
});

test("large money formatting preserves the final minor unit exactly", () => {
  assert.equal(parseMoney("90071992547409.91", "USD"), Number.MAX_SAFE_INTEGER);
  assert.equal(
    formatMoney(Number.MAX_SAFE_INTEGER, "USD"),
    "$90,071,992,547,409.91",
  );
  assert.equal(formatMoney(123456789, "INR"), "₹12,34,567.89");
  assert.equal(formatMoney(-101, "USD"), "-$1.01");
  assert.equal(formatMoney(12345, "KWD"), "KWD 12.345");
});

test("validation requires customer, number, actual calendar date and named service", () => {
  const receipt = validReceipt();
  receipt.customer.organisation = "  ";
  receipt.number = "";
  receipt.date = "2026-02-30";
  receipt.services[0].name = "";
  receipt.services[0].price = "-1";
  const errors = validateReceipt(receipt);
  for (const key of [
    "customer.organisation",
    "number",
    "date",
    "services.1.name",
    "services.1.price",
  ])
    assert.ok(errors[key], key);
  assert.ok(validateReceipt({ ...validReceipt(), services: [] }).services);
  assert.ok(
    validateReceipt({ ...validReceipt(), number: "x".repeat(33) }).number,
  );
  assert.ok(validateReceipt({ ...validReceipt(), date: "2025-02-29" }).date);
  assert.equal(
    validateReceipt({ ...validReceipt(), date: "2024-02-29" }).date,
    undefined,
  );
  assert.deepEqual(validateReceipt(validReceipt()), {});
});

test("paid amounts cannot exceed price; aggregate overflow is rejected", () => {
  const receipt = validReceipt();
  receipt.services[0].paid = "30000.01";
  assert.ok(validateReceipt(receipt)["services.1.paid"]);
  receipt.services = [
    { id: "a", name: "First", price: "90071992547409.91", paid: "" },
    { id: "b", name: "Second", price: "0.01", paid: "" },
  ];
  assert.ok(validateReceipt(receipt).services);
  assert.throws(() => calculateTotals(receipt), RangeError);
});

test("amount words handle Indian grouping, decimals and maximum supported values", () => {
  assert.equal(amountInWords(3000000, "INR"), "Thirty thousand rupees only");
  assert.equal(
    amountInWords(123456789, "INR"),
    "Twelve lakh thirty-four thousand five hundred sixty-seven rupees and eighty-nine paise only",
  );
  assert.equal(amountInWords(101, "USD"), "One dollar and one cent only");
  assert.equal(amountInWords(0, "JPY"), "Zero yen only");
  assert.doesNotMatch(
    amountInWords(Number.MAX_SAFE_INTEGER, "INR"),
    /undefined|NaN/,
  );
  assert.doesNotMatch(
    amountInWords(Number.MAX_SAFE_INTEGER, "JPY"),
    /undefined|NaN/,
  );
});

test("initial receipt uses an ISO date and never seeds customer or banking data", () => {
  const receipt = createInitialReceipt();
  assert.match(receipt.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(receipt.customer.organisation, "");
  assert.ok(Object.values(receipt.payment).every((value) => value === ""));
});
