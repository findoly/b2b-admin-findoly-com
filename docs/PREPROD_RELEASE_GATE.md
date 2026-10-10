# B2B pre-production release gates (2026-10-11)

Release status: **not approved for deployment**. The current work creates a reviewable PR; merging and production rollout are separate decisions.

## Required gates

1. Ensure the admin and customer-portal schemas are deployed together or with tested forward/backward compatibility. Payment allocations marked `reversedAt` must not count as active allocations in the portal.
2. Run `npm ci`, `npm run qa:production` and `npm run qa:transactions` with a **disposable replica-set database**. Transaction tests drop their database; never point them at production.
3. On the admin deployment, set strong HTTPS/secret configuration and create the `b2badminsessions` TTL index with `npm run ensure:indexes`. Existing pre-upgrade login cookies will require a fresh OTP login, since older cookies contain no server-side session ID.
4. Manually exercise OTP login, single-device logout, concurrent authenticated sessions, employee suspension and role changes, then reconfirm portal login and access isolation.
5. Confirm stock reserve, pick, dispatch, return, allocation/reversal, invoice void, reconciliation and payment-retry flows against a staging database with seeded realistic transactions.
6. Reconcile invoice outstanding, customer/supplier advances, return settlements and inventory balance sums against immutable transaction histories. Escalate mismatches before release.
7. Capture authenticated mobile and desktop screenshots at 360, 375, 390, 430, 768, 1024, 1280 and 1440px, both themes and at 200% zoom. Inspect Finance, orders, customer mapping, dashboard, dropdowns, and navigation.
8. Verify S3 prefixes, OTP availability, Google map quotas/key restrictions, error monitoring, application health probes, MongoDB replica set, backups and a **tested restore**.
9. Protect the `prod` branch with required passing `qa` and `transactions` checks, PR reviews and no direct pushes. This setting is external to repository code.
10. Execute staged smoke tests and a documented rollback. Explicit release-owner approval is required before deployment.

## Further feature specifications required before implementation

The following were recommendations, not approved technical contracts: quotations and RFQs, cross-warehouse stock transfers, customer collections/reminders, bulk master-data imports, batch/expiry/serial tracking, and legal credit/debit-note document issuance. Their acceptance criteria, permissions, financial treatment, concurrency semantics and UI flows must be specified before writing production logic.
