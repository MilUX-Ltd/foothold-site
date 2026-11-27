# 0006: Install by zip or GitHub, built from tagged releases

Status: accepted, November 2026

## Context

The site leads to an install. At the time of the decision the only supported route was a prompt pasted into an AI tool, which fetches a setup skill from GitHub. It was written for one AI tool and needs a paid plan and a note-taking application.

The decisions that change this:

- The site encourages two routes: a downloadable zip and GitHub. The aim is the path of least resistance: download the folder, give the Start Here file to your AI, pointing at that folder.
- A fuller synchronised option is mentioned, but it is not the first route and not a launch dependency.
- Foothold is presented as working with most AI tools, and says which tools its makers use.
- The site does not go live until the safety audit of the pack's skills passes.

The pack's maintenance record rules out zips, but the rule refers to hand-built zips retired earlier. Zip and clone routes with automated zip publishing were built in install work that was parked and never released. The original zip fault was accented filenames, and a standing rule already requires ASCII filenames in every release artefact.

A zip of instructions that a stranger's AI will follow is a supply-chain surface. That is the main security concern here.

## Options

1. A zip built by the pack's pipeline from a tagged release, with a published checksum, and a GitHub prompt beside it. Both come from the same tag.
2. A zip built by hand and uploaded. This is what was retired. There is no proof the zip matches the repository.
3. A GitHub prompt only. No new work, but it keeps the hurdle of a tool that can fetch from GitHub, and gives nothing to people who want a folder.

## Decision

Option 1.

- **One source.** Every route delivers the same tagged release of the pack. The site links to the latest tag and names its version.
- **Zip.** Built by the pack's pipeline on a tag, never by hand, with a checksum published beside it. Filenames are ASCII only.
- **Start Here.** The pack gains a tool-neutral Start Here file as its entry point. Tool-specific instruction files, where a tool needs one, point at it.
- **No sign-up.** No email, form or account before any route. Optional help with setup is one link, not a gate.
- **Named tools are proved.** The setup is walked end to end on each AI tool the site names, and only those that pass are named.
- **Audit gate.** The safety audit is run on the release the site links to and re-run on any release that changes a skill.

The parked install work is released as part of this, after being checked against the current pack.

## Consequences

- The pack repository gains a release pipeline it did not have. Its maintenance page is updated to say which zips are allowed and why.
- The mention of the fuller option must describe what it actually carries on the day.
- Installs by zip cannot be counted beyond the click. Whether installs stay in use stays unmeasured unless a later decision adds a way to count it.
- Parts of setup that rely on one tool's features, such as scheduled jobs, become optional steps.
- No novelty is spent. A release zip with a checksum is ordinary.
- Reversible: a route can be removed from the site in one change. The risk to avoid is a zip that is not reproducible from a tag, because nobody can then say what a given person installed.

## Revisit when

A failed install is traced to the zip, fewer than two AI tools pass the walk-through, or the fuller synchronised option becomes simple enough to lead with.
