# Claw — User Growth & Attraction Strategy

**Date**: 2026-04-23  
**Author**: Hermes Plan Agent  
**Scope**: Review of `~/dev/claw`, product analysis, and strategic user-growth recommendations. This is a *plan* document — no code changes.

---

## 0. Executive Summary

**Claw** is an Electron desktop app that wraps Claude Code SDK, providing a local-first AI development environment. It is currently at **v0.2.3**, bootstrapped via releases on GitHub, and appears to have **minimal external visibility** (no public website, no social presence, no community channels). The code is mature and feature-rich — but growth infrastructure is nearly absent.

**The Product is Strong; the Distribution is Invisible.**

This plan identifies 6 strategic growth levers, with prioritized action items, estimated effort, and expected impact.

---

## 1. Product Snapshot — The Good News

### What Claw Is
- **One-line hook**: "Claude Code in a desktop app — local, fast, and visual."
- **Category**: AI-powered desktop IDE / Agentic development environment
- **Core users**: Developers who already use Claude Code and want a GUI, session management, K8s, GitHub, and MCP integrations
- **Architecture**: Electron 33, React 19, TypeScript, SQLite, tRPC IPC, Tailwind, Radix UI
- **AI models**: Claude Pro (OAuth), Anthropic API key, AWS Bedrock SSO, custom/Ollama endpoints

### Feature Depth (Why Retention Could Be High)
| Feature | Depth |
|---------|-------|
| Git worktree isolation | Auto-branch creation, merge dialog, LFS detection |
| Visual diff viewer | Full Git client with split/unified views, staging, commit |
| Kubernetes | EKS multi-cluster, pod logs, node metrics, deployments |
| GitHub | Full PR review, code browser, architecture diagrams, issue chat |
| MCP servers | 16+ integrations with OAuth 2.1, encrypted credentials |
| Session management | Sub-chats, cross-view persistence, resume, background agents (Haiku) |
| Terminal | xterm.js with tabs, search, drag-and-drop file paths, OSC-7 |
| Messaging bots | Slack webhook + Socket Mode, WhatsApp (Baileys), Discord (planned) |
| Workflows | Visual flowcharts connecting MCP tools |
| Prompts library | Categorized system prompts with live editor |
| 11 sidebar tabs | Complete workspace (History, Workspaces, Clusters, GitHub, MCPs, etc.) |

**Key insight**: The product already has enough depth to justify a paying audience. The problem is **nobody can find it**.

---

## 2. Current Visibility Audit — The Bad News

### What I Found
| Channel | Status | Notes |
|---------|--------|-------|
| GitHub repo (`jaydeland/claw`) | ✅ Private source? `sync-to-public.sh` suggests a separate public repo | The `PUBLIC_REPO` in the sync script points to `git@github.com:your-org/claw.git` — this is likely a stub or misconfigured. Need to verify if a public repo actually exists or if releases are private. |
| GitHub Releases | ✅ Exists | Releases appear on GitHub with binaries (macOS, Linux, Windows). But not widely discoverable without a public repo/README landing. |
| Website / landing page | ❌ None | No claw.so, no docs hosted, no SEO-optimized page. A user who googles "Claude Code desktop app" won't find it. |
| Blog posts / tutorials | ❌ None | Zero content marketing. No "How I scaled my team with Claw", no comparison posts. |
| Twitter / X / Mastodon | ❌ None | No social presence to catch developers scrolling. |
| YouTube | ❌ None | No demo videos, no tutorial walkthroughs. For an Electron app with a visual UI, this is a massive missed channel. |
| Discord / community | ✅ Planned (see PLAN.md) | Discord integration is planned in `PLAN.md`, but there's no *user-facing* Discord community server for Claw itself. |
| Reddit | ❌ None | No /r/claude, /r/LocalLLaMA, or /r/programming posts about it. |
| Hacker News "Show HN" | ❌ None | Not submitted. |
| Product Hunt | ❌ None | Not launched. |
| Homebrew tap | ✅ Exists | `generate-homebrew-cask.mjs` generates a cask. Good distribution if people know to `brew install --cask claw`. |
| App Store / Notarized builds | ❌ Unknown | There is DMG generation (`build-release.mac` generates a DMG), but no clear notarization or MAS submission. |
| Documentation site | ❌ None | Only markdown files in repo. No Docusaurus / VitePress / GitBook generated docs. |
| SEO / organic traffic | ❌ None | No dedicated domain means no ability to index. |

**Core problem**: The app is distributed entirely through GitHub releases. That limits you to developers who already follow you on GitHub or hear about it by word-of-mouth.

---

## 3. Why This Matters Now

