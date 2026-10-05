# Findoly B2B Admin

Separate Findoly B2B distribution operations application. It shares its **new B2B MongoDB database** with `b2b-findoly-com`, not with the existing service CRM.

Architecture follows the reference `admin-findoly-com`: EJS page shells, Alpine JSON APIs, controller -> service -> simple denormalized Mongoose models, named UUID application IDs, and no joins/populate.

## Setup
```bash
cp .env.example .env
npm install --no-package-lock
npm run qa:production
npm start
```

Use Node.js 20+. MongoDB transactions require Atlas/replica-set deployment for transactional procurement, inventory and finance operations.

First employee login uses `B2B_BOOTSTRAP_MOBILE`; successful OTP creates the initial Super Admin and default B2B roles. Remove the bootstrap mobile after initial setup if desired.

## HTML invoices
Invoices are structured database records rendered in HTML. PDF generation is intentionally deferred to a future API Gateway/Lambda integration.

## Delivery
The database supports internal and third-party delivery assignments. No delivery-agent website is included in this repository.

## Managed product categories and sales insights

Use **Categories** and **Subcategories** to create the catalogue structure before
assigning it to products. `categories.manage` controls catalogue writes; product
viewers can read the selectors. Super Admin already has access. Existing Admin
roles receive the new permission through the existing default-role sync; custom
roles need an explicit grant in Roles.

Existing product labels can be reviewed without changing data:

```bash
node scripts/run-with-runtime.js scripts/migrate-product-categories.js
# After reviewing the dry run and backing up product masters:
node scripts/run-with-runtime.js scripts/migrate-product-categories.js --apply
npm run ensure:indexes
```

The migration is resumable and only fills products without a category ID. It does
not rewrite historical orders or invoices. It normalizes whitespace/case for
matching names, leaves empty categories unclassified, and reports records changed
concurrently instead of overwriting them. Names with different spelling remain
separate for human review.

Sales Insights distinguishes order demand from issued invoices. Dates use Asia/
Kolkata days; values are before GST and return credits. Historical lines without
classification snapshots stay in the historical/unclassified group. Unit totals
are counts of the recorded selling units, not comparable physical weights across
SKUs. Counts in a category are distinct documents, not the sum of product counts.

## Operations map

Addresses are typed manually on customer, supplier-location and warehouse records.
There is no autocomplete or Places dependency. Use **Operations Map** to search,
geocode, review and confirm an address pin, or enter known coordinates directly.
Each billing/delivery address, supplier branch and warehouse has its own pin.
Location writes require the source record's edit permission. Lists expose only
record types the employee can already view.

Configure `GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_MAPS_GEOCODING_KEY`, and
`GOOGLE_MAPS_MAP_ID` in the deployment secret/config store. Enable billing, Maps
JavaScript API and Geocoding API in the Google project. Restrict the browser key
to your B2B admin HTTPS origin and Maps JavaScript API; restrict the server key to
server IPs and Geocoding API. Never use the server key in browser configuration.
The map CSP additions are confined to `/operations-map`; other pages keep the
existing policy. The network must allow Google API and map asset endpoints.

Google coordinate caches expire after 29 days via a MongoDB TTL index and are
excluded from reads immediately on expiry. Confirming a new lookup refreshes the
cache. Manually entered coordinates have no automatic expiry. Changing an address
invalidates the previous pin by address hash. Map writes never replace address
text. Missing API configuration leaves the location list and manual entry usable.

The map loads up to 50 addresses of each selected type at a time. Search and
**Load more locations** make larger datasets accessible; the marker and missing-pin
filters apply to loaded rows, with loaded/total counts shown. No mass geocoding
runs automatically. Google lookup requests are rate limited per employee.
