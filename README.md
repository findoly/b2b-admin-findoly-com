# Findoly B2B Admin

Separate Findoly B2B distribution operations application. It shares its **new B2B MongoDB database** with `b2b-findoly-com`, not with the existing service CRM.

Architecture follows the reference `admin-findoly-com`: EJS page shells, Alpine JSON APIs, controller -> service -> simple denormalized Mongoose models, named UUID application IDs, and no joins/populate.

## Setup
```bash
cp .env.example .env
npm ci
npm run qa:production
npm start
```

Use Node.js 20+. MongoDB transactions require Atlas/replica-set deployment for transactional procurement, inventory and finance operations.

First employee login uses `B2B_BOOTSTRAP_MOBILE`; successful OTP creates the initial Super Admin and default B2B roles. Remove the bootstrap mobile after initial setup if desired.

## HTML invoices
Invoices are structured database records rendered in HTML. PDF generation is intentionally deferred to a future API Gateway/Lambda integration.

## Delivery
The database supports internal and third-party delivery assignments. No delivery-agent website is included in this repository.
