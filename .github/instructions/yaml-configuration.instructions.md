# YAML Configuration Instructions (v1.x)

Scope: `_config.yml`, `_data/**/*.yml`

## Ownership

- `_config.yml` in starter wires plugins and feature flags.
- Plugin-specific runtime semantics are owned by plugin repos.

## Guidance

- Keep plugin list and config keys aligned with v1 boundaries.
- Keep only verified personal data; the upstream plugin catalog and Einstein samples were removed.
- Validate YAML syntax and avoid stale monolith keys.

## Validation

Use the validated command set in `AGENTS.md`.
