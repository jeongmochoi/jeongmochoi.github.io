# Homepage CI and permission audit (2026-10-29)

## Confirmed from repository metadata

- GitHub repository: `jeongmochoi/jeongmochoi.github.io` (public).
- The `Review before publish` ruleset is active on the default branch (`main`): pull requests required (0 additional reviewers), force pushes blocked, branch deletion blocked, no bypass list.
- The connected GitHub App installation is scoped to this one repository.
- Current publishing uses a Jekyll build and writes generated HTML to `gh-pages`; that branch is NOT protected. Protecting it without migrating the deployment mechanism would break publishing.
- No administrator settings for GitHub Pages, global Actions token defaults, secrets, deploy keys, or collaborators could be independently read through the current connector.

## Changes prepared in this PR

- The original all-repository Prettier check failed on 43 pre-existing files. Use a PR-only check on changed files so unrelated formatting debt does not prevent site changes.
- Remove the redundant repository-dispatch commenting workflow, which previously failed with an integration permission error.
- The site-link-check workflow runs after a successful **production main push** build rather than after any successful PR build.
- Upstream al-folio Docker tag publishing is disabled for this personal website, even for matching release tags. Existing Docker image and Docker Slim workflows are already guarded by upstream-owner conditions.
- The upstream Lighthouse badge workflow is disabled on this site; its original URL and token settings target the al-folio template, not this homepage.

## Actions and token policy

- Default workflow `GITHUB_TOKEN` should have read-only repository access in **Settings → Actions → General → Workflow permissions**.
- Read/write token permissions must be explicitly declared for the three necessary automation PR workflows (TOC, rendered CV, citation counts). They request `contents: write` and `pull-requests: write` and must never approve or merge their own PRs.
- The owner must enable **Allow GitHub Actions to create and approve pull requests** for these jobs to create PRs. Despite the label, the workflows create draft PRs only, with no approval or merge action.
- PRs made using the default `GITHUB_TOKEN` do not automatically fire other `pull_request` workflows. Before merging an automation PR, arrange a fresh independent CI run (e.g. mark the draft PR ready for review and verify the checks).

## Owner-only security settings to review

1. **Actions → General**: default token access read-only and enable workflow PR creation if the automatic review-PR feature is desired.
2. **Settings → Pages**: leave as-is until the Pages migration PR is approved and ready to activate; coordinate the publishing-source switch and merge.
3. **Settings → Environments → github-pages**: after migration, restrict deployments to `main` (the deploy job itself also checks the branch).
4. **Settings → Secrets and variables → Actions**: identify any unused upstream Docker or Lighthouse tokens and revoke them after their jobs are disabled.
5. **Settings → Collaborators / Deploy keys / Installed GitHub Apps**: check any access beyond the intended single GitHub App installation.

The assistant must not claim these administrator settings are already confirmed, nor silently modify them. The owner must authorize every production publication.
