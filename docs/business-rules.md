# Business rules

## Roles

| Action | Customer | Agent | Supervisor | Admin |
|---|---|---|---|---|
| View/reply public | Own tickets; organization access if explicitly granted | Workspace tickets | Workspace tickets | Workspace tickets |
| Internal notes | Never | Yes | Yes | Yes |
| Edit requester fields | Own Open/Reopened | Yes | Yes | Yes |
| Claim/unassign | No | Self, when unassigned/self-assigned | Any agent | Any agent |
| Assign another agent/transfer team | No | No | Yes | Yes |
| Resolve/close/status | Reopen own resolved/closed only | Yes | Yes | Yes |
| Escalate | No | Yes | Yes | Yes |
| Merge/archive/restore/export/reports | No | No | Yes | Yes |
| Categories/calendar/members/entitlements | No | No | No | Yes |
| Feedback | Requester after resolution | No unless requester | No unless requester | No unless requester |
| Publish articles/canned replies | No | Read | Yes | Yes |

These are fixed server roles; custom permission sets and team-specific visibility restrictions are not yet supported. Organization access currently covers the entire application workspace, so grant it only when that workspace represents the intended customer organization.

## Lifecycle

| Current status | Allowed next statuses |
|---|---|
| Open | In Progress, Waiting for Customer, Waiting for Internal Team, Resolved |
| In Progress | Waiting for Customer, Waiting for Internal Team, Resolved |
| Waiting for Customer | In Progress, Waiting for Internal Team, Resolved |
| Waiting for Internal Team | In Progress, Waiting for Customer, Resolved |
| Resolved | Closed, Reopened |
| Closed | Reopened |
| Reopened | In Progress, Waiting for Customer, Waiting for Internal Team, Resolved |

Resolve requires a nonempty resolution summary. Reopen records a new response cycle; history and prior breaches remain. Auto-close uses configured elapsed hours after resolution. Archive hides default listings and blocks chat but preserves records. No destructive delete endpoint is exposed. Queue assignment is a separate assignee/team property; automatic dispatch changes Open/Reopened to In Progress.

## Response commitments

| Tier | Maximum human first response | Clock |
|---|---|---|
| Elite | 10 min | Continuous |
| Priority | 30 min | Continuous |
| Growth | 120 min | Business calendar |
| Essential | 240 min | Business calendar |

A new distinct request/command creates a ticket work item. Normal replies stay on that work item. Deadlines start at server creation time within the successful persistence transaction; policy version, entitlement and full calendar snapshot are persisted. UTC timestamps, calendar-zone calculation. No assignment/transfer/status/bot action resets or satisfies first response. Only a public authenticated staff message completes it. Agents currently send human messages directly; no bot adapter may impersonate a staff membership.

Resolution commitment is optional, separately configured in elapsed minutes. Only resolution can pause in Waiting for Customer when enabled. First-response clocks never pause by lifecycle status. Subsequent-response policies and calendar date-specific opening-hour exceptions are not implemented. Holidays and normal weekly hours are supported.

Merging is restricted to the same requester/workspace and a live canonical target. Source references, notes, attachments and cycle records remain intact; canonical detail includes source conversation history. A public response on the canonical ticket satisfies pending first-response cycles on all merged sources. Breach monitoring includes all original obligations. The queue currently ranks the canonical ticket’s own cycle; combined earliest-merged-deadline ranking is a remaining enhancement.

## Dispatch

PostgreSQL serializable transaction plus per-workspace advisory lock; conditional assignment/version update prevents concurrent claim. Active agent heartbeat is valid for 90 seconds. Capacity counts unresolved assigned tickets. Route by workspace, optional team, category skills and capacity; choose least loaded, then stable user ID. Inactive agents stop receiving new tickets; existing assignments remain for supervisor transfer.

Within a bounded batch (500 oldest unassigned tickets), requests due within five minutes precede other items; then aged items (default 120 minutes), then normal tier order Elite → Priority → Growth → Essential. Within those buckets tier, deadline, creation time and ticket ID provide deterministic ties. Aging can advance Essential ahead of a fresh Elite; it does not upgrade entitlement. Extreme sustained overload can still violate SLA; staffing is required. Dispatch runs immediately after availability/create updates and reconciles every worker sweep.

## Reliability and confidentiality

Optimistic version checks on ticket updates; serializable retry handles database conflicts. Ticket creation requires Idempotency-Key and matching payload hash. Messages require stable clientId scoped by ticket/author; retry conflicts reject changed text/visibility. Related changes, audits, notifications and outbox writes are transactional. WebSocket event IDs deduplicate delivery; HTTP refresh recovers authoritative PostgreSQL records.

Private message content is excluded from customer APIs, downloads, events, notifications, search and exports. Notifications contain generic titles, never message bodies. Attachments are private filesystem records and served only through authorized API downloads. Important events are durable; typing is temporary. Configuration changes do not rewrite prior response cycles. Worker breach/warning flags prevent duplicate persisted escalations.
