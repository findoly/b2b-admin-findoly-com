# Findoly B2B Admin — UI/UX Rules (Mandatory)

> **Applies to every human or AI contributor making UI changes in this repository.**
> Read this together with `PROJECT_STANDARDS.md`, `FEATURE_SCOPE.md`, and `docs/RESPONSIVE_QA.md` before proposing or modifying a screen.
> This is a permanent, project-specific implementation contract, **not** a request to redesign existing screens.

## 1. Workflow: audit, approval, then code

1. **Phase 1 — audit and plan:** Review the *latest target branch*, the relevant EJS page, partials, JS runtime, actual CSS cascade and existing tests. Explain confirmed bugs separately from optional enhancements. Supply exact file/component changes, mobile/tablet/laptop behavior, accessibility and regression risks.
2. **Approval gateway:** Ask: **"Please review the list above and reply with 'Approved' or specify which changes you want me to modify/remove before I generate the final code."**
3. **Phase 2 — implementation:** Only after explicit approval, implement the approved UI scope. No early EJS, HTML or CSS production-code output, direct UI file edits, scope expansion or unrelated refactoring.
4. Make a focused GitHub branch and PR targeting the latest `prod` unless the user explicitly authorizes another workflow. Check that `prod` has not moved before editing/merging. Never treat a successful PR as a deployment.
5. Documentation-only requests explicitly asking for a document may be completed without a new UI-code approval; this does **not** waive the gateway for actual UI changes.

## 2. Existing technology and source of truth

- **Frontend:** server-rendered EJS page shells, semantic HTML5, Bootstrap CRM components and the installed Alpine CSP build. Preserve existing route → EJS shell → Alpine JSON API → controller → service → Mongoose architecture.
- **Core files:** `views/partials/head.ejs`, `navbar.ejs`, `sidebar.ejs`, `scripts.ejs`, `public/css/app.css`, `public/css/b2b-workspace.css`, `public/css/mobile-filters.css`, `public/js/b2b-workspace.js`, and `public/js/mobile-filters.js`.
- **Rules of the cascade:** Inspect selectors and stylesheet order first. `app.css` contains the established CRM shell; `b2b-workspace.css` holds scoped B2B responsive refinements; `mobile-filters.css` and its JS already implement compact mobile filters. Reuse these before introducing anything new. Change stylesheet cache-version parameters when a modified asset needs fresh delivery.
- **Keep the current Findoly visual language:** compact Bootstrap cards, calm business colors, Inter fonts, established theme variables, badges, tables and form controls. No replacement design system, uncontrolled Tailwind migration, new framework, global reset or generic dashboard redesign.
- **Alpine CSP:** Keep expression attributes compatible with `@alpinejs/csp` and the repository's `test/ui-contract.test.js` checks. Avoid complex inline expressions, optional chaining, nullish coalescing, arrow functions, spread, template literals and browser globals in Alpine attributes; use named methods in a nonced script when needed. Keep EJS partial inclusion, CSRF token wiring and script nonces intact.
- Do not expose API JSON, raw MongoDB IDs, request payload editors, developer logs or internal debug controls as human-facing UI. Never bypass permissions, server-side validation, finance idempotency, inventory safeguards or workflow state machines.

## 3. Visual system and layout rhythm

| Item | Standard |
| --- | --- |
| Spacing | Base **8px**: 8, 16, 24, 32px for normal gaps; 4 or 12px only when visually justified |
| Cards | Consistent headers, body/footer padding, existing borders/radii and theme surfaces |
| Type hierarchy | Page title → section title → label → helper text; no arbitrary per-page font scales |
| Form labels | Explicit visible label with matching `for`/`id`, or clear accessible name for icon-only/compact fields |
| Primary actions | One prominent action per context; secondary/destructive actions consistently differentiated |
| Interactive size | **At least 44 × 44 CSS px on mobile** for buttons, nav controls, pagination and workflow steps |
| Long content | Wrap business names, IDs shown as secondary metadata, money and labels appropriately; do not clip |
| Status | Same semantics, text and theme badge treatment across Orders, Inventory, Procurement, Delivery and Finance |

