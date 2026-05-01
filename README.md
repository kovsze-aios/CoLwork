<div align="center">

# CoLwork

**An open-source autonomous career engine — Mixture of Experts × RAG × Native Desktop UI.**

`Job Hunter` ▸ `Research Lab` ▸ `Integrated Terminal` — all running locally on your machine.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Electron](https://img.shields.io/badge/electron-33-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Built with DeepSeek](https://img.shields.io/badge/LLM-DeepSeek-0A66C2)](https://platform.deepseek.com)

</div>

---

CoLwork is a desktop application that turns the chore of job-hunting and personal-brand work into a single click. It combines a **Mixture-of-Experts (MoE) reasoning board**, a **lightweight RAG engine** for context, and an **n8n cloud back-end** for orchestration — wrapped in a **native Electron + React UI** with the look and feel of a modern code editor.

The whole thing runs on your laptop. Your data never leaves your machine except for the LLM round-trip and the optional Sheets/Docs sync you opt into.

## Why

Existing "AI career tools" are either browser extensions that scrape behind your back, SaaS dashboards that trap your data, or one-shot ChatGPT prompts. CoLwork is none of those:

- **Native, not SaaS.** A real `.exe` you install. No login, no cloud account, no subscription.
- **One LLM call per task.** The MoE board runs cheap local heuristics; the LLM is invoked once with everything it needs. A full job-application package costs about **$0.001** in tokens.
- **Open source.** Every prompt, every n8n node, every UI pixel is in this repo. Fork it, audit it, ship your own.

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  Electron Shell  (frameless window · custom title bar · IPC)   │
├──────────────┬─────────────────────────────────────────────────┤
│   React UI   │         CoLwork Engine (Node.js)                │
│  ───────────  │  ──────────────────────────────────────────────  │
│  • Dashboard  │  Mixture of Experts (MoE)                       │
│  • Job Hunter │   ├─ Sherlock  → Company OSINT (Playwright)     │
│  • Research  │   ├─ Feynman   → CV scoring + simplification     │
│    Lab       │   ├─ Seed      → Hook + outreach copy            │
│  • Terminal  │   ├─ Paul      → Visual brand audit              │
│    (xterm)   │   ├─ Oscar     → Tone & polish                   │
│              │   └─ Aristotle → Profile re-architect            │
│              │                                                  │
│              │  RAG Engine                                      │
│              │   ├─ data/resume.md  (your story)                │
│              │   ├─ data/memory.json (action log)               │
│              │   └─ data/nauka/      (what you've learned)      │
│              │                                                  │
│              │  Orchestration                                   │
│              │   └─ n8n Cloud workflows (data/n8n_workflows/)   │
└──────────────┴─────────────────────────────────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │  DeepSeek (chat API)  │  ← single round-trip, ~$0.001
                └───────────────────────┘
```

### Mixture of Experts

Each "expert" is a small JavaScript module under [`src/experts/`](src/experts/) with a single responsibility. They run **locally and for free** — they prepare the LLM prompt, score outputs, and route between stages. Only the synthesizing call goes over the network.

| Expert | File | Responsibility |
|---|---|---|
| **Sherlock** | `src/experts/sherlock.js` | Scrapes the company page, extracts culture signals, pain points, tech stack. |
| **Feynman** | `src/experts/feynman.js` | Scores a CV against a job description; collapses jargon into a one-liner. |
| **Seed** | `src/experts/seed.js` | Crafts the cold-outreach hook + icebreaker. |
| **Paul** | `src/experts/paul.js` | Visual / brand-consistency auditor (uses Playwright screenshots). |
| **Oscar** | `src/experts/oscar.js` | Polishes tone, removes filler, enforces voice. |
| **Aristotle** | `src/experts/aristotle.js` | Re-architects headline / About / skills from a goal. |
| **Board** | `src/experts/board.js` | Pipeline conductor — runs the experts in order, hands off to n8n. |

### RAG Engine

The "R" in RAG here is deliberately lightweight: no vector DB, no embeddings, no `pip install langchain`. The retrieval layer reads three plain-text sources and stuffs the relevant chunks into the prompt:

- **`data/resume.md`** — your structured story (start from `data/resume.example.md`).
- **`data/memory.json`** — append-only action log; lets the engine remember what it tried last week.
- **`data/nauka/`** — your notes / lessons / scraped insights, one Markdown file per topic.

This is enough for personal-scale workflows. If you outgrow it, swap `src/utils/memory.js` for whatever vector store you like.

### n8n cloud back-end

Two production workflows live in [`data/n8n_workflows/`](data/n8n_workflows/) and are deployed by [`src/scripts/deploy_n8n_workflows.js`](src/scripts/deploy_n8n_workflows.js):

- **`job_application_engine.json`** — `webhook → normalize → scrape company → DeepSeek (single call) → CV + cover letter + recruiter email`.
- **`profile_optimizer.json`** — `webhook → normalize → mine keywords → DeepSeek (single call) → headline + About + skills + content angles + before/after audit`.

Bring your own n8n instance (self-hosted or Cloud), point `N8N_BASE_URL` and `N8N_API_KEY` at it, run `npm run n8n:deploy`, and the workflows are pushed and activated for you.

## Quick start

### Prerequisites

- **Node.js 22+** ([download](https://nodejs.org))
- A **DeepSeek API key** ([platform.deepseek.com](https://platform.deepseek.com)) — required.
- (Optional) An **n8n instance** with public-API access — required for the Job Hunter / Research Lab one-call flows. Without it, the same logic runs locally via the MoE board.
- (Optional) Google Sheets/Docs IDs if you want syncing.

### 1. Clone and install

```bash
git clone https://github.com/your-org/colwork.git
cd colwork
npm install
```

### 2. Configure

```bash
cp .env.example .env
# open .env in your editor and fill in DEEPSEEK_API_KEY (minimum)
```

### 3. (Optional) Deploy the n8n workflows

```bash
npm run n8n:deploy
```

The script is **idempotent** — it creates new workflows or updates existing ones by name, then activates them.

### 4. Launch the desktop app

```bash
npm run dev
```

This starts Vite on `http://localhost:3000` and Electron in dev mode (hot-reload across both processes). The app opens to the Dashboard.

### 5. Build the installer (Windows `.exe`)

```bash
npm run build:desktop
```

The signed installer lands in `dist-desktop/CoLwork-Setup-<version>.exe`. For all three OSes (mac, windows, linux):

```bash
npm run build:all
```

## CLI mode

Don't want the GUI? Every flow has a CLI command (see [`index.js`](index.js)):

```bash
node index.js apply --jobTitle "Senior AI Engineer" --company "Acme AI"
node index.js optimize --goal "Become an LLM platform lead in 6 months"
node index.js audit https://www.linkedin.com/in/your-handle/
node index.js cron     # runs the autonomous scheduler in the background
node index.js flush    # drains any queued offline actions
```

## Folder layout

```
colwork/
├─ electron/              # Electron main + preload (IPC bridge)
├─ ui/                    # Vite + React 19 + Tailwind v4 renderer
│  └─ src/
│     ├─ components/      # TitleBar · Sidebar · StatusBar · Logo
│     └─ views/           # Dashboard · JobHunter · ResearchLab · TerminalView
├─ src/
│  ├─ ai.js               # DeepSeek + Kimi clients (OpenAI-compatible)
│  ├─ browser.js          # Playwright session, anti-detection
│  ├─ cron.js             # node-cron scheduler
│  ├─ experts/            # MoE modules
│  ├─ modules/            # Concrete tasks (jobs, content, networking, reporting)
│  ├─ scripts/            # Maintenance: deploy_n8n_workflows.js, …
│  └─ utils/              # n8n_bridge · memory · usage tracker · sheets
├─ data/
│  ├─ n8n_workflows/      # JSON workflow definitions (committed)
│  ├─ resume.example.md   # template — copy to resume.md (gitignored)
│  └─ nauka/              # your notes (gitignored)
├─ index.js               # CLI entry point
├─ package.json           # electron-builder config lives here too
└─ .env.example           # all environment variables, documented
```

## Cost

A typical run:

| Operation | LLM tokens | DeepSeek cost |
|---|---:|---:|
| Job application (CV + letter + email) | ~1300 | **$0.001** |
| Profile rebuild (headline + About + skills + angles) | ~1360 | **$0.0008** |
| Cron daily run (aggregate + post + networking) | ~3000 | **$0.002** |

Cached prompt prefixes hit DeepSeek's cache for an additional 10× discount on repeat runs.

## Contributing

Contributions are welcome — especially new experts, new n8n workflows, and UI polish.

1. **Fork** the repo and create a topic branch: `git checkout -b feat/my-expert`.
2. **Code style:** the project is plain JS (no TypeScript) with ES2022. Two-space indent. No semicolons in new React files; semicolons everywhere else (existing convention).
3. **New expert?** Drop a module in `src/experts/`, export a single async function, wire it into `src/experts/board.js`. Add a one-line description in this README.
4. **New n8n workflow?** Drop the JSON in `data/n8n_workflows/`. Re-run `npm run n8n:deploy`. Document the webhook path.
5. **UI changes?** `npm run dev` for hot-reload. Stick to the design tokens defined in [`ui/src/index.css`](ui/src/index.css) (`--color-linkedin*`, zinc palette). All icons come from [`lucide-react`](https://lucide.dev).
6. **Open a pull request** with a description of *why* — screenshots if visual.

Issues, ideas, and "this prompt could be tighter" PRs are equally welcome. There is no CLA.

## Privacy & security

- All credentials live in `.env` (gitignored). Use `.env.example` as the source of truth for what keys exist.
- LinkedIn cookies are stored in `data/cookies.json` (also gitignored).
- The MoE board never ships your raw resume to anywhere except the LLM endpoint you configure (`DEEPSEEK_BASE_URL`).
- The `npm run build:desktop` installer **does not** bundle your `.env` — only `.env.example` ships in the binary.

## Acknowledgements

- [DeepSeek](https://platform.deepseek.com) — the LLM doing the heavy lifting at near-cost pricing.
- [n8n](https://n8n.io) — orchestration layer.
- [Playwright](https://playwright.dev) — stealth browser automation.
- [xterm.js](https://xtermjs.org) — embedded terminal.
- [Lucide](https://lucide.dev) — every icon.
- [Tailwind CSS](https://tailwindcss.com) — design system.

## License

MIT — see [LICENSE](LICENSE).
