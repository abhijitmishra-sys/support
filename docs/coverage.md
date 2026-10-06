# Capability coverage

“Implemented” means source exists. Only checks listed in verification were executed. No hosted backend/DB exists in this session.

| Requirement | Implementation | Verification / limit |
|---|---|---|
| Fresh frontend/backend required stack | React/Vinext Site; Express, Prisma/PostgreSQL; separate workers | Frontend build/typecheck; API integration |
| Workspace and Site connection | Signed HTTP gateway and socket token exchange | Hosted backend configuration pending |
| Four dashboards | Customer, agent, supervisor, admin screens | Build/typecheck; browser UAT pending |
| Tenant/role boundaries | Resource guards, memberships, signed identity, tenant event rooms | API isolation tests; Redis multi-instance pending |
| Tickets/references/persistence | CRUD, sequence references, constraints, migration | Real PostgreSQL engine development integration |
| Search/filter/sort/pagination | Ticket APIs and frontend | API page check; broad combinations pending |
| Lifecycle/reopen/resolution | Transition matrix, summary, cycles, archive/restore | Resolve/reopen checks; archive/restore test pending |
| Public/private chat | Persisted messages, REST/Socket.IO, note styling | API confidentiality + response checks; socket checks separately |
| Typing/read/presence | Ephemeral typing, watcher timestamps, heartbeat | Browser and delivered/read UI coverage pending |
| Message acknowledgments/dedup | Persistence before ack; stable client IDs | REST repeated submission checks |
| WebSocket reconnect | Token refresh, REST recovery, event IDs | Disconnect/restart browser tests pending |
| Queue dispatch | Tier/deadline/aging, team/skills/capacity, DB locks | Immediate assignment tested; native PG concurrency/load pending |
| Four exact response SLAs | Frozen policy, timezone/business calendar, response/breach flags | Unit SLA/DST/holiday tests; breach dedup integration |
| Resolution policies | Optional elapsed timer and waiting-customer pause | Source implemented; pause/resume test pending |
| Subsequent-response policies | Not implemented | Remaining feature |
| Business calendar exceptions | Weekly days/hours, timezone, holidays | Date-specific hours/overnight calendars not supported |
| Assignment/transfers/escalations | Optimistic updates, supervisor controls/audit | Auto assignment tested; transfer/escalation verification pending |
| Teams/routing/permissions | Fixed roles, team/skills/capacity | Custom permission sets and queue-specific visibility remain |
| Merge/related tickets | Same-requester merge preserves source records | Merge tested; earliest merged SLA queue ranking remains |
| Archive/restore/auto-close | Source and controls | Further lifecycle tests pending |
| Attachments | Validated private files, controlled downloads, scanner interface | Text/unsafe-type checks; unauthorized-download test pending |
| Malware/storage/retention | Optional scanner + local/shared filesystem | Scanner setup, object-storage adapter, retention worker remain |
| Watchers/mentions/tags | Persistence, authorization, controls | Unauthorized mention test |
| Canned replies/knowledge/feedback | APIs and screens | Draft visibility + satisfaction checks |
| Notifications/outbox | Durable in-app notifications, retrying events | Breach dedup checked; forced-outbox-failure test pending |
| Email/inbound | Real SMTP + generic signed webhook adapter | Provider credentials/setup and boundary mocks pending |
| Reports/CSV | Aggregates + safe CSV quoting/formula protection | Reports integration, CSV unit test; report cap 10,000 |
| Security | Server guards, zod, limits, origin/CSRF checks, safe errors | Basic permission/token tests; independent security review pending |
| Observability | Structured logs, health endpoints, persisted jobs/audits | Dedicated metrics exporter/dashboard not implemented |
| Multi-instance/restart recovery | Redis pubsub/rate limits; DB reconciler; durable outbox | Requires Redis/native PG deployment testing |
| OpenAPI/WebSocket/setup/rollback | Docs and environment examples, Compose/Dockerfile | Container build unavailable here |
| E2E/load/live verification | Not completed | Needs hosted API/DB/WSS and browser/load environment |

Conversation history is currently bounded to 500 messages in one detail response, attachments to the ticket, articles/notifications to 100; cursor pagination for those collections remains before large production deployments. Notification delivery is at-least-once; clients must deduplicate stable IDs. SMTP exactly-once is not guaranteed. Development defaults require administrator review.
