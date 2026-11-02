// Per-page search titles and descriptions. Used by the browser (on navigation)
// and by scripts/prerender.js (baked into each page's HTML for Google).
// Keep titles under ~60 characters and descriptions under ~160.
export const siteUrl = 'https://compliance.pk'

export const pages = [
  {
    path: '/',
    title: 'Compliance Pakistan | FBR Digital Invoicing & Tax Compliance',
    description:
      'FBR digital invoicing integration, tax filings and corporate compliance for Pakistani businesses — in one platform. Submit invoices to FBR and get QR receipts.',
  },
  {
    path: '/services',
    title: 'Services | Compliance Pakistan',
    description:
      'FBR digital invoicing, NTN/STRN registration, sales and income tax returns, withholding tax, provincial sales tax and SECP filings for Pakistani businesses.',
  },
  {
    path: '/services/fbr-digital-invoicing',
    title: 'FBR Digital Invoicing Integration (PRAL) | Compliance Pakistan',
    description:
      'Connect to FBR Digital Invoicing through PRAL. Bulk CSV/Excel upload or single invoices, validated before submission, with FBR invoice numbers and QR receipts.',
  },
  {
    path: '/about',
    title: 'About Us | Compliance Pakistan',
    description:
      'Compliance Pakistan gives every Pakistani business clear, simple tax and regulatory compliance — starting with FBR digital invoicing.',
  },
  {
    path: '/contact',
    title: 'Contact Us | Compliance Pakistan',
    description:
      'Talk to Compliance Pakistan about FBR digital invoicing, tax registration and compliance for your business. Email info@compliance.pk.',
  },
]

export const notFoundPage = {
  title: 'Page not found | Compliance Pakistan',
  description: 'The page you were looking for does not exist.',
}

export function seoFor(pathname) {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return pages.find((p) => p.path === clean) || { ...notFoundPage, notFound: true }
}
