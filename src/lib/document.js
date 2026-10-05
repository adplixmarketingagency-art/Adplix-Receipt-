import {
  amountInWords,
  calculateTotals,
  formatMoney,
  parseMoney,
} from "./receipt.js";

const W = 595.28,
  H = 841.89,
  RED = "#ff0000",
  INK = "#111111";
const LEFT = 55,
  RIGHT = 540,
  BODY = RIGHT - LEFT;
const cache = new Map();

async function asset(name, binary = false) {
  const key = `${name}:${binary}`;
  if (!cache.has(key))
    cache.set(
      key,
      (async () => {
        const url = new URL(`assets/${name}`, document.baseURI);
        if (url.origin !== location.origin)
          throw new Error(`Asset ${name} must be loaded from this app.`);
        const response = await fetch(url);
        if (!response.ok)
          throw new Error(
            `Could not load ${name} (${response.status}). Check public/assets/.`,
          );
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!bytes.length) throw new Error(`${name} is empty.`);
        return binary ? bytes : `data:image/png;base64,${base64(bytes)}`;
      })().catch((error) => {
        cache.delete(key);
        throw error;
      }),
    );
  return cache.get(key);
}

function base64(bytes) {
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192)
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
}

function createLayout(pdf) {
  const measure = (value, size, weight = 400) => {
    pdf.setFont("Poppins", weight === 700 ? "bold" : "normal");
    pdf.setFontSize(size);
    return pdf.getTextWidth(String(value));
  };
  const wrap = (value, width, size = 12, weight = 400) => {
    const rows = [];
    for (const paragraph of String(value ?? "")
      .replace(/\r/g, "")
      .split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/u).filter(Boolean)) {
        if (measure(line ? `${line} ${word}` : word, size, weight) <= width) {
          line = line ? `${line} ${word}` : word;
          continue;
        }
        if (line) rows.push(line);
        line = "";
        // Iterating code points avoids splitting a surrogate pair.
        for (const char of word) {
          if (line && measure(line + char, size, weight) > width) {
            rows.push(line);
            line = "";
          }
          line += char;
        }
      }
      rows.push(line);
    }
    return rows.length ? rows : [""];
  };
  const text = (
    page,
    x,
    y,
    value,
    fontSize = 12,
    fontWeight = 400,
    fill = INK,
    anchor = "start",
  ) => {
    page.elements.push({
      kind: "text",
      x,
      y,
      text: String(value),
      fontSize,
      fontWeight,
      fill,
      anchor,
    });
  };
  const rect = (page, x, y, width, height, fill) =>
    page.elements.push({ kind: "rect", x, y, width, height, fill });
  const rows = (
    page,
    x,
    y,
    content,
    size = 12,
    weight = 400,
    color = INK,
    leading = 18,
  ) => {
    content.forEach((row, index) =>
      text(page, x, y + index * leading, row, size, weight, color),
    );
    return y + content.length * leading;
  };
  return { measure, wrap, text, rect, rows };
}

function prettyDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return "DATE NOT SET";
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  return date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
        .format(date)
        .toUpperCase()
    : "DATE NOT SET";
}

function safeTotals(receipt) {
  try {
    return calculateTotals(receipt);
  } catch {
    return { total: 0, paid: 0, balance: 0 };
  }
}

