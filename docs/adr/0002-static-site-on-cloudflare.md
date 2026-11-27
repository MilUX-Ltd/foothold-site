# 0002: A static site on Cloudflare with one server route

Status: accepted, November 2026

## Context

The site is public and read-only. There is no sign-in, no account and no personal data. Its content is the pack's public pages, rebuilt daily. Running cost must stay close to free. The company's domain is already on Cloudflare, and two other MilUX sites run there as Workers serving static assets.

A method that warns against carrying a default stack into a new product should test the default, so the stack of an existing MilUX site, Tally, was tested against this target. The four facts that pointed Tally at static hosting hold here: public, read-only, no accounts, a hard cost ceiling. One fact differs in Foothold's favour: this site calls no language model, so it holds no model key and has no spend to cap.

## Options

1. Cloudflare Workers static assets, Astro for pages, TypeScript, Vitest, and Playwright with axe. The Tally baseline. The free tier covers static requests, and the security headers, the public-terms guard, the deploy check, preview deploys per pull request and the release pipeline are already written.
2. GitHub Pages from the pack repository. Free, and keeps everything in one place. No server side for the connector, and it mixes site code into a pack that people install.
3. A single self-contained HTML file, as an earlier demonstration was. Simple and works offline. No per-page addresses for search engines or sharing, no connector, and the one file is already large before the business layer is added.

## Decision

Option 1. A static Astro build served by a Cloudflare Worker with static assets. One server route, `/mcp`, for the connector (0005); nothing else runs server-side. The site lives in its own public repository, started from the Tally baseline. Site code is licensed CC BY-NC 4.0; the pack has its own licence.

## Consequences

- Hosting and DNS cost nothing at expected traffic.
- No secret beyond the deploy and analytics tokens, both held in the pipeline's secret store.
- Lessons recorded on Tally apply from the first day: interactive code is mounted from a bundled module so the content security policy holds, the lockfile is regenerated cleanly, and deploys happen only from the pipeline.
- Versions are tagged in the repository as they ship. Tally's were not, and its repository still reads 0.1.0.
- No novelty is spent. This is the pattern two MilUX sites already run on.
- Reversible: the output is plain static files and would serve from any static host. The risk to avoid is putting logic in the Worker beyond the connector.

## Revisit when

Worker invocations grow far beyond what the free tier comfortably covers, Cloudflare changes the free-tier terms for static assets, or a feature is proposed that needs a second server route.
