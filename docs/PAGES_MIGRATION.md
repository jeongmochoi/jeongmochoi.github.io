# Migration: publish GitHub Pages through GitHub Actions

**Do not merge the migration PR until the site owner has approved the switch and is ready to change GitHub Pages settings.** This migration changes how the public site is published.

## Previous architecture

- Jekyll builds on `main`.
- The `JamesIves/github-pages-deploy-action` action pushes generated `_site` HTML to `gh-pages`.
- GitHub Pages serves the output of `gh-pages` when configured to publish from that branch.
- That branch remains unprotected while the old deployment method is in use.

## Proposed architecture

- On each relevant PR, `deploy.yml` builds the Jekyll site but does not deploy.
- On a protected `main` push, a read-only build job creates a GitHub Pages artifact with `actions/upload-pages-artifact@v4`.
- A dependent deployment job uses `actions/deploy-pages@v4` with `contents: read`, `pages: write`, and `id-token: write`, scoped to the `github-pages` environment and `main` pushes only.
- No workflow writes built files to `gh-pages`.

## Safe cutover procedure (owner + assistant)

1. Merge the CI/screenshot PR first and confirm the `site-build` check succeeds for normal content changes. Add that check as a required ruleset status only once it exists reliably.
2. Review this migration PR's workflow diff and its successful PR-side Jekyll build. The old branch-based site should still be live.
3. When ready to activate the migration, open **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**. This is an **owner-only UI action**; the assistant's repository connector does not support Pages settings.
4. Explicitly approve the migration PR and merge it. The push to `main` should trigger the new **Deploy site** workflow, build the Jekyll site, upload a Pages artifact, and run the `github-pages-deploy` job.
5. Verify **Actions → Deploy site** reports a successful `github-pages-deploy` step and confirm `https://jeongmochoi.github.io/`, `/ko/`, and the publications pages all load correctly.
6. Under **Settings → Environments → github-pages**, limit deployment branches/tags to the default branch (`main`). Do not add an unnecessary second human reviewer requirement on a one-owner site.
7. Only **after** verifying successful artifact-based publication, consider protecting legacy `gh-pages` with a no-update rule or archiving the unused branch. Never protect it before the old deployment method is retired.
8. Check that legacy HTML-formatting and theme Docker workflows cannot republish or overwrite the new site. Remove unused credentials via GitHub's admin UI after confirming their consumers are disabled.

## If anything fails

- Do not repeatedly change the publishing source without checking the failing Actions logs.
- A failed `deploy-pages` job commonly means the repository Pages source is still set to **Deploy from a branch**, the `github-pages` environment rules are blocking it, or permissions are not sufficient.
- Restore the previous deployment YAML through a reviewed PR, then set Pages source back to `gh-pages` if necessary. The prior published branch is retained until migration is verified for rollback.
- Do not promise zero downtime or mark this migration successful until an actual artifact-based deployment is confirmed.

## Approval policy

This is a preparation PR, not an authorization to publish. No assistant-driven merge or production setting change may occur without explicit final approval.
