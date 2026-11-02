# Compliance Pakistan — marketing website

The public website for **Compliance Pakistan** ("One Platform. Every Compliance."). A
standalone React + Vite app, separate from the FBR Digital Invoicing product in
`../frontend`. Introduces the company and its flagship service — FBR Digital
Invoicing — with the rest of the compliance roadmap (tax returns, withholding,
provincial sales tax, SECP filings) presented as what's coming next.

## Quick start

```bash
cd main_website
npm install
npm run dev      # http://localhost:5174
```

`npm run build` outputs to `dist/`; `npm run preview` serves that build locally.

## SEO

The build pre-renders every page to static HTML (`scripts/prerender.js` using
`src/entry-server.jsx`), so Google sees full content, plus per-page titles and
descriptions from `src/data/seo.js`, a `sitemap.xml`, `public/robots.txt`, and
schema.org business details in `index.html`. **Adding a page?** Add its route in
`App.jsx` and an entry in `src/data/seo.js`, or it won't be pre-rendered or in the
sitemap (and will 404 in production).

## Structure

```
src/
  components/   Navbar, Footer, Logo, ServiceCard, FbrFlow (animated stepper),
                InvoiceStack (hero receipt), Faq, CtaBand, Reveal (scroll-in), …
  pages/        Home, Services, FbrInvoicing, About, Contact, NotFound
  data/         site.js (brand/contact/nav), services.js, faqs.js — edit copy here
  styles/       base.css (tokens/type/buttons), layout.css (nav/footer/hero),
                sections.css (home-page sections), pages.css (inner-page blocks)
  assets/       logo.png / logo-light.png — full logo (shield + wordmark) for light /
                dark backgrounds; mark.png / mark-reverse.png — shield only. All cut
                from ../logo.jpeg with a transparent background
public/         favicons, apple-touch-icon, og-image.png
```

## Notable choices

- **Design tokens** (`styles/base.css`) are lifted from the logo: deep forest
  green (`--g-*`) + antique gold (`--gold-*`). Fraunces (serif, italic accents)
  for headings, Inter for body text, Montserrat for the wordmark.
- **No backend yet.** The contact form (`pages/Contact.jsx`) composes a
  `mailto:` link — there's nothing to wire up until an inbox/API exists.
- **`VITE_APP_URL`** (see `.env.example`): if set, a "Client login" button
  appears in the header/footer/mobile menu, pointing at the FBR Digital
  Invoicing app (`../frontend`). Left unset, it's hidden — set this once that
  app has a public URL.
- Copy and the CSV column list on the FBR Digital Invoicing page are kept in
  sync with `../backend/app/services/csv_processor.py` (required columns,
  CSV **and** Excel upload) and `../readme.md` — check both if either changes.
- All content lives in `src/data/*.js`; editing copy shouldn't require
  touching a component.

## Deploying

Deployed as its own Cloudflare Worker (static assets), config in this
directory's `wrangler.toml` — **completely separate from** the `fbr-integration`
Worker in `../wrangler.toml` that serves the product app. Different `name`,
different config file, deployed independently; running either deploy never
touches the other.

```bash
cd main_website
npm run build
npx wrangler deploy          # needs CLOUDFLARE_API_TOKEN in the environment
```

Live at **https://compliance-pakistan.ibad-jabbar.workers.dev**. Attach a
custom domain (e.g. `compliance.pk`) from the Cloudflare dashboard → Workers &
Pages → `compliance-pakistan` → Settings → Domains & Routes, once that
domain's DNS is on Cloudflare — no repo changes needed for that step.
