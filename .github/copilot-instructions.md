# Copilot Coding Agent Instructions (v1.x)

## Repository Role

This repository is Jeong-Mo Choi's personal academic homepage, using the pluginized al-folio theme.

Read `docs/SITE_MAINTENANCE.md` first. Prepare changes on a separate branch and submit a draft PR. Publish only after the owner approves the final changes. Demo content and upstream publishing automation were removed; do not reintroduce them.

This repo owns starter configuration, docs, sample content, integration tests, and visual parity checks.

## Ownership Boundaries

Follow `docs/BOUNDARIES.md`.

- Starter (`al-folio`) owns:
  - `Gemfile`, `_config.yml`
  - bilingual personal content (`_pages`, `_data`, `_bibliography`, `teaching`)
  - docs
  - integration tests (`test/integration_*.sh`)
  - browser audits (`bin/create-site-preview.js`, `bin/audit-site-pages.js`)
- Plugin repos own:
  - runtime/component logic
  - component correctness/unit tests
  - feature-specific assets

Do not reintroduce plugin-owned runtime assets into starter paths unless intentionally overriding behavior.

## Plugin Naming and Featuring

- Theme-coupled plugins: repo `al-folio-<feature>`, gem/plugin id `al_folio_<feature>`.
- Reusable plugins: repo `al-<feature>` (or neutral), gem/plugin id aligned to namespace.
- Plugin catalog demos are not part of this personal site.

## Core Stack

- Jekyll (Ruby)
- Node tooling only (Prettier, Playwright)
- No starter-local Tailwind build pipeline

## High-Signal Paths

- `_config.yml` - starter plugin wiring and feature flags
- `test/style_contract.js` - starter contract checks
- `test/integration_*.sh` - cross-plugin integration checks
- `test/site_seo_checks.py` - public routes, search policy, typography and teaching preservation
- `.github/workflows/` - CI workflows
- `docs/` - user, maintainer, upgrade, and plugin-system documentation
- `.agents/skills/al-folio-bootstrap/SKILL.md` - canonical agent workflow for new site setup
- `.agents/skills/al-folio-v1-migration/SKILL.md` - canonical agent workflow for customized fork migration
- `.codex/skills` and `.claude/skills` - symlinks to `.agents/skills`

## Validated Commands

```bash
npm ci
npm run lint:prettier
npm run lint:style-contract
JEKYLL_ENV=production bundle exec jekyll build
python3 test/site_seo_checks.py
bash test/integration_plugin_toggles.sh
bash test/integration_bootstrap_compat.sh
bash test/integration_upgrade_cli.sh
bash test/integration_css_minify.sh
bundle exec al-folio upgrade audit
bundle exec al-folio upgrade overrides audit
```

## CI Expectations

Keep these workflows aligned when changing starter behavior:

- `unit-tests.yml`
- `site-pr-checks.yml` (build, SEO, local links and upgrade audit)
- `pr-preview.yml` (personal-site screenshots and full-site audit)
- `deploy.yml`

## Editing Guidance

- Prefer starter wiring/docs/content changes in this repo.
- Route runtime/layout/feature fixes to owning plugin repos.
- Keep all contributor guidance consistent with v1 ownership boundaries.
- When a site keeps local overrides of plugin-owned files, run `bundle exec al-folio upgrade overrides audit` and update `.al-folio-overrides.yml` after reviewing diffs.
