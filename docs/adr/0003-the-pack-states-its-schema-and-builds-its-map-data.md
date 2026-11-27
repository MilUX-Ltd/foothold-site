# 0003: The pack states its own schema and builds its own map data

Status: accepted, November 2026

## Context

The site, the connector and an installed copy must all show the same thing. Before this decision the pack had page types in frontmatter and ordinary wikilinks between pages. It had no stated set of relationships, and nothing said which pages a skill reads or where it files its output. The only typed graph was one derived by a previous demonstration, which also held a partner's data and invented entries.

The structure that tells an AI how to get around the pack is the product, so skills that declare what they touch should be part of Foothold, not a layer added for a website.

This is the one decision in the set that is hard to reverse: the shape of the data becomes a contract between the pack, the site and the connector.

## Options

1. The pack carries the schema and builds the data. Entity types and named relationships go into frontmatter and are documented on one page. Each skill declares what it reads and writes. Each job route is a small data file. A script in the pack repository builds one published data file and fails the build on any fault.
2. The site derives a graph from the pack's wikilinks at build time. No pack change. Relationships would be unnamed, the business layer would be hand-drawn in the site, and installers would gain nothing.
3. Start from the earlier demonstration's data file and tidy it. Quickest to a picture, but it leaves the pack without a schema, carries data we may not reuse, and shows things an install does not contain.

## Decision

Option 1, as its own pack release ahead of any site work.

- **Defence layer.** A short, closed list of entity types (programme, framework, portal, public body, investor, event series, place) and named relationships between them, held in frontmatter.
- **Business layer.** Each skill declares what it reads and writes, against folders and entity types. Each folder guide is the node for its folder.
- **Routes.** One data file per job: an ordered list of skills with a one-line description of each step.
- **Places.** Pages that have a real location carry it as an optional field, for the geographic view (0004).
- **Build and checks.** A script kept in the pack repository builds the data file. It fails if a relationship points at a page that does not exist, if a skill declares a folder that does not exist, if a route names a missing skill, or if any edge cannot be traced to a frontmatter field. It also fails if a page of type person, or a field holding a personal name, reaches the output.
- **No language model builds the data.** Every edge is one an author wrote.

This site repeats the important checks on its own side (`src/lib/map-schema.mjs`), so a bad file is refused even if the pack's own check were bypassed. The contract is written down in `CONTEXT.md`.

## Consequences

- Hundreds of pages need relationship fields and the skills need declarations. The skills on the launch routes are done first.
- Every installer gets a typed structure their AI can use directly.
- The site cannot drift: a skill that changes where it files things changes the map the next morning.
- The pack gains a build step and a test suite it did not have.
- A change to a skill's declarations is a change to a skill, so the safety audit is re-run on that release.
- No novelty is spent: frontmatter fields, a build script and a validation step are ordinary.
- The data file's shape is the near one-way door. It is versioned from its first release, and a breaking change needs a new major version with the site and connector updated in the same release. Everything inside the shape (adding a type, a relationship or a route) stays cheap.

## Revisit when

The schema needs a third breaking change inside six months, or authors routinely fail the checks for reasons that are faults in the schema and not in the page.
