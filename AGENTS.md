# AGENTS.md — Findoly B2B Admin

**Mandatory entry point for AI coding assistants, automated agents and human contributors.**

Before reading or editing any screen, consult:
1. [UI_RULES.md](UI_RULES.md) — **mandatory UI/UX and responsive quality standard**.
2. [PROJECT_STANDARDS.md](PROJECT_STANDARDS.md) — architecture, security, IDs, finance and scope constraints.
3. [FEATURE_SCOPE.md](FEATURE_SCOPE.md) — allowed vs. prohibited product features.
4. [docs/RESPONSIVE_QA.md](docs/RESPONSIVE_QA.md) — responsive acceptance and real-device verification.
5. [DATA_MODEL_RULES.md](DATA_MODEL_RULES.md) when models, IDs or relationships are relevant.

## Required work process

- **For production UI/EJS/HTML/CSS work:** First perform **Phase 1 (Audit & Plan)**, list specific fixes and improvements, then request explicit user approval. **Do not produce or modify production UI code in Phase 1.** Execute only the approved scope in **Phase 2**.
- Read the **latest target branch** and inspect existing EJS/Bootstrap/Alpine CSP/CSS behavior. Prefer small scoped changes, preserve the Findoly CRM design and avoid unrelated refactors.
- Reuse the existing mobile drawer, responsive table/card transformations, mobile filter utilities, upload helper and safe transactional workflows.
- Maintain accessible 44px mobile touch targets, consistent spacing, horizontal four-step mobile sales-order progress, usable laptop grids and theme-friendly focus states.
- Use a focused branch and PR, add regression tests, run production/transaction QA and record mobile/laptop visual checks separately. Do not claim unperformed browser checks have passed. Merge/deploy only with authorization.

**If instructions conflict:** Keep `PROJECT_STANDARDS.md` and `FEATURE_SCOPE.md` authoritative for architecture/security/business rules; `UI_RULES.md` governs approved UI behavior. Ask before changing unclear or conflicting requirements.

**Documentation-only tasks** may update Markdown on direct user request; they do not authorize unrelated production UI edits.
