export const homeFaqs = [
  {
    q: 'What is FBR Digital Invoicing?',
    a: 'It is FBR’s system for reporting sales invoices electronically through PRAL. Each accepted invoice gets a unique FBR invoice number and a QR code. Which businesses must use it, and from when, depends on FBR’s notifications for your sector — we help you work out where you stand.',
  },
  {
    q: 'Do I need my own FBR token?',
    a: 'Yes. Digital Invoicing tokens are issued to your business (NTN) from the IRIS portal, first for the sandbox and then for production. We walk you through requesting both and connecting them to your account.',
  },
  {
    q: 'Can I submit invoices in bulk?',
    a: 'Yes. Export your sales from your POS or accounting software, upload the CSV or Excel file, and every invoice is validated and submitted for you. You can also create a single invoice by hand whenever you need to.',
  },
  {
    q: 'What happens when FBR rejects an invoice?',
    a: 'The exact error FBR returns is shown against that invoice. Fix the data and retry it in one click — nothing is lost, and the failed attempt stays in your history.',
  },
  {
    q: 'What else will Compliance Pakistan cover?',
    a: 'Digital invoicing is where we start. Tax registration and returns, withholding and payroll tax, provincial sales tax, SECP filings and a unified deadline calendar are on our roadmap, all in the same platform.',
  },
  {
    q: 'How do I get started?',
    a: 'Send us a message. We’ll confirm what applies to your business, set up your account and help you connect to FBR’s sandbox so you can test before going live.',
  },
]

export const fbrFaqs = [
  {
    q: 'Which file formats can I upload?',
    a: 'A CSV or Excel (.xlsx) file with one row per product line. Rows that share the same POS invoice number become one invoice. The required columns are the POS invoice number, invoice date, product description, HS code, quantity and unit price; buyer details, tax rate, unit of measure and sale type are optional and fall back to sensible defaults.',
  },
  {
    q: 'Do you support FBR’s sandbox scenarios?',
    a: 'Yes. Sandbox scenarios SN001–SN028 are supported, and the scenario ID is attached automatically in sandbox and left out in production, so you can complete FBR’s scenario testing and then switch to your production token.',
  },
  {
    q: 'What does the receipt include?',
    a: 'The FBR invoice number returned by PRAL, your seller details, buyer details, line items, tax breakdown and a QR code. Receipts can be printed one at a time, or all of a customer’s receipts as a single multi-page PDF.',
  },
  {
    q: 'Can I fix and resubmit a failed invoice?',
    a: 'Yes. Edit the invoice, retry the submission, and the result rolls back up into that upload’s counters. Failed files can also be retried as a whole.',
  },
  {
    q: 'Is anything ever permanently deleted?',
    a: 'No. Deletions are soft: records are flagged as deleted and hidden, never erased, so your audit trail stays intact.',
  },
  {
    q: 'Can I try it without FBR credentials?',
    a: 'Yes. A mock mode simulates FBR’s responses, so you can explore the full flow — upload, validation, receipts — before your sandbox token arrives.',
  },
]
