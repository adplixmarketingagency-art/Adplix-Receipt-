import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  FileText,
  Plus,
  Trash2,
} from "lucide-react";
import {
  CURRENCIES,
  createInitialReceipt,
  formatMoney,
  calculateTotals,
  validateReceipt,
} from "./lib/receipt.js";
import { generateReceipt } from "./lib/document.js";

const currencyFor = (code) =>
  CURRENCIES.find((item) => item.code === code) || CURRENCIES[0];

const errorTarget = (path) => {
  if (path === "services") return "services-add";
  const parts = path.split(".");
  return parts[0] === "services"
    ? `service-${parts[1]}-${parts[2]}`
    : path.replaceAll(".", "-");
};

function Field({ label, id, error, children, className = "" }) {
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

function PreviewPage({ page, index }) {
  return (
    <div className="preview-paper" aria-label={`Document page ${index + 1}`}>
      <svg
        viewBox={`0 0 ${page.width} ${page.height}`}
        role="img"
        aria-label={`Receipt preview page ${index + 1}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        {page.elements.map((element, i) => {
          if (element.kind === "rect")
            return (
              <rect
                key={i}
                x={element.x}
                y={element.y}
                width={element.width}
                height={element.height}
                fill={element.fill}
              />
            );
          if (element.kind === "image")
            return (
              <image
                key={i}
                x={element.x}
                y={element.y}
                width={element.width}
                height={element.height}
                href={element.href}
              />
            );
          if (element.kind === "text")
            return (
              <text
                key={i}
                x={element.x}
                y={element.y}
                fill={element.fill}
                fontSize={element.fontSize}
                fontWeight={element.fontWeight || 400}
                textAnchor={element.anchor || "start"}
                fontFamily="Poppins, sans-serif"
              >
                {element.text}
              </text>
            );
          return null;
        })}
      </svg>
    </div>
  );
}

export default function App() {
  const [receipt, setReceipt] = useState(createInitialReceipt);
  const [errors, setErrors] = useState({});
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const summaryRef = useRef(null);
  const downloadRef = useRef(null);
  const latestReceipt = useRef(receipt);
  latestReceipt.current = receipt;
  let totals = null;
  try {
    totals = calculateTotals(receipt);
  } catch {
    /* Incomplete drafts must remain editable. */
  }
  const currency = currencyFor(receipt.currency);

  useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError("");
    const timer = setTimeout(async () => {
      try {
        const result = await generateReceipt(receipt);
        if (!cancelled) setPreview(result.pages);
      } catch {
        if (!cancelled)
          setPreviewError(
            "The preview could not be generated. Edit a field to try again.",
          );
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [receipt, previewAttempt]);

  useEffect(
    () => () => {
      if (downloadRef.current) URL.revokeObjectURL(downloadRef.current);
    },
    [],
  );

  function update(path, value) {
    setReceipt((current) => {
      const parts = path.split(".");
      if (parts.length === 1) return { ...current, [path]: value };
      return {
        ...current,
        [parts[0]]: { ...current[parts[0]], [parts[1]]: value },
      };
    });
    setErrors((current) => {
      const next = { ...current };
      delete next[path];
      return next;
    });
    setExportError("");
  }

  function updateService(id, field, value) {
    setReceipt((current) => ({
      ...current,
      services: current.services.map((service) =>
        service.id === id ? { ...service, [field]: value } : service,
      ),
    }));
    setErrors((current) => {
      const next = { ...current };
      delete next[`services.${id}.${field}`];
      delete next.services;
      return next;
    });
    setExportError("");
  }

  function removeService(id) {
    setReceipt((current) => ({
      ...current,
      services: current.services.filter((service) => service.id !== id),
    }));
    setErrors((current) => {
      const next = { ...current };
      Object.keys(next)
        .filter((key) => key.startsWith(`services.${id}.`))
        .forEach((key) => delete next[key]);
      return next;
    });
    setExportError("");
  }

  async function download(event) {
    event.preventDefault();
    if (exporting) return;
    const found = validateReceipt(receipt);
    setErrors(found);
    setExportError("");
    if (Object.keys(found).length) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setExporting(true);
    try {
      const snapshot = structuredClone(receipt);
      const { blob, filename, pages } = await generateReceipt(snapshot);
      if (latestReceipt.current === receipt) {
        setPreview(pages);
        setPreviewError("");
        setPreviewLoading(false);
      }
      const url = URL.createObjectURL(blob);
      downloadRef.current = url;
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
        if (downloadRef.current === url) downloadRef.current = null;
      }, 60_000);
    } catch {
      setExportError("Your PDF could not be downloaded. Please try again.");
      requestAnimationFrame(() => summaryRef.current?.focus());
    } finally {
      setExporting(false);
    }
  }

  const input = (path, extra = {}) => ({
    id: path.replaceAll(".", "-"),
    value: path.split(".").reduce((value, key) => value?.[key], receipt) ?? "",
    onChange: (event) => update(path, event.target.value),
    "aria-invalid": !!errors[path],
    "aria-describedby": errors[path]
      ? `${path.replaceAll(".", "-")}-error`
      : undefined,
    ...extra,
  });
  const serviceInput = (service, field, extra = {}) => ({
    id: `service-${service.id}-${field}`,
    value: service[field],
    onChange: (event) => updateService(service.id, field, event.target.value),
    "aria-invalid": !!errors[`services.${service.id}.${field}`],
    "aria-describedby": errors[`services.${service.id}.${field}`]
      ? `service-${service.id}-${field}-error`
      : undefined,
    ...extra,
  });

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand">
          <img src="/assets/adplix-logo.png" alt="" />
          <span className="brand-name">
            adplix <strong>media</strong>
          </span>
          <span className="brand-divider" />
          <span className="brand-tag">RECEIPT STUDIO</span>
        </div>
        <span className="header-note">
          <Check size={15} aria-hidden="true" /> Ready when you are
        </span>
      </header>

      <main className="workspace">
        <div className="workspace-heading">
          <div>
            <div className="breadcrumb">
              Workspace <span>/</span> Receipt studio
            </div>
            <h1>
              Create a receipt<span>.</span>
            </h1>
            <p>Make it yours, see it live, and download a ready-to-send PDF.</p>
          </div>
          <button
            className="button-primary heading-download"
            type="submit"
            form="receipt-form"
            disabled={exporting}
          >
            <ArrowDownToLine size={18} aria-hidden="true" />{" "}
            {exporting ? "Preparing PDF…" : "Download PDF"}
          </button>
        </div>

        <div className="workspace-grid">
          <form
            id="receipt-form"
            className="editor"
            onSubmit={download}
            noValidate
          >
            {(Object.keys(errors).length > 0 || exportError) && (
              <div
                className="error-summary"
                ref={summaryRef}
                tabIndex={-1}
                role="alert"
              >
                <strong>
                  {exportError
                    ? "Download failed"
                    : "A few details need attention"}
                </strong>
                <p>
                  {exportError ||
                    "Review the highlighted fields below, then try downloading again."}
                </p>
                {!exportError && (
                  <ul>
                    {Object.entries(errors).map(([path, message]) => (
                      <li key={path}>
                        <a
                          href={`#${errorTarget(path)}`}
                          onClick={(event) => {
                            event.preventDefault();
                            const target = document.getElementById(
                              errorTarget(path),
                            );
                            target?.focus();
                            target?.scrollIntoView({ block: "center" });
                          }}
                        >
                          {message}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <section
              className="editor-section"
              aria-labelledby="details-heading"
            >
              <div className="section-heading">
                <span className="step">01</span>
                <div>
                  <h2 id="details-heading">Receipt details</h2>
                  <p>Start with the essentials.</p>
                </div>
              </div>
              <div className="section-body">
                <fieldset className="type-selector">
                  <legend>Document type</legend>
                  <label
                    className={
                      receipt.documentType === "RECEIPT" ? "selected" : ""
                    }
                  >
                    <input
                      type="radio"
                      name="documentType"
                      value="RECEIPT"
                      checked={receipt.documentType === "RECEIPT"}
                      onChange={(event) =>
                        update("documentType", event.target.value)
                      }
                    />
                    Receipt
                  </label>
                  <label
                    className={
                      receipt.documentType === "INVOICE" ? "selected" : ""
                    }
                  >
                    <input
                      type="radio"
                      name="documentType"
                      value="INVOICE"
                      checked={receipt.documentType === "INVOICE"}
                      onChange={(event) =>
                        update("documentType", event.target.value)
                      }
                    />
                    Invoice
                  </label>
                </fieldset>
                <div className="field-grid">
                  <Field
                    label="Document number"
                    id="number"
                    error={errors.number}
                  >
                    <input {...input("number")} placeholder="e.g. 001" />
                  </Field>
                  <Field label="Issue date" id="date" error={errors.date}>
                    <input {...input("date", { type: "date" })} />
                  </Field>
                </div>
                <Field label="Currency" id="currency" error={errors.currency}>
                  <select {...input("currency")}>
                    {CURRENCIES.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.code} — {option.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </section>

            <section
              className="editor-section"
              aria-labelledby="customer-heading"
            >
              <div className="section-heading">
                <span className="step">02</span>
                <div>
                  <h2 id="customer-heading">Customer</h2>
                  <p>Who is this for?</p>
                </div>
              </div>
              <div className="section-body">
                <Field
                  label="Organisation name"
                  id="customer-organisation"
                  error={errors["customer.organisation"]}
                >
                  <input
                    {...input("customer.organisation")}
                    placeholder="Customer or company name"
                  />
                </Field>
                <div className="field-grid">
                  <Field label="Phone (optional)" id="customer-phone">
                    <input
                      {...input("customer.phone", { type: "tel" })}
                      placeholder="Phone number"
                    />
                  </Field>
                  <Field label="Contact (optional)" id="customer-contact">
                    <input
                      {...input("customer.contact")}
                      placeholder="Contact person"
                    />
                  </Field>
                </div>
              </div>
            </section>

            <section
              className="editor-section services-section"
              aria-labelledby="services-heading"
            >
              <div className="section-heading">
                <span className="step">03</span>
                <div>
                  <h2 id="services-heading">Services</h2>
                  <p>What was delivered and paid for?</p>
                </div>
              </div>
              <div className="section-body">
                {errors.services && (
                  <p className="field-error" id="services-error">
                    {errors.services}
                  </p>
                )}
                <div className="services-list">
                  {receipt.services.map((service, index) => (
                    <div className="service-item" key={service.id}>
                      <div className="service-title">
                        <span>ITEM {String(index + 1).padStart(2, "0")}</span>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => removeService(service.id)}
                          aria-label={`Remove item ${index + 1}`}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </div>
                      <Field
                        label="Description"
                        id={`service-${service.id}-name`}
                        error={errors[`services.${service.id}.name`]}
                      >
                        <textarea
                          {...serviceInput(service, "name", {
                            rows: 2,
                            placeholder: "Describe the service",
                          })}
                        />
                      </Field>
                      <div className="field-grid">
                        <Field
                          label={`Price (${currency.code})`}
                          id={`service-${service.id}-price`}
                          error={errors[`services.${service.id}.price`]}
                        >
                          <input
                            {...serviceInput(service, "price", {
                              type: "text",
                              inputMode: "decimal",
                              placeholder: "0.00",
                            })}
                          />
                        </Field>
                        <Field
                          label={`Amount paid (${currency.code})`}
                          id={`service-${service.id}-paid`}
                          error={errors[`services.${service.id}.paid`]}
                        >
                          <input
                            {...serviceInput(service, "paid", {
                              type: "text",
                              inputMode: "decimal",
                              placeholder: "0.00",
                            })}
                          />
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  className="add-button"
                  id="services-add"
                  type="button"
                  onClick={() => {
                    setReceipt((current) => ({
                      ...current,
                      services: [
                        ...current.services,
                        {
                          id: crypto.randomUUID(),
                          name: "",
                          price: "",
                          paid: "",
                        },
                      ],
                    }));
                    setErrors((current) => {
                      const next = { ...current };
                      delete next.services;
                      return next;
                    });
                  }}
                >
                  <Plus size={17} aria-hidden="true" /> Add another service
                </button>
              </div>
            </section>

            <details className="settings-disclosure">
              <summary>
                <span>
                  <FileText size={17} aria-hidden="true" /> Business & payment
                  details
                </span>
                <ChevronDown size={17} aria-hidden="true" />
              </summary>
              <div className="settings-content">
                <p>
                  These details appear on your PDF. Payment details are
                  optional.
                </p>
                <h3>Business</h3>
                <Field label="Business name" id="business-name">
                  <input {...input("business.name")} />
                </Field>
                <div className="field-grid">
                  <Field label="Email" id="business-email">
                    <input {...input("business.email", { type: "email" })} />
                  </Field>
                  <Field label="Phone" id="business-phone">
                    <input {...input("business.phone", { type: "tel" })} />
                  </Field>
                </div>
                <Field label="Location" id="business-location">
                  <input {...input("business.location")} />
                </Field>
                <h3>Payment</h3>
                <Field label="Account holder" id="payment-name">
                  <input {...input("payment.name")} />
                </Field>
                <div className="field-grid">
                  <Field label="Bank" id="payment-bank">
                    <input {...input("payment.bank")} />
                  </Field>
                  <Field label="Account number" id="payment-account">
                    <input {...input("payment.account")} />
                  </Field>
                </div>
                <Field label="IFSC / routing code" id="payment-ifsc">
                  <input {...input("payment.ifsc")} />
                </Field>
              </div>
            </details>

            <div className="total-panel">
              <div className="total-row">
                <span>Total</span>
                <strong>
                  {totals ? formatMoney(totals.total, receipt.currency) : "—"}
                </strong>
              </div>
              <div className="total-row">
                <span>Amount paid</span>
                <strong>
                  {totals ? formatMoney(totals.paid, receipt.currency) : "—"}
                </strong>
              </div>
              <div className="total-row balance">
                <span>Balance due</span>
                <strong>
                  {totals ? formatMoney(totals.balance, receipt.currency) : "—"}
                </strong>
              </div>
              {!totals && (
                <p className="totals-hint">
                  Enter valid prices to calculate the total.
                </p>
              )}
            </div>
            <button
              className="button-primary mobile-download"
              type="submit"
              disabled={exporting}
            >
              <ArrowDownToLine size={18} aria-hidden="true" />{" "}
              {exporting ? "Preparing PDF…" : "Download PDF"}
            </button>
            <p className="privacy-note">
              Your details stay in this browser session. Nothing is saved or
              sent to a server.
            </p>
          </form>

          <section
            className="preview-section"
            aria-labelledby="preview-heading"
          >
            <div className="preview-toolbar">
              <div>
                <h2 id="preview-heading">Live preview</h2>
                <span className="preview-status" role="status">
                  <span className="status-dot" />{" "}
                  {previewLoading
                    ? "Updating preview…"
                    : previewError
                      ? "Preview unavailable"
                      : "Updates as you type"}
                </span>
              </div>
              <div className="preview-meta">
                <span>A4 FORMAT</span>
                <span>
                  {preview?.length || 0}{" "}
                  {preview?.length === 1 ? "PAGE" : "PAGES"}
                </span>
              </div>
            </div>
            <div className="preview-stage">
              {previewError ? (
                <div className="preview-message" role="status">
                  {previewError}
                  <button
                    type="button"
                    className="add-button retry-button"
                    onClick={() => setPreviewAttempt((value) => value + 1)}
                  >
                    Retry preview
                  </button>
                </div>
              ) : preview?.length ? (
                preview.map((page, index) => (
                  <PreviewPage page={page} index={index} key={index} />
                ))
              ) : (
                <div className="preview-message" role="status">
                  Preparing your preview…
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
