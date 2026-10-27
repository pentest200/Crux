# Chrome deceptive-site warning

The reported warning says Chrome considered the page deceptive when a password
was entered. A valid TLS certificate does not resolve a Safe Browsing warning.
The screenshot alone does not establish why Google classified the URL.

## Local remediation prepared

- Removed the simulated login/signup form. It accepted arbitrary passwords without
  a backend, generated placeholder tokens, and incorrectly claimed secure sync.
- Removed the sign-in requirement for downloading generated files.
- Removed the old demo profile and token from browser storage on startup.
- Replaced the demo form with optional, server-verified MongoDB authentication.
  Account controls remain hidden until the backend is configured. See authentication.md.
  PDF encryption/decryption tools still request a document password for their
  stated operation, with upload consent.

## After the owner approves publication

1. Push the reviewed source and monitor the Render client deploy until live.
2. Verify guest downloads and real authentication if accounts have been enabled.
3. Open the site's verified Google Search Console property and inspect Security
   Issues, including sample URLs and the reason shown. Fix any additional findings.
4. Request a security review only after all findings are resolved. Explain the
   replacement of the demo credential form and provide verification results. Google controls
   the classification and review timing; a code deployment cannot clear it itself.

Official references:

- https://support.google.com/webmasters/answer/9044101
- https://developers.google.com/search/docs/monitor-debug/security/social-engineering

If a visitor reused an important account password on the flagged page, they should
change that password through the account provider's official site and review
account activity. Do not ask visitors to bypass Chrome's warning.
