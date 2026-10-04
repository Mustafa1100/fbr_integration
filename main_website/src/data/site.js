// Central place for brand + contact details. Edit here, not in components.
export const site = {
  name: 'Compliance Pakistan',
  domain: 'compliance.pk',
  tagline: 'One Platform. Every Compliance.',
  // TODO: confirm the real inbox before launch — the contact form composes an email to this address.
  email: 'hello@compliance.pk',
  location: 'Pakistan',
  // The FBR Digital Invoicing app. Set VITE_APP_URL to show a "Client login" button.
  appUrl: import.meta.env.VITE_APP_URL || '',
}

export const navLinks = [
  { to: '/', label: 'Home', end: true },
  { to: '/services', label: 'Services', end: true },
  { to: '/services/fbr-digital-invoicing', label: 'FBR Digital Invoicing' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
]

export const regulators = [
  'FBR',
  'PRAL',
  'IRIS',
  'SECP',
  'SRB',
  'PRA',
  'KPRA',
  'BRA',
  'EOBI',
  'SBP',
]
