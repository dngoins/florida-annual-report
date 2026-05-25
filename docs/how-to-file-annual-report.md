# How to File Your Florida Annual Report

A step-by-step walkthrough for using the Florida Annual Report Automation Platform to prepare and submit your annual report to [Sunbiz.org](https://sunbiz.org).

> **Filing window:** January 1 – May 1 of each year. Late filings incur a **$400 penalty** and may result in administrative dissolution.
>
> **Critical:** Sunbiz has no public API. The platform fills the official Sunbiz form via browser automation, but **you (the user) must approve the submission and complete the CAPTCHA + payment steps in person**. Nothing is filed without your explicit consent.

---

## Before You Begin

You will need:

| Item | Why |
|------|-----|
| Your most recent **Articles of Incorporation** (PDF, DOCX, or scanned image) | Source document for entity data extraction |
| Your **Florida Document Number** (6–12 digits, from Sunbiz) | Identifies your entity on Sunbiz |
| Current **registered agent** name and Florida street address | Required field; cannot be a P.O. Box |
| Current **officer/director** names and addresses | Required for corporations; optional for LLCs |
| **FEIN** (Federal Employer Identification Number) | Required field on the report |
| A **credit/debit card or e-check** | Filing fee: **$138.75** (for-profit corp), **$150** (PLLC), **$61.25** (non-profit). Card surcharge applies. |
| An **email account you control** | Sunbiz sends the filing confirmation here |

Estimated time: **10–15 minutes** for a single filing.

---

## Step 1 — Start the Platform

If the stack isn't already running:

```powershell
./scripts/dev.ps1 -Detach
```

Wait until both URLs respond:

- Frontend → http://localhost:3000
- Extraction API → http://localhost:8001/health

> **Local dev note:** Authentication is intentionally disabled in local mode. A single implicit `system` operator is used for all actions. See [README → Local Development](../README.md#quick-start-local-dev). Auth is wired in for production deployments only.

---

## Step 2 — Upload Your Articles of Incorporation

1. Open http://localhost:3000 and click **Start: Upload & Extract** (or go directly to http://localhost:3000/upload).
2. Either click **Load sample text** to use the bundled demo, paste your Articles of Incorporation text into the textarea, or upload a `.txt` file.
3. Click **Extract fields →**.
4. The **Ingestion** + **Extraction Agents** process the document (NER + LLM fallback) and route you to the results page.

Typical processing time: **2–5 seconds** for text input. PDF/DOCX OCR (via `/documents` + `/extract`) takes 30–90 s and is available through the API but not yet wired into this demo UI.

> **Privacy:** In production, documents will be stored in encrypted Azure Blob Storage with per-tenant isolation and 7-year retention per Florida record-keeping rules. The local dev demo keeps extraction results only in your browser's `sessionStorage`.

---

## Step 3 — Review Extracted Data

The **Validation Agent** scores each extracted field's confidence (0.0 – 1.0). The UI Agent then renders a form pre-filled with what was found:

| Section | Fields |
|---------|--------|
| Entity | Document Number, Entity Name, Entity Type, FEIN |
| Principal Address | Street, City, State, ZIP |
| Mailing Address | Street, City, State, ZIP |
| Registered Agent | Name, Florida Street Address |
| Officers / Directors | Title, Name, Address (one row per person) |

**Color coding:**

| Color | Meaning | Action |
|-------|---------|--------|
| 🟢 Green | Confidence ≥ 0.90 | Verify and move on |
| 🟡 Yellow | Confidence 0.75 – 0.89 | Double-check against source |
| 🔴 Red | Confidence < 0.75 | **Must be reviewed and corrected before submission** |

You **cannot proceed to Step 6 until every red-flagged field is resolved.** This is the confidence gate.

---

## Step 4 — Reconcile with Live Sunbiz Records

1. Click **Reconcile with Sunbiz**.
2. The **Reconciliation Agent** scrapes the current public record for your Document Number and shows a side-by-side diff:

   ```
   Field                Extracted              Current Sunbiz         Action
   ──────────────────────────────────────────────────────────────────────────
   Registered Agent     John M. Smith          John M. Smith          ✓ No change
   Principal Address    123 Palm Beach Blvd    100 Ocean Dr           ⚠ Changed
   President            Sarah E. Johnson       (empty)                + Added
   ```

3. For each changed field, you have three choices:
   - **Keep new** — submit your update
   - **Keep current** — revert to Sunbiz value
   - **Edit** — type a third value

> **Tip:** If a change is unexpected, investigate before filing. An unauthorized agent change is a common indicator of identity theft against the entity.

---

## Step 5 — Preview and Approve

1. Click **Preview Filing**.
2. A read-only preview of the completed Sunbiz form opens, showing the **exact payload** that will be submitted.
3. Review every field one final time.
4. Check the legal attestation box:

   > *"I certify that I am authorized to file this report on behalf of the entity and that the information provided is true and correct."*

5. Click **Approve & Submit**. The API call sets `user_approved: true` — **this is the only way the platform will initiate Sunbiz submission.**

---

## Step 6 — Complete CAPTCHA and Payment

The **Automation Agent** launches a Playwright browser session that fills the Sunbiz form. At two points it **stops and hands control to you**:

1. **CAPTCHA** — A pop-up shows the live Sunbiz CAPTCHA. Solve it and click **Continue**.
2. **Payment** — The Sunbiz payment screen is shown. Enter your card or e-check details directly into the Sunbiz form. The platform **never sees, stores, or transmits your payment information.**

> If you walk away for more than 10 minutes, the Sunbiz session expires and you'll need to restart from Step 5. Your data is preserved.

---

## Step 7 — Capture the Confirmation

After payment succeeds:

1. Sunbiz displays a confirmation number and emails you a receipt PDF.
2. The Automation Agent captures the confirmation page and receipt and stores them in `submissions` table + Blob Storage.
3. The **Audit Agent** writes an immutable record:
   - `submission_id`
   - `confirmation_number`
   - `submitted_at` (UTC)
   - `submitted_by` (your user ID)
   - SHA-256 hash of receipt PDF
4. You'll see a green success banner: **"Filing #L24000123456 submitted successfully."**

---

## Step 8 — Download Your Records

From the **Filings** page you can download at any time:

- ✅ Original uploaded document
- ✅ Extracted data (JSON)
- ✅ Reconciliation diff (JSON)
- ✅ Sunbiz confirmation page (HTML/PDF)
- ✅ Receipt PDF
- ✅ Audit trail (CSV)

Keep these for **at least 4 years** for Florida tax/legal purposes.

---

## What If Something Goes Wrong?

| Problem | What happens | What to do |
|---------|--------------|------------|
| Extraction confidence too low | Submission blocked at Step 4 | Edit fields manually; the form accepts any valid input |
| Sunbiz site is down | Recovery Agent retries up to 3 times with backoff | Wait; you'll be notified on success or final failure |
| Payment declines | Sunbiz shows error; no charge made | Re-enter card or use a different one |
| CAPTCHA fails 3 times | Sunbiz locks the session | Wait 15 min, restart from Step 5 |
| Browser session crashes mid-submission | Recovery Agent escalates to "manual mode" | Use the **Manual Submit** button to get a checklist of steps to file directly on Sunbiz |
| You submitted with a typo | Filings cannot be amended without a separate Sunbiz process | File an **Amended Annual Report** ($61.25 fee) through the same platform |

All failures and retries are logged. Nothing fails silently.

---

## Bulk Filings (Multiple Entities)

If you manage several entities (e.g., a holding company structure):

1. Go to **Filings → Bulk Import**.
2. Upload a CSV with one row per entity (`document_number`, `articles_pdf_path`).
3. The platform processes each entity through Steps 2–4 in parallel and surfaces a single review queue.
4. You still must approve and complete CAPTCHA/payment **per entity** (Sunbiz requirement).

Typical throughput: **20–30 filings per hour** with one operator.

---

## Compliance Checklist

Before you click **Approve & Submit**, confirm:

- [ ] Filing window is open (Jan 1 – May 1) — or you accept the $400 late penalty
- [ ] Entity name matches Sunbiz exactly (no rebrand)
- [ ] Registered agent has a real Florida street address (no P.O. Box)
- [ ] FEIN is correct (9 digits, IRS-issued)
- [ ] All officers/directors listed (corporations) — name + address each
- [ ] Email on file is one you actually monitor (Sunbiz uses it for legal notices)
- [ ] You are legally authorized to file for this entity

---

## Related Documentation

- [Regulatory Requirements](reference/regulatory-requirements.md) — Florida statutes, fees, deadlines
- [Product Requirements](reference/product-requirements.md) — Full feature list and personas
- [Risk & Compliance](reference/risk-compliance.md) — Security, audit, disaster recovery
- [Sunbiz Integration](../integrations/sunbiz/README.md) — How the Playwright automation works
- [Sample HTTP Requests](../scripts/sample-requests.http) — Test the extraction API directly

---

*Need help?* File an issue at [github.com/dngoins/florida-annual-report/issues](https://github.com/dngoins/florida-annual-report/issues) or contact your platform administrator.
