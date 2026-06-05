# OpenClaw and Hermes Agent Bridge

Noeis exposes a project agent bridge for external runtimes that can operate as specialist workers.

## Access Model

Bridge tokens are scoped, short-lived bearer tokens minted from the authenticated Noeis UI. A bridge actor can:

- Search project context with `project/search`.
- Read project items with `project/read`.
- Read and continue shared agent threads.
- Claim and complete routed handoffs.
- Stage editable artifact drafts with `project/write_draft` or `artifacts/drafts/create`.
- Promote or dismiss artifact drafts through the protocol approval path when required.

Non-user bridge actors do not bypass the write boundary. Bridge-issued writes that mutate shared threads, handoffs, or artifact drafts can pause in `/api/agent/protocol/approvals` before execution.

## Runtime Setup

Open `/data-integrations`, choose **OpenClaw** or **Hermes**, mint a bridge token, then run:

1. **Test bridge connection** to verify `/api/agent/protocol/bridge/manifest`.
2. **Run project access check** to verify `bridge/access_check`.
3. Copy the runtime config.

The access check verifies:

- project search
- project retrieval
- controlled draft/write access
- approval visibility for non-user specialist workers

## Required MCP Methods

Hermes-compatible clients should call:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "bridge/access_check",
  "params": {
    "query": "portfolio concentration",
    "limit": 5
  }
}
```

Useful project methods:

```text
project/search
project/read
project/write_draft
threads/list
threads/get
threads/create
threads/append_message
handoffs/list
handoffs/claim
handoffs/ensure_thread
handoffs/complete
artifacts/drafts/create
artifacts/drafts/promote
```

## OpenClaw Flow

1. Call `bridge/access_check`.
2. Search project context with `project/search`.
3. Read selected items with `project/read`.
4. Claim a routed handoff or create a thread.
5. Stage proposed edits as artifact drafts.
6. Complete the handoff or leave the draft for approval.

## Hermes Flow

Use the copied Hermes config. The Noeis MCP server is named `noeis-agent-bridge` and points to:

```text
/api/agent/protocol/bridge/mcp
```

The bearer token is passed in the `Authorization` header.

## Troubleshooting

- `Method not found`: refresh the copied config and confirm the deployed bundle includes `project/search`, `project/read`, and `bridge/access_check`.
- `Mint a bridge token`: the UI can show config templates before a token exists; copy/test actions require a live token.
- `BYO actor cannot search`: the selected specialist agent is missing read/search capability.
- `approval_required`: the write path works, but the operation is waiting in Pending protocol approvals.
