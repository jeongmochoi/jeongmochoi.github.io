# Website maintenance and release policy

This repository publishes https://jeongmochoi.github.io, the site owner's academic homepage. This site-specific policy supplements the upstream al-folio instructions in `AGENTS.md` and `.github/copilot-instructions.md`.

> **Agent rule:** Never commit or push directly to `main`, merge a pull request, enable auto-merge, manually dispatch a production deployment, or change publishing settings without the site owner's explicit approval. Prepare changes on a separate branch for review.

## Natural-language change requests

1. Treat the owner's message as the specification. Inspect the relevant existing files before editing, and avoid unrelated redesigns or upgrades.
2. For an actual change, create a descriptive branch from the latest `main` (for example `site/update-publications`). Keep the public site unchanged during drafting and review.
3. Edit only necessary files. Typical content locations include `_pages/` (English and Korean pages), `_bibliography/` (publications), `_books/`, `_news/`, and `assets/`. Verify the actual layout before choosing paths.
4. Preserve the site's existing design, navigation, URLs, and bilingual structure unless the request explicitly changes them. Do not invent academic publications, achievements, dates, affiliations, links, images, or translations; flag missing facts for confirmation.
5. Run relevant validation (at minimum a Jekyll build for site changes; formatting and tests when relevant). Report any check that could not be run. Never claim a check succeeded without evidence.
6. Create a **draft pull request** targeting `main`, with an explanation in Korean of what changed, affected pages, tests, and limitations. Provide screenshots or another verifiable preview where possible. Keep the draft open for the owner's feedback and revisions.
7. **Stop before publication.** Merge or publish only after the owner explicitly approves the specific final changes (for example, "이 PR을 배포해"). No autonomous merging or production publication.

An instruction to prepare, revise, check, or show a result is not permission to publish it. When feedback requests further edits, update the same PR and request review again.

## Preview and checks

- `.github/workflows/deploy.yml` builds pull requests but does not publish them.
- `.github/workflows/site-pr-checks.yml` provides a consistent Jekyll build status for all PRs (after the CI PR is merged).
- `.github/workflows/pr-preview.yml` provides screenshot artifacts for English/Korean page entry points when relevant site files change (after the screenshot PR is merged). These are not live preview URLs. For an edited subpage not included in those screenshots, add page-specific review evidence.
- Homepage screenshots do not verify all changed pages. For changes to publications, books, or other subpages, provide page-specific inspection or screenshots as part of that task.
- The PR must describe any failed build or missing preview honestly. An optional screenshot failure does not count as a successful visual test.
- A public URL showing an unmerged PR requires separate preview hosting; do not publish an unapproved version at the production URL to simulate previewing.

## Publication boundary

- A `push` to `main` triggers GitHub Pages publication. The deployment job must not publish pull requests, feature branches, or manually dispatched runs. After migration, `deploy.yml` uploads an artifact and publishes using `actions/deploy-pages`; it no longer writes to `gh-pages`.
- The active `Review before publish` ruleset requires pull requests for `main` and blocks force pushes and deletion. After the `site-build` check is shown to pass, the owner should select it as a required ruleset status check. Because the owner has no independent reviewer, a 0-reviewer rule does not enforce chat approval; the assistant must separately require the owner's explicit approval before any merge.
- This is a single-owner repository: do **not** require one other approving GitHub review unless an independent reviewer is available, since a PR author cannot approve their own PR. The owner's explicit approval in the working conversation governs whether the assistant may merge.
- Do not modify deployment workflows, repository protections, or site-domain settings as part of ordinary content edits unless the request requires it.
- Do not merge the official Pages migration workflow until the owner is ready to switch **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. Follow `docs/PAGES_MIGRATION.md` and verify the first Pages deployment. Until the migration succeeds, leave the legacy `gh-pages` publishing configuration intact.

## 사용자 검토 요약

요청을 받으면 별도 브랜치에서 수정하고, 테스트 결과 및 검토용 자료를 첨부한 PR을 작성합니다. 사용자가 수정 내용을 확인하고 명시적으로 공개를 승인하기 전에는 `main`에 병합하거나 홈페이지를 배포하지 않습니다.
