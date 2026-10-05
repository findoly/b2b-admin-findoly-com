# B2B catalogue, maps and mobile workflow QA

Date: 2026-10-06 (Asia/Kolkata)
Branch: `chatgpt-dev/b2b-catalog-maps-mobile`
Implementation reviewed: `bc2fef4`, with the QA corrections recorded alongside this report.

## Result

Automated checks pass. **Full integration and visual sign-off remains blocked.**
No production deployment, database migration or live geocoding was performed.

| Layer | Evidence | Result |
|---|---|---|
| Standard | Syntax checks across 126 JavaScript files; catalogue/location/report boundary tests | Pass |
| Deep | Architecture and scope guards; critical regression suite (89/89); HTTP authorization/CSRF/CSP tests; selector race and duplicate-option checks | Automated checks pass; pixel/layout verification blocked |
| Practical integration | Full suite: 125 passed, 0 failed, 1 skipped; 78 template/permission render variants; nine Alpine screen scenarios using fixtures | Local checks pass; live integration incomplete |

`npm run qa:production` was rerun after corrections and exited successfully.
The skipped test is the existing real MongoDB stock-reservation transaction test:
`MONGODB_URI` is not configured. The suite was deliberately run without a database URI.

## Corrections made during QA

| File | Correction |
|---|---|
| `public/js/catalogue-fields.js` | Deduplicate paginated options when a retained selected category/subcategory appears on a later page; prefer its refreshed label. |
| `views/product-form.ejs` | Reject an empty category on new or already-classified products, instead of silently preserving a cleared selection. Legacy unclassified products remain editable. |
| `public/js/operations-map.js` | A save finishing after another record is selected updates only its original record and does not replace the new record's confirmation message. |
| `test/catalog-selector-behavior.test.js` | Five regression tests covering pagination, stale responses, category validation and map selection during a save. |
| `test/catalog-map-http.test.js` | Five HTTP tests covering catalogue access, map data isolation, CSRF, map save/audit wiring and map-only CSP. |

## Additional evidence and limits

- All 39 EJS templates rendered with both full and restricted permissions. Inline scripts compiled in all 78 variants.
- Alpine scenarios passed for Categories, Subcategories, Sales Insights, Operations Map fallback/list, new/edit Product, Products, Sales Order detail and Fulfilment. These use a DOM emulator and API fixtures; they do not verify browser layout or real Google rendering.
- An in-memory aggregation evaluator verified distinct document counts across multiple product lines, values before GST, excluded cancelled/replacement demand, invoice totals, customer billing/delivery expansion and city filtering. This is supplementary evidence, not a MongoDB integration result.
- The existing test suite emits duplicate `expiresAt` index warnings from pre-existing models. Those models were not changed in this scope.

## Remaining checks before release

| Area | Remaining risk | Required verification |
|---|---|---|
| Mobile and desktop layout | Real wrapping, touch controls, overlays and layout have not been visually inspected. | Browser checks at 360/390/768/1440 px, including sidebar, mobile record cards, selectors, expanded progress and map/list toggles. The standard browser download returned an invalid archive; an alternative packaged Chromium exited with SIGTRAP in this environment. |
| MongoDB | Transaction behaviour, new indexes, migration and aggregation execution are not verified against a real server. | Use an isolated replica-set test database; review migration dry-run, verify resumability, create indexes, run transaction and catalogue/map/report flows. The existing transaction test drops its database, so do not point it at production. |
| Google Maps | Real map initialization, key restrictions, clustering and geocoding responses remain unverified. | Configure restricted browser/server keys and a Map ID in staging; test confirmed, approximate, no-result, quota/error and stale-address cases. |
| Historical classification | Older sales lines lack category snapshots and remain historical/unclassified. | Confirm product-label migration output and ranking labels with representative historical data. Historical commercial documents are not rewritten. |

Production release is not signed off by this report.
