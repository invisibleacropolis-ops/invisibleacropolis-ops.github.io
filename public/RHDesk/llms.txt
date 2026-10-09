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
| `function` | Call a Desk edge function: `POST {API_URL}` + `args.path` with your access token (e.g. `memory/index`). |

The last action is always `session_end`. Call it with a summary and next steps before you stop, or the next
agent starts blind.

### Closing an operator session

An `operator` or `operator+execute` session cannot end until two things are done, in this order:

1. **Session Report.** Call `session_report_build()`, then check its key numbers (account equity and cash, positions,
   fills) against Robinhood through the MCP server, and sign it with `session_report_verify`:
   `p_checks: [{field, desk_value, observed_value, source: "robinhood_mcp"}]`. Take screenshots when you can and list
   them in `p_screenshots`. If you cannot verify, say why in `p_unverifiable: [{field, reason}]`; never sign numbers you
   did not check as checked. A mismatch marks the report `exceptions` and alerts the owner.
2. **Diary.** `diary_submit(p_markdown, p_title)`: why you did what you did. Decisions, motivations, doubts, lessons.
   The report holds the numbers; the diary holds the reasoning.

Then `session_end`. Two overseer agents follow later, each in its own session: an `archivist` reads the report and
diary and records long-term memories (`memories_archive`), then a `novelist` writes the session's chapter of
"Our Story" (`chapter_submit`). If you were paired as one of them, the brief's `next_actions` list your work.

## 5. Remember what earlier sessions learned

The Desk's memory is searchable by meaning. Before you propose a trade, decide something, or research a symbol, ask
it what earlier sessions recorded:

```http
POST https://ypmjwhrvonuwcrpckwkk.supabase.co/functions/v1/memory/recall
Authorization: Bearer <access_token>
Content-Type: application/json

{"query": "what have we learned about sizing speculative positions?", "k": 5}
```

Results are journal entries, scouts and Research library passages, nearest first, each with a `similarity`. With the
CLI it is `desk recall "<question>"`. The brief's `relevant_journal` already ranks entries against what is open now.

**Build the Research library as you work.** It holds the real-world material behind every position, and the owner
reads it on the site:
- **Save sources:** `desk doc clip <url> --symbols NVDA --tags earnings` saves a web page, the same as
  `POST /functions/v1/clip`.
- **Write analysis:** `desk doc add --title "..." --body @analysis.md --symbols NVDA --collection "AI infrastructure"`
  adds Markdown, the same as the `document_add` RPC.
- **Link it:** tag every document with its symbols, and link it to the proposal or mandate it supports, so the
  owner's narrative of the portfolio can quote the evidence.

### Placing orders

With scope `operator+execute`, place an approved or auto-approved proposal's order through the Desk:
`POST {API_URL}/functions/v1/execute {"proposal_id": "…"}` (CLI: `desk execute <proposal-id>`). The Desk re-checks it,
places it in the agentic account, and records it; you do not call Robinhood's order tools yourself. It refuses while
the owner has orders switched off (`trading_disabled`), outside market hours, and for anything not approved. Read
Robinhood the same way, read-only: `POST {API_URL}/functions/v1/robinhood-read {"tool": "get_equity_quotes",
"args": {"symbols": ["AAPL"]}}` (CLI: `desk rh get_equity_quotes --args '{"symbols":["AAPL"]}'`).

### Price charts

`price_chart(p_symbol, p_range)` (CLI: `desk chart AAPL --range 6M`) gives a symbol's bars from Robinhood with what the
Desk knows about it: fills, proposal levels, the position's cost, stop and target, and journal notes. Check it before
you set an entry, a stop or a target. If it has no bars yet, its `next_actions` show how to read them through the MCP
(`get_equity_historicals`) and submit them with `prices_ingest`, or wait for the next sync. `chart_save` keeps a chart
with your notes in the Research library.

### The Chronicle

`chronicle(p_from, p_to, p_groups, p_symbol)` (CLI: `desk chronicle --from 2026-10-01 --groups trades,decisions`) is
the whole record, day by day: money, trades, decisions, mandates, research, sessions and alerts, each with who did it
and the reasoning behind agent work. `provenance(p_entity, p_id)` (CLI: `desk provenance mandates <id>`) explains one
record. Use them to understand how the Desk got where it is, and write your journal entries knowing they become
the reasoning other agents and the owner will read.

## 6. Connect the Robinhood MCP server

Trading and live account reads go through Robinhood's Trading MCP server (`https://agent.robinhood.com/mcp/trading`,
HTTP transport, OAuth sign-in by the account holder). For example, in Claude Code:

```bash
claude mcp add --transport http robinhood-trading https://agent.robinhood.com/mcp/trading
```

Without it, do research-only work (scouts, journal, tasks) and tell the human.

## 7. Rules that always apply

1. Place a Robinhood order only for a Desk proposal that is `auto_approved` or `approved`, and only if your scope
   is `operator+execute`. Then immediately call `proposal_executed` with the Robinhood order id.
2. Never fabricate numbers. The Desk syncs Robinhood itself on a schedule once the owner has linked it (check
   `robinhood_status` or `desk sync status`). If the brief says data is stale, read your accounts through the Robinhood
   MCP server and submit them with `ingest_snapshot` (tagged `agent-reported`).
3. Every fill in the agentic account must trace to a proposal or a registered Loop. Anything else raises a critical
   `unexplained_trade` alert for the owner.
4. Record decisions and lessons with `journal_add` as you go.
5. Mandates are the human's standing instructions; do not work around a failed limit check. Follow each mandate's
   `direction` (the owner's plain-language steering, e.g. "stay within tech" or "exit by a date unless a condition
   holds") as part of its rules. Respect `owner_overrides`: never propose a revision that undoes the owner's change.
6. Recall before you propose. Lessons from earlier sessions apply to you.

## 8. Using the website instead of the API

The Desk at https://invisibleacropolis-ops.github.io/RHDesk/ is built for agents too: every control has a stable `data-testid`, decisions take two clicks
(`<id>` then `<id>-confirm`), and every page mirrors exactly what it shows into
`<script type="application/json" id="desk-state">`. Read that instead of scraping the screen. Record pages:
`/proposals/?id=<uuid>` (limit checks), `/mandates/` (limit use per mandate), `/accounts/`, `/positions/?symbol=<SYM>`
(the position's story from thesis to fills), `/tasks/`, `/scouts/?symbol=<SYM>` (profile, conviction history and what
each version changed), `/journal/` (sessions and journal; the owner's notes to you appear here too) and `/audit/`. Approving proposals and activating mandates are the owner's
decisions; an agent never makes them on the owner's behalf. The API remains the primary interface; the website is for
the owner and for agents that only have a browser. Through the API, `mandate_utilization` shows how much of each
mandate's limits is in use and `scout_history` lists every version of a scout.

## 9. When something fails

Errors look like `{"code":"P0001","details":"<machine code>","message":"<code>: <text>","hint":"<what to do>"}`.

| details | do this |
|---|---|
| `session_expired` | Pair again (section 1) or exchange your key. |
| `forbidden` | Your scope does not allow it; do what you can and leave a `journal_add` question for the human. |
| `invalid_transition` | Re-read the record's current status, then continue. |
| `not_found` | Check the id; re-read the brief. |
