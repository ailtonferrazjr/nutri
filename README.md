# Nutri

A chat-first food assistant for a two-person household. It keeps track of what is in the pantry, reads supermarket receipts, builds grocery lists with real Mercadona prices, plans the week's meals and suggests new recipes, all through an AI agent that can act on the app's data instead of just talking about it.

The app UI and the agent's replies are in Portuguese. Product names are in Spanish, because that is how they appear in the store.

## Why it exists

I built Nutri for my partner and me. We are Brazilians living in Spain, we do most of our shopping at Mercadona, and we have different food preferences. The questions we kept asking each other were always the same: what do we have at home, what is about to expire, what can we cook tonight that works for both of us, and what do we need to buy this week.

Generic recipe apps did not know what was in our kitchen, and generic chatbots did not know what Mercadona sells or what it costs. Nutri connects those pieces: a Postgres database with our pantry, recipes and meal plan, a local copy of the Mercadona catalog, and a Claude agent with tools to read and change all of it.

It is a real app we use day to day, deployed on Vercel. This repository is the public version of that codebase, with personal data replaced by a fictional household (Ana and Leo).

## Features

- **Chat agent**: ask in plain language ("o que dá pra fazer com o que tem na despensa?", "monta a lista da semana") and the agent calls tools to answer and to make the changes.
- **Receipt scanning**: send a photo of a Spanish supermarket receipt. Claude vision expands abbreviated lines (`LECH S/DES HAC 1L` becomes `Leche semidesnatada Hacendado 1L`), categorizes them and adds them to the pantry.
- **Pantry**: quantities, units, categories and expiry dates, with inline controls to adjust amounts. Items about to expire are injected into the agent's context so it brings them up on its own.
- **Grocery lists**: items are matched to real Mercadona products with current prices and an estimated total, grouped by store section for the walk through the aisles.
- **Mercadona catalog and deals**: about 4,300 products scraped per postal code, searchable with Postgres full-text search in Spanish, plus a view of current price drops.
- **Recipes**: a personal cookbook with ratings, favorites, tags and estimated nutrition, grouped by meal type.
- **Weekly meal plan**: plan breakfast, lunch, snack and dinner per day, for both people or for one of them. Planning a recipe adds its missing ingredients to the grocery list. Completing a meal deducts the ingredients from the pantry.
- **Recipe discovery feed**: a pool of AI-generated suggestions tailored to both profiles, with save, favorite, dismiss (with a reason) and "alter this recipe" actions. Feedback is stored and used to refine the profiles.
- **Two dietary profiles**: restrictions (treated as absolute), likes and dislikes, cuisines, meal timing and goals for each person. The agent reads them before suggesting anything.

## The AI agent

The chat endpoint (`app/api/chat/route.ts`) uses the Vercel AI SDK `streamText` with Claude, up to 5 tool-calling steps per turn, and streams the response back to a `useChat` client.

A few design choices worth pointing out:

- **Tools over prompts.** The agent does not get a dump of the database. It has 20 typed tools with Zod input schemas and pulls what it needs. Tool results are compact JSON shaped for the model, not raw rows.
- **Static prompt plus dynamic context.** The system prompt (`lib/agent/system-prompt.ts`) is stable and cached. A second system message (`lib/agent/context.ts`) is built per request with today's meal plan, expiring items and the active grocery list, so the agent can be proactive without a tool call.
- **Prompt caching.** The system prompt and the tool definitions are marked with Anthropic `cacheControl`, so repeated turns only pay for the new messages.
- **Catalog grounding.** When the agent adds items to the pantry or a grocery list, names are matched against the Mercadona catalog (full-text rank divided by name length, so "pollo" resolves to "Pechuga de pollo" and not to a chicken seasoning), which fills in canonical names, categories and prices.
- **Side effects across domains.** Planning a meal can update the grocery list, and completing one updates the pantry. The tool returns a summary of what changed so the agent can tell the user.

### Tools

Tools live in `lib/agent/tools/`, one module per domain. `index.ts` assembles them into the `agentTools` object passed to the model.

| Domain | Module | Tools |
| --- | --- | --- |
| Profiles | `profiles.ts` | `get_user_profiles`, `update_user_profile` |
| Pantry | `pantry.ts` | `get_pantry`, `add_pantry_item`, `remove_pantry_item` |
| Receipts | `receipts.ts` | `scan_receipt` |
| Grocery | `grocery.ts` | `create_grocery_list`, `get_grocery_list`, `check_grocery_item` |
| Mercadona | `mercadona.ts` | `search_mercadona`, `get_mercadona_deals` |
| Recipes | `recipes.ts` | `create_recipe`, `update_recipe`, `search_recipes`, `rate_recipe`, `suggest_recipes_from_pantry` |
| Meal plan | `meal-plan.ts` | `get_meal_plan`, `set_meal_plan_entry`, `remove_meal_plan_entry`, `complete_meal` |

Outside the chat, two other LLM paths use structured output:

- `lib/receipts/parser.ts`: `generateObject` with a Zod schema for receipt images.
- `app/api/discover/route.ts`: `streamObject` to stream recipe suggestions into the discovery feed. `scripts/generate-suggestions.ts` fills the pre-generated suggestion pool offline.

## Tech stack

- **Framework**: Next.js 16 (App Router, server actions), React 19, TypeScript
- **AI**: Vercel AI SDK 6 with `@ai-sdk/anthropic` (Claude Sonnet), Anthropic SDK for batch scripts
- **Database**: PostgreSQL with Drizzle ORM and drizzle-kit migrations
- **UI**: Tailwind CSS 4, shadcn/ui on Radix, lucide icons, mobile-first layout with a bottom tab bar
- **Scraping**: Playwright, to open a Mercadona session for a postal code and read the catalog API
- **Testing**: Vitest
- **Hosting**: Vercel

