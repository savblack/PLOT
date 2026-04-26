# Security Policy

## Reporting

This is a private repository. Report suspected vulnerabilities through GitHub security advisories or directly to the repository owner.

Please include:

- affected route, function, or script
- reproduction steps
- expected and actual behavior
- any relevant logs or screenshots

## Secrets

Never commit API keys, service-role keys, `.env` files, Supabase temp metadata, or generated local worktree configuration. Browser-exposed values must use the `VITE_` prefix only when they are safe to publish.

Rotate any credential that has been committed, pushed, shared in logs, or exposed in a client bundle.
