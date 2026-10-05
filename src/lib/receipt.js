export const CURRENCIES = [
  { code: "INR", name: "Indian Rupee", decimals: 2, symbol: "₹" },
  { code: "USD", name: "US Dollar", decimals: 2, symbol: "$" },
  { code: "EUR", name: "Euro", decimals: 2, symbol: "€" },
  { code: "GBP", name: "British Pound", decimals: 2, symbol: "£" },
  { code: "JPY", name: "Japanese Yen", decimals: 0, symbol: "¥" },
  { code: "KWD", name: "Kuwaiti Dinar", decimals: 3, symbol: "KWD " },
];

const currencyInfo = (code) => CURRENCIES.find((item) => item.code === code);

export function createInitialReceipt() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type) => parts.find((value) => value.type === type).value;
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  return {
    documentType: "RECEIPT",
    number: "184",
    date,
    currency: "INR",
    customer: { organisation: "", phone: "", contact: "" },
    business: {
      name: "Adplixmedia agency",
      email: "adplixmarketingagency@gmail.com",
      phone: "+91 8072861362",
      location: "Pondicherry",
    },
    payment: { name: "", bank: "", account: "", ifsc: "" },
    services: [
      {
        id: "1",
        name: "Social Media Handling + Lead Generation",
        price: "30000",
        paid: "30000",
      },
    ],
  };
}

export function parseMoney(value, currency = "INR") {
  const info = currencyInfo(currency);
  if (!info) return null;
  const text = String(value ?? "").trim();
  if (!/^(?:\d+)(?:\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > info.decimals) return null;
  if (whole.replace(/^0+/, "").length > 16) return null;
  const minor =
    BigInt(whole) * 10n ** BigInt(info.decimals) +
    BigInt(fraction.padEnd(info.decimals, "0") || "0");
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null;
}

export function formatMoney(minor, currency = "INR") {
  const info = currencyInfo(currency);
  if (!info || !Number.isSafeInteger(minor)) return "—";
  const negative = minor < 0;
  const exact = BigInt(negative ? -minor : minor);
  const scale = 10n ** BigInt(info.decimals);
  const whole = (exact / scale).toLocaleString(
    currency === "INR" ? "en-IN" : "en-US",
  );
  const fraction = info.decimals
    ? `.${String(exact % scale).padStart(info.decimals, "0")}`
    : "";
  return `${negative ? "-" : ""}${info.symbol}${whole}${fraction}`;
}

export function calculateTotals(receipt) {
  let total = 0,
    paid = 0;
  for (const service of receipt?.services || []) {
    const price = parseMoney(service?.price, receipt.currency);
    const payment =
      String(service?.paid ?? "").trim() === ""
        ? 0
        : parseMoney(service?.paid, receipt.currency);
    if (
      price === null ||
      payment === null ||
      !Number.isSafeInteger(total + price) ||
      !Number.isSafeInteger(paid + payment)
    ) {
      throw new RangeError("Invalid or overflowing service amount");
    }
    total += price;
    paid += payment;
  }
  if (!Number.isSafeInteger(total - paid))
    throw new RangeError("Invalid balance");
  return { total, paid, balance: total - paid };
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    year >= 1 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function validateReceipt(receipt) {
  const errors = {};
  if (!String(receipt?.number ?? "").trim())
    errors.number = "Enter a document number.";
  else if (String(receipt.number).length > 32)
    errors.number = "Keep the document number to 32 characters.";
  if (!validDate(receipt?.date)) errors.date = "Enter a valid date.";
  if (!currencyInfo(receipt?.currency))
    errors.currency = "Choose a supported currency.";
  if (!String(receipt?.customer?.organisation ?? "").trim())
    errors["customer.organisation"] = "Enter the customer organisation.";
  if (!Array.isArray(receipt?.services) || !receipt.services.length)
    errors.services = "Add at least one service.";
  let total = 0,
    paid = 0;
  (Array.isArray(receipt?.services) ? receipt.services : []).forEach(
    (service, index) => {
      const path = `services.${service?.id ?? index}`;
      if (!String(service?.name ?? "").trim())
        errors[`${path}.name`] = "Enter a service name.";
      const price = parseMoney(service?.price, receipt?.currency);
      const payment =
        String(service?.paid ?? "").trim() === ""
          ? 0
          : parseMoney(service?.paid, receipt?.currency);
      if (price === null)
        errors[`${path}.price`] = "Enter a valid non-negative amount.";
      if (payment === null)
        errors[`${path}.paid`] = "Enter a valid non-negative amount.";
      else if (price !== null && payment > price)
        errors[`${path}.paid`] = "Paid cannot exceed the price.";
      if (price !== null) total += price;
      if (payment !== null) paid += payment;
    },
  );
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(paid))
    errors.services = "Combined amounts exceed the supported limit.";
  return errors;
}

const units = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const tens = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];
function underThousand(n) {
  const parts = [];
  if (n >= 100) {
    parts.push(`${units[Math.floor(n / 100)]} hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(tens[Math.floor(n / 10)] + (n % 10 ? `-${units[n % 10]}` : ""));
  } else if (n) parts.push(units[n]);
  return parts.join(" ");
}
function numberWords(n, indian) {
  if (!n) return "zero";
  const groups = indian
    ? [
        ["crore", 10000000],
        ["lakh", 100000],
        ["thousand", 1000],
        ["hundred", 100],
      ]
    : [
        ["trillion", 1e12],
        ["billion", 1e9],
        ["million", 1e6],
        ["thousand", 1000],
      ];
  const words = [];
  for (const [label, size] of groups) {
    const count = Math.floor(n / size);
    if (count) {
      words.push(
        `${indian && size === 100 ? units[count] : count >= 1000 ? numberWords(count, indian) : underThousand(count)} ${label}`,
      );
      n %= size;
    }
  }
  if (n) words.push(underThousand(n));
  return words.join(" ");
}

export function amountInWords(minor, currency = "INR") {
  const info = currencyInfo(currency);
  if (!info || !Number.isSafeInteger(minor) || minor < 0) return "";
  const scale = 10 ** info.decimals;
  const major = Math.floor(minor / scale),
    fraction = minor % scale;
  const names = {
    INR: ["rupee", "paise"],
    USD: ["dollar", "cent"],
    EUR: ["euro", "cent"],
    GBP: ["pound", "penny"],
    JPY: ["yen", ""],
    KWD: ["dinar", "fils"],
  };
  const [main, sub] = names[currency];
  const plural = (name, count) =>
    name === "paise" || name === "fils" || name === "yen" || count === 1
      ? name
      : name === "penny"
        ? "pence"
        : `${name}s`;
  const words =
    `${numberWords(major, currency === "INR")} ${plural(main, major)}` +
    (fraction
      ? ` and ${numberWords(fraction, false)} ${plural(sub, fraction)}`
      : " only");
  return words[0].toUpperCase() + words.slice(1) + (fraction ? " only" : "");
}
