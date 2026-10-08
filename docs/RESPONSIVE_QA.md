# Findoly B2B Admin — Responsive QA Matrix

This document complements automated source-contract tests. **These checks are not a substitute for a live browser** and are not marked complete until someone tests an authenticated staging environment.

## Viewports and browsers

| Width | Device class | Browsers to verify |
| --- | --- | --- |
| 360px | Compact Android | Chrome Android |
| 375px | iPhone small | iOS Safari |
| 390px | iPhone standard | iOS Safari |
| 430px | iPhone large | iOS Safari |
| 768px | Portrait tablet | Safari / Chrome |
| 1024px | Tablet / small laptop | Safari / Chrome |
| 1280px | Laptop | Chrome / Edge |
| 1440px | Desktop | Chrome / Edge |

## Acceptance checks

- [ ] **Shell:** Header stays in one row, no cropped logo, menu/theme/user controls are at least 44×44px on mobile, no unwanted document-wide horizontal scrolling.
- [ ] **Navigation:** Mobile drawer opens/closes with overlay and Escape; focus moves inside and returns to menu; background content cannot receive focus while drawer is open; desktop navigation remains stable.
- [ ] **Order form:** Four numbered steps fit horizontally on 360–430px, labels are legible, active/completed states update, and no 18rem blank header gap occurs.
- [ ] **Order form actions:** Back, Continue, and Create remain reachable above the on-screen keyboard and Safari toolbar; disabled states are conveyed and working.
- [ ] **Lists:** Orders, Products, Customers mobile records wrap long names and status badges; action buttons never overlap or clip.
- [ ] **Finance:** Wide tables scroll inside their cards, first column remains visible, form labels map to controls, saving feedback prevents duplicate invoice actions.
- [ ] **Dashboard:** Metrics and recent orders do not flash false zeros while loading; retry button recovers from API failure.
- [ ] **Reports and S3:** Loading, empty states, upload progress and error feedback remain readable on phone and laptop.
- [ ] **Theme/accessibility:** Test default and dark/high-contrast presets, 200% zoom, keyboard focus visibility, reduced motion and accessible text contrast.
- [ ] **Laptop:** Verify metrics, form grids and table headings at 1024, 1280 and 1440px with no awkward card wrapping.
- [ ] **Regressions:** Test order creation, finance invoice/payment, sidebar permissions and fulfilment transitions; business logic remains unchanged.

## Automated checks

`npm run qa:production` includes `test/ui-responsive-regression.test.js` and all existing architecture, security, EJS-rendering and workflow tests. GitHub Actions additionally runs MongoDB transaction tests.

## Release gate

For each viewport, capture a screenshot of the order form header/timeline, list records, and finance layout. Log deviations and do not deploy until necessary visual fixes are verified. Browser sign-off remains **pending** until screenshots or authenticated staging results are recorded.