## Architecture

```
app/
  api/chat/            Agent endpoint (streamText + tools)
  api/discover/        Streams AI recipe suggestions (streamObject)
  api/auth/            Login / logout
  chat/                Chat UI (useChat) with conversation history and image upload
  despensa/            Pantry        compras/   Grocery list
  receitas/            Recipes       semana/    Weekly meal plan
  descobrir/           Discovery feed
lib/
  agent/               System prompt, dynamic context, tools/ (one module per domain)
  db/schema.ts         Drizzle schema
  db/queries/          Query functions shared by pages, server actions and tools
  ingredients/         Pure ingredient matching (pantry fuzzy match, staples, quantities)
  receipts/parser.ts   Receipt vision parsing
  auth.ts              Signed session cookies (Web Crypto, Edge compatible)
scripts/               Mercadona scraper and ingest, suggestion generator, db-query CLI
middleware.ts          Redirects unauthenticated requests to /login
.claude/skills/        Claude Code skills used to operate the app (see below)
```

Pages read through `lib/db/queries/*` in server components and write through server actions. The agent tools call the same query layer, so the chat and the UI always see the same state.

The main tables are `users` (the two profiles), `pantry_items`, `receipts` and `receipt_items`, `grocery_lists` and `grocery_items`, `recipes`, `recipe_suggestions`, `recipe_feedback`, `meal_plan`, `mercadona_categories` and `mercadona_products`, and `conversations` and `messages` for chat history.

### Claude Code skills

`.claude/skills/` contains project skills for running the app from Claude Code: an onboarding interview that fills in a dietary profile, a recipe generator that writes straight into the suggestion pool, and a feedback processor that turns dismissals and favorites into profile updates. They read the profiles from the database rather than hardcoding anyone.

## Authentication

Nutri is built for exactly one household, so there are no user accounts. Login is a single shared password (`AUTH_PASSWORD`). A correct password gets an HttpOnly cookie holding an HMAC-SHA256 signed token with an issued-at and an expiry (30 days), and `middleware.ts` verifies it on every request.

This is a deliberate trade-off for a private two-person app, not a pattern for multi-user products. What it does guarantee:

- It fails closed. If `AUTH_PASSWORD` or `AUTH_SECRET` is missing, login is refused and no token verifies.
- Password and signature checks are constant time.
- Tokens expire, and changing `AUTH_SECRET` invalidates every session.

What it does not do: per-user identity, login rate limiting, or revoking a single session. If you deploy it publicly, put it behind something that rate limits the login route or replace it with a real auth provider.

## Running locally

Requirements: Node 20+, pnpm, a Postgres database and an Anthropic API key.

```bash
pnpm install
cp .env.example .env        # fill in the values
pnpm db:push                # create the schema in your database
pnpm db:seed                # two fictional profiles (Ana and Leo)
pnpm dev                    # http://localhost:3000
```

Environment variables (all listed in `.env.example`):

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `ANTHROPIC_API_KEY` | yes | Used by the AI SDK and the Anthropic SDK |
| `AUTH_PASSWORD` | yes | Shared login password |
| `AUTH_SECRET` | yes | HMAC key for session tokens (`openssl rand -hex 32`) |
| `MERCADONA_POSTAL_CODE` | no | Postal code for the scraper. Defaults to `28001` |

### Mercadona catalog

The catalog is not committed. Fetch it by running the scraper, which writes `scripts/mercadona-data.json` (gitignored), then load it into the database:

```bash
pnpm exec playwright install chromium
MERCADONA_POSTAL_CODE=28001 pnpm mercadona:sync   # scrape + ingest
```

Prices and availability depend on the warehouse that serves the postal code. Everything except catalog search, deals and price estimates works without it.

### Useful scripts

```bash
pnpm typecheck
pnpm test                   # Vitest unit tests
pnpm db:query help          # named queries and raw SQL against your database
pnpm tsx scripts/generate-suggestions.ts   # top up the discovery pool
```

## Tests

Unit tests cover the logic that does not need a database or a model call:

- session token signing and verification, including expiry, tampering and the fail-closed cases when secrets are missing
- ingredient matching: accent and whitespace normalization, pantry fuzzy matching, staples and quantity parsing
- recovery of JSON arrays from model output
- the agent's tool registry and Zod input schemas, and the receipt schema
- week boundary math for the meal plan

CI runs typecheck and tests on every push and pull request (`.github/workflows/ci.yml`).

## Screenshots

> TODO: add real screenshots. Planned files:

- `docs/screenshots/chat.png`: agent conversation with tool calls
- `docs/screenshots/receipt.png`: receipt scan result
- `docs/screenshots/pantry.png`: pantry
- `docs/screenshots/grocery.png`: grocery list with Mercadona prices
- `docs/screenshots/week.png`: weekly meal plan
- `docs/screenshots/discover.png`: recipe discovery feed

<!--
<p>
  <img src="docs/screenshots/chat.png" width="250" alt="Chat" />
  <img src="docs/screenshots/grocery.png" width="250" alt="Grocery list" />
  <img src="docs/screenshots/week.png" width="250" alt="Weekly plan" />
</p>
-->

## Live demo

The deployed instance holds our real household data, so it is password protected and not open to the public. To try Nutri, run it locally with the steps above.

## License

[MIT](LICENSE)