### Market Context (2026)
- **Claude Code** (Anthropic's CLI tool) has gone mainstream in early 2026. It is the default "agent" experience for developers.
- **Cursor**, **Windsurf**, and **GitHub Copilot** own the IDE-agent space. But they are **cloud-first** or cloud-synced.
- **Local-first** is a growing segment — privacy-conscious developers, enterprise IT, air-gapped environments.
- **Claw fills a clear gap**: A true native desktop wrapper for Claude Code with local execution, Git isolation, K8s, and MCP integrations. It is the most powerful *local* Claude Code UI.

### The Window Is Now
Anthropic is pushing Claude Code hard. Search volume for "Claude Code" is high but dropping off into subcategory queries like:
- "Claude Code GUI"
- "Claude Code desktop app"
- "How to use Claude Code without terminal"
- "Claude Code with visual diff"

**Claw can own these search terms.** But only if it has pages to capture them.

---

## 4. Growth Strategies — Ranked by Impact/Effort

### Strategy A: Content Marketing + SEO (High Impact, Medium Effort)

**What's needed**: A lightweight landing page + blog. Host it on `claw.dev` or a GitHub Pages subdomain for free.

**Pages that should exist** (each is an SEO magnet):
| Page Title | Search Intent | Content |
|---|---|---|
| "Claude Code Desktop App" | People searching for a GUI for Claude Code | Hero section with a demo GIF, feature bullets, download CTA |
| "Claude Code + Kubernetes" | DevOps engineers who want AI-driven K8s management | Screenshots of the K8s dashboard in Claw |
| "Git Worktree Isolation for AI Agents" | Sophisticated developers worried about main-branch safety | Explain auto-branching, merging, and PR tracking |
| "Local MCP Server Manager" | MCP-curious developers | Show the 16+ MCP integrations, OAuth setup |
| "Claude Code vs Cursor vs Claw" | Comparison shoppers | Honest comparison table; Claw wins on local-first + Claude-native |
| "Multi-Chat Claude with Session Resume" | Power users tired of losing context | Show sub-chats, history, background agents |

**Effort**: 1–2 weekends to set up VitePress or Astro on GitHub Pages.  
**Impact**: Compound organic traffic for years. Direct download conversions.

---

### Strategy B: "Show HN" + Viral Demo (High Impact, Low Effort)

**What's needed**: One polished Hacker News post with a video or GIF.

Claw has enough visual punch for a successful "Show HN" post. The combination of:
- Git worktree auto-branching
- Visual session flow graph (ReactFlow)
- Real-time K8s pod logs
- Visual diffs with PR tracking

...is easily packaged into a 60-second GIF that makes developers say "I want this."

**Effort**: Write one post, record one screen recording, post on a weekday morning (EST).  
**Impact**: Can drive 10K+ visits in 24 hours if it hits the front page. Direct GitHub stars spike.

---

### Strategy C: YouTube Tutorial Series (Very High Impact, High Effort)

**What's needed**: 3–5 short (5–10 min) tutorials published to a Claw channel or your personal channel.

Topics:
1. "Getting Started with Claw — Claude Code Desktop App" (intro + install)
2. "Let AI Manage Your Kubernetes Cluster with Claw" (K8s dashboard walkthrough)
3. "Safely Run Claude Code Agents with Git Worktree Isolation" (explain the branching model)
4. "Set Up 16 MCP Servers in Under 5 Minutes with Claw" (MCP integration)
5. "Building Workflows: Connecting Slack to Claude via Claw" (bot integrations)

Claw's UI is visually rich enough that screen recordings feel premium. The YouTube algo loves "how to" developer content.

**Effort**: ~2–3 hours per video + thumbnail design.  
**Impact**: Highest long-tail discovery channel. YouTube is the #1 search engine for developer tooling.

---

### Strategy D: Product Hunt Launch (Medium Impact, Low Effort)

**What's needed**: A polished Product Hunt page on launch day.

**Materials needed**:
- 5 screenshots/GIFs (use the assets already in `assets/screenshots/`)
- 2-sentence tagline
- Maker comment explaining the problem it solves
- Launch discount or free-tier hook (if you ever monetize)

**Effort**: 1 day to prepare. 2 hours on launch day to reply to comments.  
**Impact**: Direct traffic spike, SEO backlinks, social proof.

---

### Strategy E: Discord Community Server (Medium Impact, Low Effort)

**What's needed**: Create a Claw Discord server. Use the bot integration as a demo.

Already planned as a feature (`PLAN.md`), but it should also serve as the *community hub*.

Benefits:
- Users get support
- Beta testers congregate
- Feature requests surface organically
- Power users become evangelists

**Effort**: 30 minutes to spin up a server. Moderation grows with user count.  
**Impact**: Reduces churn, builds word-of-mouth.

---

### Strategy F: Open-Source Flywheel (High Impact, Medium Effort)

**What's needed**: Clarify the public/private repo split and make the repo genuinely open-source.

**Current state**: `sync-to-public.sh` suggests a private → public sync model, but the public repo is undefined (`your-org/claw.git`).

**Why this matters**: Most AI dev tools are open-source (OpenWebUI, Continue, Aider, etc.). Open source:
- Generates trust ("I can audit the code")
- Drives organic PRs and contributors
- Builds reputation for the author
- Enables community plugins

**Recommendation**: Pick a license (e.g., AGPL or MIT) and publicize the repo. If there are proprietary parts (Claude SDK wrapper, auth flows), consider a dual-license or keep those private in a separate package.

**Effort**: 1 day to audit repo for secrets, add LICENSE, and rewrite README for open-source audience.  
**Impact**: Fundamental; turns Claw from a "private tool" into a community project.

---

## 5. Quick Wins — Do These First

| # | Win | Why | Effort |
|---|-----|-----|--------|
| 1 | **Record a 60-second screen demo GIF** showing: new chat → plan mode diff → K8s dashboard. Embed in README and use as GitHub social image. | Highest leverage content piece. Can be reused across HN, PH, Twitter, Reddit. | 1–2 hours |
| 2 | **Add "Download on GitHub Releases" badge and "Homebrew" badge to README** | Lowers friction for anyone landing on the repo. | 30 min |
| 3 | **Buy `claw.dev` or `getclaw.app`** and redirect to GitHub Releases page. | Sets up SEO foundation. ~$10/yr. | 30 min |
| 4 | **Post a single "Show HN"** on a Tuesday morning (9am EST) with the GIF. | Can generate thousands of targeted developer visits. | 2 hours |
| 5 | **Create a Discord server** and link it in README. | Starts community flywheel. | 30 min |
| 6 | **Publish the repo under the actual `jaydeland/claw` org** and set license (MIT/APGL). Open source drives trust. | Transforms perception. | 1 day |

---

## 6. Technical Discovery During Review

### Positive Findings
- **Well-structured Electron app** with proper main/renderer IPC via tRPC
- **Automated release pipeline**: Builds macOS/Windows/Linux, generates update manifest, Homebrew cask, and DMGs
- **Good onboarding infrastructure**: Settings UI covers appearance, keyboard shortcuts, models, MCP, K8s, billing, beta toggles
- **Database is SQLite with auto-migrations** — robust for a local-first app
- **Flox-managed dev environment** — reproducible builds
- **Security**: Path validation, secure FS, encrypted credential storage via `safeStorage`
- **Testing infrastructure**: `test-driven-development` and `systematic-debugging` patterns used

### Areas of Note
- `sync-to-public.sh` has `PUBLIC_REPO="git@github.com:your-org/claw.git"` — **this is stub/misconfigured**. If a public repo exists, it needs to be maintained. If not, the open-source story is blocked.
- No user analytics or telemetry infrastructure — no way to know how people use it.
- No update-check server (the manifest generation exists but relies on Cloudflare Wrangler — might need a simpler hosting option for zero infra cost).

---

## 7. Risks & Tradeoffs

| Strategy | Risk | Mitigation |
|---|---|---|
| "Show HN" | Negative feedback on polish or bugs | Ship a known good release, monitor `issues` after launch |
| YouTube | Time investment for uncertain return | Start with one video; measure comments & click-throughs |
| Open-source | Cloning / competitors / maintenance burden | Pick a license with copyleft for SaaS spin-offs (AGPL) |
| Product Hunt | Low traffic if not "Featured" | Coordinate launch with social pushes |
| Website SEO | Slow ramp — takes months to rank | Start immediately so it compounds. Target niche keywords first. |

---

## 8. Recommended Next Actions (This Week)

1. [ ] **Verify public repo status**: Does `jaydeland/claw` on GitHub host releases? Is the repo public or private? If private, set a date to go public.
2. [ ] **Record the 60-second GIF** using Screen Studio or CleanShot and embed in README.
3. [ ] **Add badges** to README (GitHub Releases, Homebrew, License).
4. [ ] **Draft a "Show HN" post** (title: "Show HN: Claw — Desktop Claude Code with Git Worktree Isolation and Kubernetes").
5. [ ] **Spin up a Claw Discord server** (use the Claw bot integration as the first demo).
6. [ ] **Schedule a Product Hunt launch** for 2–3 weeks out after HN, so the traffic wave has a follow-up.

---

## 9. Open Questions

- Is the `jaydeland/claw` GitHub repo intended to be the public repo, or is there a separate org?
- Are there any paying customers already? If so, the growth strategy should prioritize their feature requests over broad acquisition.
- Is there a monetization plan (e.g., Claw Cloud, Teams features, or purely donation/ OSS)? This affects messaging significantly.
- What is the `sync-to-public.sh` actual target? Is it broken/stale?

---

*End of plan*
