# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| main    | Yes                |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public GitHub issue.**
2. Use [GitHub Security Advisories](../../security/advisories/new) to report the vulnerability privately.
3. Alternatively, email the maintainer directly (see repository contact info).

You should receive acknowledgment within 48 hours. We will work with you to understand and address the issue before any public disclosure.

## Security Features

- **Role-Based Access Control (RBAC):** Three roles (admin, basic, employee) with endpoint-level authorization.
- **JWT Authentication:** Short-lived access tokens (1 hour) and refresh tokens (7 days), signed with HS256.
- **Google OAuth 2.0:** OAuth state tokens with CSRF protection and 10-minute expiry.
- **Rate Limiting:** Configurable per-endpoint rate limits to prevent abuse.
- **Audit Logging:** All administrative actions are logged to `backend/data/audit.log`.
- **CORS:** Strict origin allowlist configured via `FRONTEND_URL` environment variable.
- **Admin Emails via Environment:** Admin email list is configured through the `ADMIN_EMAILS` environment variable, not hardcoded.

## Credential Rotation

If you suspect credentials have been exposed:

1. **SECRET_KEY:** Generate a new key (`python -c "import secrets; print(secrets.token_urlsafe(32))"`). All existing JWTs will be invalidated and users will need to re-authenticate.
2. **GEMINI_API_KEY / OPENAI_API_KEY:** Revoke the old key in the provider's console and generate a new one.
3. **GOOGLE_CLIENT_SECRET:** Rotate in Google Cloud Console under APIs & Services > Credentials.
4. **FIREBASE_SERVICE_ACCOUNT_BASE64:** Generate a new service account key in Firebase Console, base64-encode it, and update the environment variable.
5. **Database / data files:** If `backend/data/*.json` files were exposed, review them for sensitive employee information and notify affected users.

After rotating any secret, redeploy all affected services (backend on Render, frontend on Vercel).

## Known Limitations

- **JSON File Storage:** Data is stored in JSON files on disk, not in an encrypted database. Anyone with server filesystem access can read all data.
- **No Encryption at Rest:** Employee data, shift assignments, and audit logs are stored as plaintext JSON.
- **Single-Server State:** OAuth CSRF state tokens are stored in-memory and do not persist across server restarts or multiple instances.
- **HS256 JWT Signing:** Symmetric signing means the same secret is used to sign and verify tokens. Consider RS256 for multi-service architectures.
