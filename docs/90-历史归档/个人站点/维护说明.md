# Maintenance Plan

## What This Site Should Prove

The site should prove that William can design and build Agent Harness systems.

It should answer:

- What systems has he built?
- What architecture does he use?
- How does he think about state, review, recovery, and persistence?
- What artifacts can prove the work?
- What is he building now?

## Update Rhythm

Weekly:

- Add one short Now update.
- Add one engineering note idea or link.
- Update active project status.

Monthly:

- Promote one system improvement to a case study.
- Add a diagram if the architecture changed.
- Archive old notes that no longer represent the current direction.

Quarterly:

- Rewrite the homepage positioning.
- Choose the top 3 systems only.
- Remove weak or outdated claims.

## What To Add Over Time

- Screenshots of the workstation UI.
- Architecture diagrams rendered as images.
- A short demo video.
- Links to merged PRs.
- Test/build badges.
- Public GitHub repo links.
- A downloadable architecture PDF.

## What Not To Add

- Vanity metrics without proof.
- Generic AI slogans.
- Content-operation positioning.
- Too many unfinished projects.
- Screenshots that look like internal clutter.
- Draft articles that are not edited.

## Publishing Options

### Option A: GitHub Pages + al-folio

Best if the site should look like an academic/technical personal homepage.

Pros:

- proven template;
- Markdown-first;
- easy GitHub Pages deployment;
- good for notes, projects, selected work.

Cons:

- Ruby/Jekyll dependency;
- less flexible for custom interactive visuals.

### Option B: Static Next.js Site

Best if the site should reuse this repo's React/Next stack.

Pros:

- same stack as current project;
- easy to build custom diagrams and UI;
- can later integrate live project demos.

Cons:

- more code to maintain;
- needs design work.

### Option C: Plain Markdown + GitHub README

Best for the fastest first public version.

Pros:

- no build system;
- easy to maintain;
- can ship immediately.

Cons:

- not as polished;
- weaker personal-brand surface.

## Recommended Path

Start with this Markdown draft.

Then build a small static personal site with:

- homepage;
- systems page;
- architecture page;
- notes page;
- contact page.

Only after the content feels stable should we decide whether to publish through al-folio or a custom Next.js static site.