- Scope spacing fixes to the component. A shared flex-basis or min-height must **not** turn into a tall blank area when a header changes from row to column.
- Explicitly check the historical regression: `.crm-card-heading > :first-child { flex: 1 1 18rem; }` must not produce a **vertical 18rem gap** inside stacked mobile order-wizard headers.
- Never fix layout by hiding required information, imposing unexplained fixed heights, adding arbitrary large margins, or applying broad `!important` declarations.
- User theme tokens take precedence over hard-coded colors. Support the existing appearance presets and color-scheme/contrast preferences without changing their meaning.

## 4. Responsive acceptance rules

| Width | Required behavior |
| --- | --- |
| **360–430px phones** | Single-column forms/content; horizontal four-step sales-order timeline; readable labels; accessible full-size actions; no page-wide sideways scroll |
| **768–1024px tablets** | Adapt content grids, use the existing collapsible navigation below its 992px breakpoint; avoid squeezed form controls and card collisions |
| **1280–1440px+ laptops/desktops** | Keep the full CRM sidebar and concise information-dense card/table layout; align header actions and avoid oversized empty regions |

- Test widths **360, 375, 390, 430, 768, 1024, 1280, 1440px**; also test zoom to 200%, browser font scaling and long translated/real-world labels where possible.
- Keep topbar on one row without covering the brand, menu, appearance or account controls.
- Drawer behavior: close with overlay and Escape, move focus inside when opened, trap focus while modal, return focus on close, prevent background interaction while open, and restore scrolling.
- Avoid desktop/mobile breakpoint disagreements. Respect existing `max-width:767.98px` and `max-width:991.98px` policies rather than adding arbitrary new breakpoints.
- Prefer content-driven min/max widths, `min-width:0` where flex/grid items need shrinkability, and responsive wrapping over fixed pixel widths.

## 5. Sales-order wizard — canonical mobile pattern

- On phones, all four stages appear **horizontally** as Customer → Products → Warehouse → Review: numbered circles, short legible labels, active/completed states and accessible current-step indication.
- Do not change this to a tall vertical step list on phones, or require horizontal page scrolling to access a stage.
- Hide only redundant long descriptions on phones; keep them available on wider screens and retain accessible step names/status.
- Keep “Create sales order,” its description, `Step N of 4` and progress indicator compact without whitespace spikes.
- Reuse established draft persistence, pricing and warehouse-availability checks, completed-stage navigation and server enforcement. Do not weaken validation or allow skipping unavailable steps.
- Sticky phone actions are **one set** of Back/Continue/Create controls, respect safe-area insets and mobile virtual keyboards, keep 44px targets and show meaningful saving/disabled state. Never duplicate submission controls.

## 6. Tables, records, filters and forms

- Standard operational lists use established `crm-mobile-records` conversion for phones. **`public/js/b2b-workspace.js` already inserts `data-label` from table headings, including dynamic rows**; do not redundantly reimplement it.
- Where intentionally used, maintain the dedicated mobile Orders record cards. Their action buttons must wrap and remain usable at 360px.
- Wide finance or multi-column ledger tables may scroll **inside their table container**, not the whole page. Preserve header text and meaningful first-column context; don't cut off amounts or actions.
- Keep filter bars consistent with the existing `public/js/mobile-filters.js` search/filter drawer behavior, counts and clear/reset patterns. Don't add a competing filter mechanism.
- Show labels and units in business language: amounts in **₹** in editable views while persistence remains integer paise; quantities and tax rates have clear meaning. Use correct input mode, select labels, form grouping and help text.
- Validation errors should identify the affected action/field and how to recover. Do not rely only on placeholder text or red borders.
- On touch devices, all row actions, icon buttons and pagination controls meet the 44px target and are accessible by keyboard/screen reader.

## 7. Loading, empty, error and transaction safety

- Every data-fetching screen has distinguishable **loading, ready, empty and error** states; do not show “No records” or fake zero totals before the request resolves.
- Loading skeletons/spinners preserve reasonable space and have appropriate accessible status; errors provide a retry where safe and keep last good values if appropriate. Avoid flicker and layout jumps.
- Provide a helpful empty state with a relevant permitted action; never show a creation link if the employee lacks permission.
- Prevent duplicate finance, inventory and fulfilment submissions with in-flight guards and disabled button state; retain idempotency keys for uncertain payment retries, and refresh authoritative state on server conflict when appropriate.
- For S3 media, preserve the shared signed POST/PUT upload helper and its progress callbacks; show progress only if measurable, and always show eventual success/failure accurately.
- Existing data validation, authorization and backend business rules remain the source of truth. UI affordances must not be mistaken for security checks.

