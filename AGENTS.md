# Agent Guidelines for Jeong-Mo Choi's homepage

This is a personal academic homepage built on the al-folio v1 theme. Unused upstream demo content and theme-publishing automation have been removed.

## Site-specific release safety

For this personal homepage, first read `docs/SITE_MAINTENANCE.md`. All website changes require a separate branch, owner review, and explicit approval before production publication.

## Read This First

- Start with `.github/copilot-instructions.md` for architecture, ownership boundaries, and CI expectations.
- Use `docs/BOUNDARIES.md` as the source of truth for starter-vs-plugin ownership.
- Use `.agents/skills/al-folio-bootstrap/SKILL.md` for new-site setup tasks.
- Use `.agents/skills/al-folio-v1-migration/SKILL.md` for customized fork migrations.
- `.codex/skills` and `.claude/skills` are symlinks to `.agents/skills` for agent-specific discovery.

## What This Repo Owns

- Starter wiring (`Gemfile`, `_config.yml`)
- Starter content and documentation
- Cross-plugin integration tests
- Visual regression tests

Runtime/component logic belongs in owning plugin repos (`al_folio_core`, `al_folio_distill`, `al_search`, `al_icons`, `al_cookie`, and other `al-*` gems).
Long-form documentation lives in `docs/`; keep this root file as the short discovery entry point for coding agents.

## Validated Local Command Set

Run from repo root:

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

For rendered browser checks, follow `.github/workflows/pr-preview.yml`: serve `_site` on port 4173, then run `node bin/create-site-preview.js` and `node bin/audit-site-pages.js`. This site has an empty base URL, not `/al-folio`. Docker files are retained for optional local development, not image publication.

## Agent Routing Rules

- If change is starter wiring/docs/integration/visual testing: edit here.
- If change is runtime feature behavior: route to owning plugin repo.
- Do not add starter-local npm build scripts for theme/runtime assets.
- Keep docs aligned with pluginized v1 ownership.
- If you create or keep local overrides of plugin-owned files, run `bundle exec al-folio upgrade overrides audit` and commit `.al-folio-overrides.yml` after review.
