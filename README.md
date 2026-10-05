# Adplix Media · Receipt Studio

A local-first React + Vite receipt generator, styled after the supplied Adplix reference. Enter a customer, add services and prices, check the live A4 preview, and download a selectable-text PDF. No authentication or backend.

## Run

Requires Node.js 20.19+ and npm.

```sh
npm ci
npm run dev
```

Vite prints the local URL. To use a specific port:

```sh
npm run dev -- --port 5184 --strictPort
```

## Use

- Choose Receipt or Invoice, document number, date, and currency.
- Enter the customer organisation; phone and contact are optional.
- Add/remove services. Each row has a price and optional amount paid. Blank paid means zero. Amount paid cannot exceed its price.
- Expand **Business & payment details** to change the sender or add bank information. The sender defaults come from the supplied reference; customer and bank fields start blank.
- **Download PDF** validates the current data and generates a fresh PDF. Nothing is automatically stored, uploaded, or sent to a server. Reloading resets the draft; download your PDF before closing the page.

INR, USD, EUR, GBP, JPY (no decimals), and KWD (three decimals) are supported. Values are parsed into integer minor units and capped at JavaScript's safe integer limit. Unsupported precision is rejected rather than rounded. English/Latin document text and the supported currency symbols use locally bundled Poppins fonts; scripts not covered by Poppins require a font extension.

## Implementation

- `src/App.jsx` — labelled editor, validation, SVG preview, and download flow.
- `src/styles.css` — responsive workspace and locally served fonts.
- `src/lib/receipt.js` — exact money parsing, totals, validation, and amount-in-words.
- `src/lib/document.js` — Poppins-measured A4 pagination. The same positioned text/image/rectangle primitives produce both the SVG preview and jsPDF output; PDF text is not a screenshot.
- `public/assets/adplix-logo.png` — logo cropped from the supplied reference, without its customer/banking information.
- `public/assets/Poppins-LICENSE.txt` — bundled font licence.

Long customer names, services, and payment details wrap and continue onto additional pages. Blank optional payment fields are omitted. The reference's colours, logo, large title, red bands, two-column details, service table, and thank-you footer are retained; totals include explicit currency, decimals, and amount-in-words.

## Checks

```sh
npm test          # Currency/validation + real PDF extraction and page bounds
npm run test:e2e  # Chromium editor, validation, mobile, download and recovery
npm run build
npm audit
```

If Chromium is not installed for Playwright, run `npx playwright install chromium`. Browser checks use a dedicated local Vite server on port 5185. Test screenshots and failure traces are written to ignored `test-results/`.

`pdfjs-dist` is a test-only dependency pinned to a Node 20-compatible release; it is not shipped in the application. The production app uses jsPDF 4.2.1+.
