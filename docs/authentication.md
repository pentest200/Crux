# Authentication

The previous login was a browser-only demo; it did not authenticate against MongoDB.
Existing demo profiles are not migrated into real accounts. Tools/downloads remain
available without signing in. Accounts do not store files or claim cross-device sync.

## Stored data

- MongoDB `users`: normalized email (unique index), name, bcrypt password hash
  with a random salt and cost 12, and timestamps. Password hashes are excluded
  from normal queries and never sent to the client.
- MongoDB `authsessions`: SHA-256 hash of the JWT's random session identifier,
  user ID, and expiration. A TTL index cleans up expired records; every request
  also checks expiry, so delayed TTL cleanup cannot extend a session.
- Browser: an eight-hour JWT in a host-only HTTP-only cookie, SameSite=Strict,
  Secure with the `__Host-` prefix in production. No credentials or tokens in
  localStorage. Logout revokes the current session in MongoDB.

JWT verification pins HS256, issuer, audience, expiration, user ID and session ID.
Passwords require at least 15 characters and no more than 72 UTF-8 bytes to avoid
bcrypt truncation. Requests validate input types and reject query operators.
Auth mutations require JSON, a custom header, and an exact configured Origin;
same-site cookies provide additional CSRF protection. Login/signup are throttled
by remote IP and normalized email. Responses containing account data are no-store.

## Configuration (do not commit secrets)

For local HTTP development, set these in the ignored root `.env`:

```
AUTH_ENABLED=true
MONGODB_ENABLED=true
MONGODB_URI=mongodb://127.0.0.1:27017/ghost-files
CLIENT_ORIGIN=http://localhost:5173
```

Set `AUTH_JWT_SECRET` separately to a cryptographically random value of at least
32 characters (for example, 48 random bytes encoded as hex). Never use the example
text as a secret. Production startup requires an HTTPS CLIENT_ORIGIN when auth
is enabled. Missing MongoDB/signing configuration causes startup to fail closed.

On Render, after owner approval, set those variables on the active API service,
using the actual MongoDB connection string and exact client origin
`https://ghost-files-client-0fz5.onrender.com`. The Blueprint leaves accounts and
MongoDB disabled until the owner approves transferring the connection credentials
to Render. Enable both flags together after setting the connection string.
The connection string is declared as `sync: false`; existing services
must receive its value through the service environment. A generated signing
secret is declared with `generateValue: true`, preserving an existing value.
Use a dedicated database user restricted to this app's database, TLS, and an
appropriate network allowlist. Backups and deletion/retention policy belong in
the database provider configuration. No production database or secret has been
created by the application itself.

`MONGODB_DNS_SERVERS=1.1.1.1,8.8.8.8` resolves Atlas SRV/TXT records through those
servers when the host's default DNS cannot. This uses a process-local resolver,
validates the returned hosts against the cluster's parent domain, and requires
TLS. It converts the resolved records to a standard MongoDB seed list at startup;
replica-set discovery still runs, but SRV polling is not used in this mode.
Restart after an Atlas seed-list change. Leave it empty to use native SRV DNS.

Auth endpoints behind the client proxy: GET `/api/auth/status`, POST
`/api/auth/signup`, POST `/api/auth/login`, GET `/api/auth/me`, POST
`/api/auth/logout`. POST calls need `x-ghost-auth: 1`, JSON and an allowed Origin.

## Verification and limits

Run `npm test` for unit tests. For the real MongoDB integration suite, set
`TEST_AUTH_MONGODB_URI` to an isolated local test server and run the server tests.
The suite creates and deletes only a randomly named `ghost_auth_test_*` database.
It checks hashes, persistence, cookie flags, invalid/expired tokens, origin checks,
logout revocation, input validation and rate limiting.

There is no email verification, password reset or MFA yet; email addresses are
not verified ownership claims and must not grant roles/privileges. These features
need a separately configured mail provider/product flow. Current rate limits use
process memory, reset on restart, and assume one API instance. Use a shared store
before scaling. The app does not trust arbitrary forwarded IP headers, so a
reverse proxy may cause users to share an IP limit. Audit the actual proxy chain
before configuring trusted proxies. JWT signing-key rotation invalidates all
sessions. Old session records expire automatically.

These changes do not directly remove Google's Safe Browsing classification;
follow the Security Issues review workflow in browser-warning-remediation.md.