function buildPages(receipt, logo, l) {
  const { measure, wrap, text, rect, rows } = l;
  const pages = [];
  const type = receipt.documentType === "INVOICE" ? "INVOICE" : "RECEIPT";
  const makePage = () => {
    const page = { width: W, height: H, elements: [] };
    pages.push(page);
    page.elements.push({
      kind: "image",
      x: LEFT,
      y: 22,
      width: 105,
      height: 105,
      href: logo,
    });
    text(page, RIGHT, 93, type, 64, 700, RED, "end");
    rect(page, 0, 140, W, 38, RED);
    rect(page, W / 2 - 0.5, 146, 1, 26, "#ffffff");
    const number = `${type} NO: ${String(receipt.number || "—")}`;
    const date = prettyDate(receipt.date);
    const fit = (value, max) => {
      let size = 12;
      while (size > 6 && measure(value, size, 700) > max) size -= 0.5;
      return size;
    };
    text(
      page,
      W / 4,
      165,
      number,
      fit(number, W / 2 - 24),
      700,
      "#ffffff",
      "middle",
    );
    text(
      page,
      (W * 3) / 4,
      165,
      date,
      fit(date, W / 2 - 24),
      700,
      "#ffffff",
      "middle",
    );
    if (pages.length > 1)
      text(page, RIGHT, 203, "CONTINUED", 9, 700, RED, "end");
    return page;
  };
  let page = makePage();
  let y = 212;
  const next = () => {
    page = makePage();
    y = 235;
  };

  // Corresponding column entries advance independently, so long organisations never cover
  // the neighbouring column or overlap the service table.
  const business = receipt.business || {},
    customer = receipt.customer || {};
  const from = [
    business.name || "Business name",
    business.email,
    business.phone,
    business.location,
  ].filter(Boolean);
  const to = [
    customer.organisation || "Customer organisation",
    customer.contact,
    customer.phone,
  ].filter(Boolean);
  const columns = [
    { x: 57, width: 225, label: "From :", entries: from },
    { x: 315, width: 218, label: "To :", entries: to },
  ];
  const columnRows = columns.map(({ entries, width, label }, column) => {
    const result = [];
    entries.forEach((entry, index) => {
      const bold = index === 0;
      const prefix = bold ? `${label} ` : "";
      const prefixWidth = bold ? measure(prefix, 12, 700) : 0;
      const fragments = wrap(
        entry,
        width - prefixWidth - 3,
        12,
        bold ? 700 : 400,
      );
      fragments.forEach((fragment, i) =>
        result.push({
          value: i === 0 ? `${prefix}${fragment}` : fragment,
          bold,
        }),
      );
    });
    if (!entries.length)
      result.push({ value: `${column ? "To" : "From"} : —`, bold: true });
    return result;
  });
  let at = 0;
  while (at < Math.max(...columnRows.map((column) => column.length))) {
    if (y > 715) next();
    columnRows.forEach((column, i) => {
      const row = column[at];
      if (row?.value)
        text(page, columns[i].x, y, row.value, 12, row.bold ? 700 : 400);
    });
    y += 19;
    at++;
  }
  y = Math.max(y + 39, 347);
  if (y > 680) next();

  const tableHeader = () => {
    text(page, LEFT + 2, y - 16, "SERVICE DETAILS", 15, 700);
    rect(page, LEFT, y, BODY, 48, RED);
    text(page, 69, y + 30, "SERVICE", 12, 700, "#ffffff");
    text(page, 435, y + 30, "TOTAL AMOUNT", 10, 700, "#ffffff", "end");
    text(page, 526, y + 30, "AMOUNT PAID", 10, 700, "#ffffff", "end");
    y += 48;
  };
  tableHeader();
  const services = receipt.services?.length
    ? receipt.services
    : [{ name: "Service not specified", price: "", paid: "" }];
  for (const service of services) {
    const values = [
      wrap(service.name || "Service not specified", 258, 12),
      wrap(
        formatMoney(
          parseMoney(service.price, receipt.currency) ?? 0,
          receipt.currency,
        ),
        83,
        11,
      ),
      wrap(
        formatMoney(
          parseMoney(service.paid, receipt.currency) ?? 0,
          receipt.currency,
        ),
        83,
        11,
      ),
    ];
    let offset = 0;
    const count = Math.max(...values.map((value) => value.length));
    while (offset < count) {
      if (y + 67 > 722) {
        next();
        tableHeader();
      }
      const available = Math.max(1, Math.floor((722 - y - 23) / 18));
      const length = Math.min(available, count - offset);
      values.forEach((column, index) =>
        column.slice(offset, offset + length).forEach((row, line) => {
          text(
            page,
            [69, 435, 526][index],
            y + 24 + line * 18,
            row,
            index ? 11 : 12,
            400,
            INK,
            index ? "end" : "start",
          );
        }),
      );
      offset += length;
      y += Math.max(offset === count ? 67 : 35, 23 + length * 18);
      rect(page, LEFT, y - 1, BODY, 0.6, "#eeeeee");
    }
  }

  // A sparse first page keeps the sample's generous whitespace before its total band.
  const sums = safeTotals(receipt);
  const currency = receipt.currency || "INR";
  const words = wrap(amountInWords(sums.total, currency) || "Zero", 315, 10);
  const totalText = wrap(formatMoney(sums.total, currency), 139, 15, 700);
  const bandHeight = Math.max(
    69,
    35 + words.length * 15,
    21 + totalText.length * 19,
  );
  let bandY = Math.max(y + 22, pages.length === 1 ? 595 : 265);
  if (bandY + bandHeight > 716) {
    next();
    bandY = 265;
  }
  rect(page, LEFT, bandY, BODY, bandHeight, RED);
  text(page, 69, bandY + 25, "TOTAL", 14, 700, "#ffffff");
  rows(page, 69, bandY + 44, words, 10, 400, "#ffffff", 15);
  totalText.forEach((row, i) =>
    text(page, 526, bandY + 27 + i * 19, row, 15, 700, "#ffffff", "end"),
  );

  const payment = receipt.payment || {};
  const entries = [
    ["Name", payment.name],
    ["Bank", payment.bank],
    ["Account", payment.account],
    ["IFSC", payment.ifsc],
  ].filter(([, value]) => String(value ?? "").trim());
  const paymentLines = entries.flatMap(([label, value]) =>
    wrap(`${label}: ${value}`, 303, 11),
  );
  let paymentY = Math.max(
    bandY + bandHeight + 32,
    pages.length === 1 ? 690 : 265,
  );
  if (paymentY + 22 > 760) {
    next();
    paymentY = 265;
  }
  text(page, LEFT, paymentY, "PAYMENT METHOD", 12, 700, RED);
  paymentY += 24;
  for (const line of paymentLines) {
    if (paymentY > 790) {
      next();
      paymentY = 265;
      text(page, LEFT, paymentY, "PAYMENT METHOD (CONTINUED)", 12, 700, RED);
      paymentY += 24;
    }
    text(page, LEFT, paymentY, line, 11);
    paymentY += 17;
  }
  // The thank-you occupies the right-hand footer column, not the payment column.
  text(
    page,
    RIGHT,
    Math.min(790, Math.max(paymentY - 10, pages.length === 1 ? 764 : 320)),
    "Thank you!",
    22,
    700,
    INK,
    "end",
  );
  pages.forEach((entry, index) =>
    text(
      entry,
      RIGHT,
      H - 22,
      `${index + 1} / ${pages.length}`,
      8,
      400,
      "#777777",
      "end",
    ),
  );
  return pages;
}

