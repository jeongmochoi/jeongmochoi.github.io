# Personal homepage maintenance

Read `AGENTS.md` and `docs/SITE_MAINTENANCE.md` before editing. This repository publishes Jeong-Mo Choi's bilingual academic homepage, not the al-folio demonstration site.

- Prepare changes on a separate branch and open a draft PR with Korean review notes.
- Never merge, push to `main`, or publish without explicit approval of the final changes.
- Preserve existing design, public URLs, search settings and teaching materials.
- Use the validation commands in `AGENTS.md` and the site-specific checks in `.github/workflows/site-pr-checks.yml`.
- Follow `docs/BOUNDARIES.md` for plugin ownership. Keep intentional local overrides recorded in `.al-folio-overrides.yml`.
- Use `.github/workflows/pr-preview.yml` for screenshots and browser audits; the base URL is empty.
- Removed theme examples and obsolete automation can be recovered from Git history. Do not restore them just to satisfy upstream demo tests.
- GitHub Pages deploys approved `main` pushes using Actions artifacts. The old `gh-pages` branch is retained only for rollback; there is no manual `bin/deploy` path.
