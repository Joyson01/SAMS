# SAMS security review

## Findings addressed

| Finding | Change |
| --- | --- |
| Sign-in failures and staff sessions were absent from the audit trail. | `backend/app/services/auth_service.py` records successful and failed sign-ins and sign-outs. Unknown accounts are recorded without saving the submitted identifier. Successful login and token refresh responses use `Cache-Control: no-store`. |
| Audit entries did not consistently capture request context. | `backend/app/services/audit_service.py` records the validated client IP and a bounded, browser-reported user agent when an audited action happens over HTTP. The event captures a server request ID, HTTP method and route template. Account creation, access changes, password resets and student links are audit events. |
| Proxy-supplied IP headers can be impersonated when accepted directly. | `backend/app/core/client_ip.py` uses the connection peer by default. It accepts a single valid Cloudflare client IP only from a tunnel peer explicitly listed in `TRUSTED_CLOUDFLARE_PROXY_IPS`. The audit log and request rate limiter use the same extraction. |
| Institution-wide recognition diagnostics and gallery maintenance had broader permissions than needed. | `backend/app/api/v1/recognition.py` and `media_attendance.py` restrict global diagnostics and maintenance to administrators. Faculty live recognition requires an authorized session and filters candidate identities before returning the response. |
| The live recognition handler read the whole file into memory. | `backend/app/api/v1/recognition.py` limits its read to 10 MiB plus one byte and rejects oversized files before decoding. |

## Chat and student activity

- For an audited message, an administrator can retrieve the original text on demand. The app records that access and does not duplicate the text in the audit record.
- File-sharing and download events capture the attachment name and size. Class notes and group messages capture the class ID, and face enrollment events capture the pose label. Audit metadata excludes credentials, tokens, face templates and file contents.

## Production configuration and remaining work

- Confirm the immediate tunnel peer and origin network isolation before setting `TRUSTED_CLOUDFLARE_PROXY_IPS`. Never trust a peer that also forwards requests from untrusted origin clients without normalizing the header. If the setting is empty, the displayed address is the address observed by the application, which may be the tunnel peer.
- Browser and operating system labels are estimates from the user agent. Historical events cannot acquire metadata retroactively.
- Faculty response filtering protects returned identities. Candidate ranking still uses a shared gallery. Use a roster-scoped matcher to prevent cross-class candidates from affecting recognition decisions.
- The upload read limit does not cap ingress body size or decoded pixel count across every upload route. Apply limits at the origin and validate image dimensions before inference.
- Review lifetime and retention for audit data, which now includes IP addresses. Existing audit logging covers instrumented actions and sign-ins rather than passive page views or keystrokes.
- Access and refresh tokens are still stored in browser session storage. Plan a separate migration to HttpOnly refresh cookies with CSRF protection and test account recovery and session expiry.
