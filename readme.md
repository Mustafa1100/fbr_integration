FBR Integration Project

I want to design an FBR tax integration application

What it should have!
Step 1: create a mono repo for frontend (React Vite), Backend (FastAPI)

Step 2: There should be two dashboards
i. Admin Dashboard
ii. User Dashboard

i. Admin Dashboard
Into the Admin Dashboard, admin should be able to see the stats of user created
can see the list of the users, can create multiple users, activate them deactivate them.

ii. User Dashboard
Once the user is created, User can sign in into the dashboard
What is the real purpose of the User dashboard
user will first of all set up the FBR Tax integration details (We will use PRAL for the integration)
First of explore all the all the input and outputs of the PRAL. You should integrate the PRAL and store the output in DB as well.

For now what the user will do user will upload a valid csv format make sure to add the valid downloadable format for tax. Actually a let suppose a customer has the Point of Sale. He will provide the detail of the products in csv and upload into the dashboard. the system will process it and provide the receipt of the tax. For we dev we will use the sandbox account.

Note: No real deletion into the api for this you can set up isDeleted entry into the DB for the deletion. Also, both dashboard login should be tokenized. Also create the database schema by using the mysql for prod and sql lite for dev.

Create a todo list of each project while developing. You can take maximun time to finalize the while project

---

# Implementation

Monorepo: `backend/` (FastAPI) + `frontend/` (React + Vite). Invoices are submitted to
Pakistan FBR's Digital Invoicing system via the **PRAL DI API v1.12**.

## Quick start

**Backend** (terminal 1):

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/uvicorn app.main:app --reload --port 8000
```

**Frontend** (terminal 2):

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** and sign in with the bootstrap admin:
`admin@example.com` / `admin123` (set via `backend/.env`, created on first startup).

Run backend tests: `cd backend && .venv/bin/python -m pytest tests/`

## How it works

1. **Admin dashboard** — admin signs in, sees stats (users, uploads, invoices,
   submitted/failed), creates users, activates/deactivates/deletes them (soft delete —
   `is_deleted` flag, nothing is ever really removed).
2. **User dashboard** — a user signs in and first sets up their **FBR integration**
   (PRAL): environment (mock/sandbox/production), Bearer token from the IRIS portal, and
   seller profile (NTN/CNIC, business name, province, address).
3. The user downloads the **CSV template**, fills it with their POS product sales, and
   uploads it. Rows sharing the same `pos_invoice_no` become one invoice. Each invoice is
   submitted to FBR (PRAL) and the full request payload + FBR response is stored in the DB.
4. Every submitted invoice gets a **tax receipt** with the FBR invoice number and **QR
   code**, ready to print.

### CSV format

One row per product line. Required: `pos_invoice_no`, `invoice_date` (YYYY-MM-DD),
`product_description`, `quantity`, `unit_price`. Optional (with defaults): buyer fields,
`hs_code`, `rate`, `uom`, `sale_type`, `scenario_id`. Download the exact template from
the Uploads page (or `GET /api/uploads/template`).

## PRAL / FBR integration details

- **Endpoints**: sandbox `https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata_sb` and
  `validateinvoicedata_sb`; production drops the `_sb` suffix. Reference lookups
  (provinces, HS codes, UOMs, sale types) under `https://gw.fbr.gov.pk/pdi/`.
- **Auth**: `Authorization: Bearer <token>` — the token is issued in the IRIS portal
  (Digital Invoicing section), per environment. You never generate a JWT yourself.
- **Outputs stored in DB**: FBR invoice number (IRN), dated, full validation response
  JSON per invoice.
- **Sandbox scenarios** SN001–SN028 supported; `scenarioId` is attached automatically in
  mock/sandbox and omitted in production.
- **Mock mode** simulates FBR responses so development and demos work with zero
  credentials.

### Getting real credentials (one-time)

1. Business must be sales-tax registered (NTN + STRN) with an [IRIS](https://iris.fbr.gov.pk) login.
2. In IRIS → Digital Invoicing, request a **sandbox token**; PRAL provisions it and
   whitelists your static IP.
3. Paste the token in the user dashboard → FBR Settings, switch to `sandbox`.
4. Pass scenario testing (SN001–SN028 as applicable), then request the **production
   token** and switch to `production`.

## Database

SQLite for dev (default, zero setup). MySQL for prod — set in `backend/.env`:

```
DATABASE_URL=mysql+pymysql://user:password@host:3306/fbr_integration
```

Tables: `users`, `fbr_settings` (per-user PRAL config), `uploads`, `invoices`,
`invoice_items`. All deletions are soft (`is_deleted`); both dashboards use JWT bearer
tokens (`JWT_SECRET` in `backend/.env`).

## API overview

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/login`, `GET /api/auth/me` |
| Admin | `GET /api/admin/stats`, `GET/POST /api/admin/users`, `PATCH/DELETE /api/admin/users/{id}` |
| FBR settings | `GET/PUT /api/settings/fbr` |
| Uploads | `GET /api/uploads/template`, `GET/POST /api/uploads`, `DELETE /api/uploads/{id}` |
| Invoices | `GET /api/invoices`, `GET /api/invoices/{id}` (payload, response, QR), `POST /api/invoices/{id}/submit` (retry), `DELETE` (soft) |
| Reference | `GET /api/reference/{provinces,uoms,hs-codes,sale-types,scenarios}` |

Interactive API docs: http://localhost:8000/docs

## Official references

- [PRAL Technical Documentation for DI API v1.12](https://download1.fbr.gov.pk/Docs/20257301172130815TechnicalDocumentationforDIAPIV1.12.pdf)
- [FBR Digital Invoicing FAQs](https://powercabs.ie/wp-content/uploads/2025/09/DI-FAQs.pdf)
