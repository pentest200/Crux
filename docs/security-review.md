# Release dependency review

The production dependency audit reports GHSA-mrhx-c7xc-m3w5 for the Zod 3 dependency
of `@imgly/background-removal@1.7.0` (two audit entries: library and dependency).
The advisory concerns memory exhaustion from oversized collection validation.
The API uses the patched Zod 4.6.7 for credentials and has a 32 KB JSON body limit.

In this application, the background-removal dependency runs only in the browser
and validates application-defined configuration, not account requests. Its
configuration schemas do not accept an unbounded user-provided collection. This
reduces exposure but does not remove the dependency's advisory. Track an upstream
compatible fix. Do not force Zod 4 into the library's Zod 3 interface, or use npm's
suggested breaking downgrade, without separately verifying model inference.

Advisory: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5

The Chrome deceptive-site classification is independent of this dependency audit.
The old simulated login has been replaced with backend authentication; Google
Search Console review is still required if its Security Issues report flags the site.
