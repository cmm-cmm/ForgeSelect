# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅        |

Forge Select is pre-1.0; only the latest released minor version receives security fixes.

## Reporting a Vulnerability

Please **do not** open a public issue for security vulnerabilities.

Instead, report them privately via [GitHub private vulnerability reporting](https://github.com/cmm-cmm/ForgeSelect/security/advisories/new) (Security → Report a vulnerability). Include:

- A description of the vulnerability and its impact
- Steps to reproduce (a minimal snippet using the playground or demo is ideal)
- The affected version(s)

You can expect an acknowledgement within 7 days. Once a fix ships, we will credit reporters in the release notes unless they prefer to stay anonymous.

## Security Model Notes

- Built-in rich-item fields (`label`, `description`, `avatar`) are rendered via `textContent`/attribute assignment and are **XSS-safe** by design.
- Custom template functions (`templateResult`, `templateSelection`) that return **strings** are injected as raw HTML — the consumer is responsible for sanitizing untrusted data there. Returning a DOM `Node` built with `textContent` is the recommended safe pattern (see `docs/examples.md`).
