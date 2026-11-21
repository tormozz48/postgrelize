# Security policy

## Supported versions

Security fixes are released for the latest minor version of `postgrelize`.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue for a suspected vulnerability.

Include the postgrelize version, the PostgreSQL version, a minimal reproduction (model definition and the call that produces the problem) and, if possible, the generated SQL (`logging: console.log`).

You should get a first answer within 7 days. Fixed issues are listed in the release notes once a patched version is published.

## How postgrelize protects against SQL injection

See the [Security page](https://tormozz48.github.io/postgrelize/security) of the documentation: which inputs are bound, quoted or validated, and which APIs take raw SQL by design.
