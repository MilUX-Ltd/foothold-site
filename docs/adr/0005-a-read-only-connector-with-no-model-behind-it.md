# 0005: A read-only connector with no model behind it

Status: accepted, November 2026

## Context

The middle rung lets a person's own AI query what the site shows. The Tally site already runs such a connector: read-only, stateless, no sign-in, no model, reading only the built data, with a per-address rate limiter.

Two limits shape this one. A connector that served everything would remove the reason to install. And a free, complete defence reference would compete with the company's separate paid knowledge service.

It is also the main security concern. Whatever the connector returns is placed in front of a stranger's AI. Text that reads as an instruction could be acted on.

## Options

1. Look-up and structure only. Returns reference pages, follows named relationships, describes folders and skills, returns the steps of a route. Does not return skill files or agent instructions.
2. Serve the skills as well. A person could run Foothold's jobs with no install. Wider reach sooner, but it removes the reason to install and serves instruction text to unknown AI tools.
3. Put a model behind it to answer questions. Friendlier answers, but it adds cost, a key to protect and a spend to cap, and it competes with the paid service.

## Decision

Option 1. One server route, `/mcp`, on the site's Worker. It is not built yet; this record fixes what it may and may not do.

| It does | It does not |
|---|---|
| Look up a programme, framework, portal, public body or investor | Return skill files or agent instructions |
| Follow named relationships | Reason or write answers; it runs no model |
| Describe the structure: folders, what each is for, which skills exist and what each does | Store anything about the person asking |
| Return the steps of a job route | Hold or return anyone's private data, or any named individual |

It reads only the data file built from the pack's main branch (0003), so nothing reaches it that has not been merged. Responses are structured fields from that file. It is rate limited per address, with a counter that stores no personal data.

## Consequences

- No model key, so no spend to cap and no secret behind the route.
- The connector's tool list is part of the public contract and is versioned with the data file.
- Reasoned, curated answers stay with the separate service.
- The site needs a short page explaining how to add the connector, written for more than one AI tool.
- No novelty is spent. This is the pattern Tally already runs.
- Reversible: the route can be switched off without affecting the site. The risk to avoid is adding a tool that returns free text from skill bodies. Once people's AI tools rely on it, withdrawing it is hard, and it is the surface most open to misuse.

## Revisit when

Connector calls stay near zero after the first month's review, sustained abuse passes what the rate limiter holds, or the maintainer decides the skills should be served.