function color(pdf, value) {
  const hex = value.slice(1);
  return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16));
}

export async function generateReceipt(receipt) {
  const { jsPDF } = await import("jspdf");
  const [regular, bold, logo] = await Promise.all([
    asset("Poppins-Regular.ttf", true),
    asset("Poppins-Bold.ttf", true),
    asset("adplix-logo.png"),
  ]);
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
    compress: true,
  });
  pdf.addFileToVFS("Poppins-Regular.ttf", base64(regular));
  pdf.addFileToVFS("Poppins-Bold.ttf", base64(bold));
  pdf.addFont("Poppins-Regular.ttf", "Poppins", "normal");
  pdf.addFont("Poppins-Bold.ttf", "Poppins", "bold");
  const pages = buildPages(receipt || {}, logo, createLayout(pdf));
  pages.forEach((page, index) => {
    if (index) pdf.addPage("a4", "portrait");
    for (const element of page.elements) {
      if (element.kind === "rect") {
        pdf.setFillColor(...color(pdf, element.fill));
        pdf.rect(element.x, element.y, element.width, element.height, "F");
      } else if (element.kind === "image") {
        pdf.addImage(
          element.href,
          "PNG",
          element.x,
          element.y,
          element.width,
          element.height,
        );
      } else {
        pdf.setFont("Poppins", element.fontWeight === 700 ? "bold" : "normal");
        pdf.setFontSize(element.fontSize);
        pdf.setTextColor(...color(pdf, element.fill));
        pdf.text(element.text, element.x, element.y, {
          align:
            element.anchor === "middle"
              ? "center"
              : element.anchor === "end"
                ? "right"
                : "left",
        });
      }
    }
  });
  const filename = `${receipt?.documentType === "INVOICE" ? "invoice" : "receipt"}-${String(
    receipt?.number || "draft",
  )
    .replace(/[^\w-]/g, "-")
    .slice(0, 80)}.pdf`;
  return { pages, blob: pdf.output("blob"), filename };
}
