# 0001: Foothold gets a site and a connector, not a link alone

Status: accepted, November 2026

## Context

Foothold is a pack of folders, agent instructions, about sixty skills and about a hundred pages of public defence reference. It has been shared as a link to its GitHub repository. A free link sent to a busy person is viewed and forgotten; interest has come from conversation and demonstration, and there is no usage figure of any kind.

Earlier attempts to show the pack did not land. The pack's worked examples need an install before anyone sees them. A previous demonstration put an invented company inside a real map and drew on a partner's data that was not ours to reuse, and it was taken down.

The proposition to land is that Foothold is a ready-to-go structure for running a small defence business with AI built in. That is a claim about how things connect, which a visitor has to see working.

The first question was whether an application is needed at all, so three lighter answers were weighed first.

## Options

1. Keep the link and improve the README. Costs nothing. It is what failed: the reader must install before seeing any value.
2. A connector only. A read-only connector over the pack lets a person's own AI query the reference, with nothing to build but one endpoint. It gives nothing to look at, cannot show a job being done, and reaches only people who already use connectors.
3. A longer page on the company website with a graph as illustration. Quicker than a site, but it repeats the pattern of a page that describes the product without letting anyone use it.
4. A site that is useful on its own, with a connector beside it. The visitor explores the reference and the business structure on one map and watches real jobs run across it. The connector serves the same content to their AI.

## Decision

Option 4: a site at foothold.milux.co.uk and a read-only connector. The three rungs are browse, connect and install. The site and connector show the map; the install is where a business puts itself on it.

An application is needed because routes across a two-layer map are interactive by nature. It does not need a server for anything except the connector.

## Consequences

- The pack needs an explicit schema before the site can show much (0003).
- Usage can be counted for the first time.
- A second public surface has to be kept in step with the pack. A daily rebuild does this.
- One piece of novelty is spent across the whole product: the two-layer map with job routes (0004). Everything else is deliberately ordinary.
- The decision is reversible. The pack stays the single source of truth and works without the site. The risk to avoid is letting the site hold content the pack does not: the moment the site shows something an install lacks, the earlier failure returns.

## Revisit when

A pre-launch test shows that unbriefed people from small defence businesses cannot say what Foothold is and why they would install it, or the first month's figures show visitors do not open job routes.
