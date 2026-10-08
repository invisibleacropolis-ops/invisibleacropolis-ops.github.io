# RHDesk: start here (AI agents)

> RHDesk is the single source of truth for an agentic trading account on Robinhood. The account holder (the
> human) owns it. You operate it on their behalf through a recorded, permissioned protocol. If someone told you
> to "visit the Robinhood Desk to continue working", this page tells you everything you need.

Machine-readable: [agent.json](https://invisibleacropolis-ops.github.io/RHDesk/agent.json) · API spec: [openapi.json](https://invisibleacropolis-ops.github.io/RHDesk/openapi.json) · Markdown: [agent.md](https://invisibleacropolis-ops.github.io/RHDesk/agent.md)

## 1. Get a session

You need no credentials to begin. Ask the human to approve you with a pairing code:

```bash
curl -s -X POST https://ypmjwhrvonuwcrpckwkk.supabase.co/functions/v1/agent-auth/pair/start \
  -H "Content-Type: application/json" \
  -d '{"agent_label":"<your name>","model":"<model id>","harness":"<e.g. claude-code>","requested_scope":"operator"}'
```

The response contains `code` (e.g. `HX7-42Q`), `approve_url`, and `poll_secret`.

1. **Show the human the `code` and `approve_url`.** They approve it on the Desk's Access page and choose your
   scope and session length. Codes expire after 15 minutes.
2. **Keep `poll_secret` private** and poll every 5 seconds:

```bash
curl -s -X POST https://ypmjwhrvonuwcrpckwkk.supabase.co/functions/v1/agent-auth/pair/complete \
  -H "Content-Type: application/json" -d '{"poll_secret":"<poll_secret>"}'
```

While waiting, `data.status` is `pending`. Once approved, you receive `access_token`, `refresh_token`,
`session_id`, `scope` and `grant_expires_at`.

**Unattended agents** with a long-lived key (from the environment, e.g. `RHDESK_AGENT_KEY`) skip pairing:

```bash
curl -s -X POST https://ypmjwhrvonuwcrpckwkk.supabase.co/functions/v1/agent-auth/key/exchange \
  -H "Content-Type: application/json" -d '{"key":"<key>","agent_label":"<your name>"}'
```

Never print, log, or commit tokens or keys.

## 2. Call the API

Every call uses these headers (the anon key is public by design):

```
apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwbWp3aHJ2b251d2NycGNrd2trIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0MTAyMzAsImV4cCI6MjEwNjk4NjIzMH0.8H58CZRi_CzXwcEtdLd6TxVLvc--GSSZlfPluFcl_wo
Authorization: Bearer <access_token>
Content-Type: application/json
```

- **Writes** are functions: `POST https://ypmjwhrvonuwcrpckwkk.supabase.co/rest/v1/rpc/<function>` with a JSON body of named arguments.
- **Reads** are tables: `GET https://ypmjwhrvonuwcrpckwkk.supabase.co/rest/v1/<table>?select=*` (e.g. `proposals`, `journal`, `scouts`).
- Every function returns `{"data": ..., "next_actions": [...]}`.
- Access tokens last one hour. Refresh with `POST https://ypmjwhrvonuwcrpckwkk.supabase.co/auth/v1/token?grant_type=refresh_token`
  (header `apikey`, body `{"refresh_token":"..."}`).

## 3. Start your session

```bash
curl -s -X POST https://ypmjwhrvonuwcrpckwkk.supabase.co/rest/v1/rpc/session_start \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwbWp3aHJ2b251d2NycGNrd2trIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0MTAyMzAsImV4cCI6MjEwNjk4NjIzMH0.8H58CZRi_CzXwcEtdLd6TxVLvc--GSSZlfPluFcl_wo" -H "Authorization: Bearer <access_token>" -H "Content-Type: application/json" \
  -d '{"p_agent_label":"<your name>","p_model":"<model id>","p_harness":"<harness>","p_capabilities":{"robinhood_mcp":true,"browser":false,"shell":true,"web_search":true}}'
```

Declare your capabilities honestly. The response contains:

- `data.playbook`: **the operating manual. Read it in full before doing anything else.**
- `data.brief`: the account, positions, mandates, open proposals, alerts, tasks, the previous session's summary
  and next steps, and recent journal entries.
- `next_actions`: what to do now, in order.

## 4. Follow `next_actions`

Each item has a `type`:

| type | meaning |
|---|---|
| `rpc` | Call this Desk function with `args`. |
| `mcp` | Do this through the Robinhood MCP server; `name` describes the intent (e.g. `robinhood.place_order`). |
| `wait` | Nothing for you to do until the human acts or another session executes. |
| `setup` | A capability is missing; `args` say how to set it up. |

The last action is always `session_end`. Call it with a summary and next steps before you stop, or the next
agent starts blind.

## 5. Connect the Robinhood MCP server

Trading and live account reads go through Robinhood's Trading MCP server (`https://agent.robinhood.com/mcp/trading`,
HTTP transport, OAuth sign-in by the account holder). For example, in Claude Code:

```bash
claude mcp add --transport http robinhood-trading https://agent.robinhood.com/mcp/trading
```

Without it, do research-only work (scouts, journal, tasks) and tell the human.

## 6. Rules that always apply

1. Place a Robinhood order only for a Desk proposal that is `auto_approved` or `approved`, and only if your scope
   is `operator+execute`. Then immediately call `proposal_executed` with the Robinhood order id.
2. Never fabricate numbers. If the Desk says data is stale, read your accounts through the Robinhood MCP server and
   submit them with `ingest_snapshot` (tagged `agent-reported`).
3. Record decisions and lessons with `journal_add` as you go.
4. Mandates are the human's standing instructions; do not work around a failed limit check.

## 7. Using the website instead of the API

The Desk at https://invisibleacropolis-ops.github.io/RHDesk/ is built for agents too: every control has a stable `data-testid`, decisions take two clicks
(`<id>` then `<id>-confirm`), and every page mirrors exactly what it shows into
`<script type="application/json" id="desk-state">`. Read that instead of scraping the screen. Record pages:
`/proposals/?id=<uuid>` (limit checks), `/mandates/` (limit use per mandate), `/accounts/`, `/positions/?symbol=<SYM>`
(the position's story from thesis to fills), `/tasks/`, `/scouts/?symbol=<SYM>` (profile, conviction history and what
each version changed), `/journal/` (sessions and journal; the owner's notes to you appear here too) and `/audit/`. Approving proposals and activating mandates are the owner's
decisions; an agent never makes them on the owner's behalf. The API remains the primary interface; the website is for
the owner and for agents that only have a browser. Through the API, `mandate_utilization` shows how much of each
mandate's limits is in use and `scout_history` lists every version of a scout.

## 8. When something fails

Errors look like `{"code":"P0001","details":"<machine code>","message":"<code>: <text>","hint":"<what to do>"}`.

| details | do this |
|---|---|
| `session_expired` | Pair again (section 1) or exchange your key. |
| `forbidden` | Your scope does not allow it; do what you can and leave a `journal_add` question for the human. |
| `invalid_transition` | Re-read the record's current status, then continue. |
| `not_found` | Check the id; re-read the brief. |
