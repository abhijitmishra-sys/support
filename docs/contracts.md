# HTTP and WebSocket contracts

`openapi.json` inventories every implemented route; it is an initial specification with generic body schemas. Zod schemas in backend/src/app.js remain the exact field-level contract. Further OpenAPI field schemas are a documented remaining task.

## Authentication and HTTP

Browser uses same-origin `/api/support/<path>`; proxy forwards to `/v1/<path>`. ChatGPT platform supplies Site identity headers to server code. Proxy creates `X-IRMA-Identity`: base64url(JSON) + `.` + base64url(HMAC-SHA256(encoded JSON)). Claims: sub (Site-scoped ID), email, name, iat, exp, aud=irma-api. Lifetime 60 seconds. Gateway-secret never reaches browser. `X-IRMA-Workspace` is fixed by trusted server configuration, not request payload. Backend checks database membership. No public bearer-token endpoint is provided.

JSON success `{data: result}`; errors `{error:{code,message}}`, plus X-Request-ID header. 401 authentication, 403 permission, 404 absent/inaccessible resource, 409 version/idempotency conflict, 422 schema/business validation, 429 rate limit, 503 unavailable dependency.

| Route (relative to /v1) | Method | Important input/output |
|---|---|---|
| me | GET | User, membership, workspace settings, transitions |
| tickets | GET | page, limit ≤100, q ≤160, status, tier, mine, unassigned, archived, sort, direction; items/total/page/limit |
| tickets | POST | subject, description, category, urgency; required Idempotency-Key; tier read from membership |
| tickets/{id} | GET | ticket, messages, activity, attachments, feedback; private filtering |
| tickets/{id} | PATCH | version required; subject/description/category/urgency/status/resolution/tags/relatedIds/assigneeId/teamId/archived |
| tickets/{id}/messages | POST | body ≤12000, private, clientId (8–100), attachmentIds ≤5, mentionIds ≤10 |
| tickets/{id}/merge | POST | targetId; manager-only same-requester merge |
| tickets/{id}/escalate | POST | reason; staff-only |
| tickets/{id}/watch | POST | watch boolean |
| tickets/{id}/read | POST | No body required; persists watcher read timestamp |
| tickets/{id}/feedback | POST | rating 1–5, optional comment |
| tickets/{id}/attachments | POST | fileName, mime, base64 data, private; max decoded 5 MiB |
| attachments/{id} | GET | Authorized binary download |
| notifications | GET | Latest 100 authorized notifications |
| notifications/read | PATCH | Marks own unread notifications read |
| preferences | PATCH | notificationEmail boolean |
| team | GET | Staff memberships in current workspace |
| availability | PATCH | available boolean; staff-only immediate dispatch |
| heartbeat | POST | Staff presence refresh |
| articles | GET/POST | Search q; published-only for customers; create title/body/category/published for managers |
| canned | GET/POST | Staff read; managers create title/body |
| reports / export | GET | Manager-only aggregates / quoted safe CSV |
| admin | GET | Admin settings, teams, members |
| admin/settings | PATCH | version and complete validated settings; frozen first-response values |
| admin/teams | POST | name |
| admin/members/{id} | PATCH | role, tier, capacity, skills, organizationAccess, teamId; admin-only |
| admin/invitations | POST | externalId, email, name, role, tier; creates membership, no email delivery |
| socket-session | POST | Short-lived token and backend URL |

Ticket enums: OPEN, IN_PROGRESS, WAITING_CUSTOMER, WAITING_INTERNAL, RESOLVED, CLOSED, REOPENED. Tier enums: ELITE, PRIORITY, GROWTH, ESSENTIAL. urgency LOW/NORMAL/HIGH/CRITICAL. API upload JSON is base64, not multipart. Export proxy returns actual CSV. Attachment proxy returns controlled binary content.

## Socket.IO

Connect to backend URL with transports=['websocket'] and auth={token}; exact Site Origin required. Token audience irma-socket, sub internal user ID, workspaceId, iat/exp (120 seconds). Reconnect by obtaining a new token from socket-session; REST restores current data.

| Direction | Event | Payload / behavior |
|---|---|---|
| client→server | ticket:subscribe | {ticketId}; ack {ok:true} or safe error; server authorizes ticket |
| client→server | ticket:unsubscribe | {ticketId}; leave both public/internal rooms |
| client→server | message:send | Same fields as message POST plus ticketId; ack only after transaction commits |
| client→server | typing | {ticketId,typing}; ephemeral, authorized |
| server→client | typing | ticketId/userId/name/typing |
| server→client | ticket:event | eventId/ticketId/event/private/version or READ details; fetch persisted detail |
| server→client | notification | eventId/userId/notification; workspace-scoped recipient room |
| server→client | session:expired | Client renews token/reconnects |

Every action rechecks membership, expiration and resource access. Internal events use staff rooms. Membership updates enqueue socket disconnect. Payload IDs deduplicate delivery; events contain no private message bodies. Message persistence and watcher lastReadAt provide the underlying sent/read records, but a full per-recipient delivered/read UI is a remaining feature.

## Inbound webhook

POST `/integrations/inbound`. Raw application/json ≤1 MiB. Headers X-Inbound-Timestamp (Unix seconds within 300s) and X-Inbound-Signature (hex HMAC-SHA256 of timestamp + '.' + raw body, signed with INBOUND_SECRET). Body eventId (8–80), workspaceId, externalUserId (existing CUSTOMER membership), optional ticketId, optional subject, body, category (default Other). With ticketId it persists a public customer reply; otherwise creates a request. eventId becomes idempotency key; no agent impersonation or bot first-response satisfaction.

Only a trusted provider/adapter knows INBOUND_SECRET. Provider mailbox credentials, routing and upstream signature verification must be configured outside this normalized adapter. No external delivery is simulated.