## 8. Accessibility and theme requirements

Target **WCAG 2.1 AA** and evaluate behavior, not only markup:
- Semantic landmarks, one logical page heading, sensible heading levels and properly associated labels.
- Visible keyboard focus; correct focus order, no keyboard traps outside deliberate modal dialogs, Escape to dismiss and focus restoration.
- Text contrast **4.5:1** for normal text and **3:1** for large text; meaningful non-text UI boundaries and focus indicators should have sufficient contrast. Check each existing theme rather than assuming tokens always pass.
- Convey statuses/errors with text, not color alone; use `aria-live`/`role="alert"` intentionally without duplicate ARIA attributes or noisy announcements.
- Respect `prefers-reduced-motion` and avoid unnecessary motion, forced smooth scrolling or inaccessible carousels.
- Responsive content must not lose functionality at 200% zoom or with large system fonts. Test real touch targets and screen-reader names.

## 9. CSS and performance stability

1. Diagnose computed layout and source order; check global CSS, workspace overrides and component nesting before making a change.
2. Prefer a small **component-scoped** change in existing files instead of global selectors, new CSS frameworks, duplicated variants or widespread `!important`.
3. Do not change stylesheet loading order, CSP, font or theme presets without an explicit plan, approval and appropriate tests.
4. Do not rely on viewport-specific hiding to conceal overflow bugs. A table may scroll within its own region; the application shell must not unintentionally scroll sideways.
5. Avoid unnecessary observers, duplicate event listeners, unbounded API requests, large image payloads or new dependencies; preserve current Alpine state lifecycles.
6. Avoid changes to financial calculations, order workflows and service logic under the pretext of visual cleanup.

## 10. Testing, QA and merge gate

**Automated contract checks (mandatory):**
- Run `npm run qa:production`, including all existing UI, architecture, EJS, CSP, security and operational checks.
- Run `npm run qa:transactions` (MongoDB replica set required) or verify the equivalent GitHub Actions transaction job.
- Add/update narrow regression tests for each fixed mobile/desktop bug; protect the approved breakpoints, semantics and key interactive behavior.
- For a substantive UI change, obtain **three clean automated test rounds on the final PR head**, checking production QA and transaction jobs each round, unless the user explicitly accepts another cadence. Report each attempt accurately; never call a queued run “passed.”
- Review the final diff for out-of-scope files and check that the PR is mergeable against the latest `prod`.

**Real-device/browser verification (separate release gate):**
- Follow `docs/RESPONSIVE_QA.md` for authenticated Safari/Chrome/Edge viewport coverage, screenshots, keyboard, contrast, long text, zoom, form and workflow checks.
- Mark actual browser tests **pending** if unavailable. Source assertions and passing CI are **not** proof of pixel-perfect mobile rendering or accessibility conformance.
- Do **not** deploy before required browser sign-off. Only merge when the user or project release owner authorizes it, unless the request explicitly delegates merging under the established review process.
- If a change cannot be fully verified, identify the blocker, affected screens and exact next test—do not invent results.

## 11. Definition of done for every UI PR

- [ ] User-approved scope is recorded; no unrelated product or backend refactor.
- [ ] Mobile 360–430px, tablet 768–1024px and laptop 1280–1440px behaviors are designed and tested appropriately.
- [ ] 8px rhythm, no giant flex gaps, no clipped headings or page-wide overflow.
- [ ] Existing CRM shell, brand tokens, permissions and business labels preserved.
- [ ] 44px mobile targets; correct labels, focus, contrast and status feedback.
- [ ] No duplicate mobile/desktop controls causing double submission; workflows remain safe.
- [ ] Scoped CSS; no CSP or Alpine evaluator regressions; cache busting reviewed.
- [ ] Automated QA and transaction results recorded (three clean rounds for substantive UI changes).
- [ ] Manual responsive/browser findings recorded separately; no invented sign-off.
- [ ] PR documents changes, screenshots when available, tests and deployment status.

**Conflict rule:** `PROJECT_STANDARDS.md` and `FEATURE_SCOPE.md` still govern architecture, domain logic and authorized scope. A UI change cannot override them. Ask for clarification if a rule conflicts with a new explicit user instruction.
