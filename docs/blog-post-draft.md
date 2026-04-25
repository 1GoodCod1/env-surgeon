---
title: "Your .env.example is lying to you"
published: false
description: "Why the file everyone commits is silently out of sync with the code — and a CLI that keeps it honest."
tags: node, typescript, devops, tooling
cover_image: ""
canonical_url: ""
---

> TL;DR: `.env.example` is a lie maintained by humans. Stop maintaining it by hand.
> `npx env-surgeon scan ./src --output .env.example` regenerates it from your actual code.

## The moment

Friday, 4:47 PM. You deploy. It crashes.

```
TypeError: Cannot read properties of undefined (reading 'toString')
    at lib/stripe.ts:12
```

You open the file:

```ts
const key = process.env.STRIPE_WEBHOOK_SECRET
stripe.webhooks.constructEvent(body, sig, key.toString())
```

You grep your repo. `STRIPE_WEBHOOK_SECRET` is read in **four places**, and it's
in `.env` locally. It's set on your laptop. It's set in staging.

It is **not** in `.env.example`.

The new engineer who just onboarded missed it. The CI deploy script that
builds secrets from the example missed it. Production missed it.

You know why it's not there. You added the Stripe integration three months
ago. You were going to update the example. You forgot. Everyone forgets.

## The file that always lies

Let's be honest about `.env.example`:

- It's written **once**, at the start of the project.
- Nobody opens it again unless onboarding a new dev.
- Code drifts. New `process.env.X` reads appear in PRs.
- Reviewers don't reject the PR because the code is correct.
- CI is green because your tests don't check env-completeness.
- **Your example goes stale by about one variable per sprint.**

Linters don't catch this. TypeScript doesn't catch this (`process.env` is
typed as `Record<string, string | undefined>` — it's always fine, until it
isn't). Tests don't catch this because tests hard-code fixtures.

The only thing that catches it is a 3 AM PagerDuty.

## Invert the relationship

The example file is a summary of what the code needs. So let the code
generate it. Don't hand-edit a summary — derive it.

```bash
npx env-surgeon scan ./src --output .env.example
```

What it does: walks your source tree, finds every read of

- `process.env.X`
- `import.meta.env.X`           (Vite, Astro)
- `Bun.env.X`
- `Deno.env.get('X')`
- `const { X, Y } = process.env`  (destructured)

…and writes a sorted `.env.example` with every key, blank values, and a
comment showing where each one is used.

Wire it into your lint script:

```json
{
  "scripts": {
    "env:sync":  "env-surgeon scan ./src --output .env.example",
    "env:check": "env-surgeon check",
    "lint":      "npm run env:check && eslint ."
  }
}
```

Now a PR that adds `process.env.NEW_THING` without updating the example
fails CI. The reviewer sees the failure. The drift stops.

## "What about optional variables?"

Some env vars are optional (`SENTRY_DSN`, feature flags). `env-surgeon` reads
a convention — mark them in the template:

```bash
# optional
SENTRY_DSN=
```

`check` won't complain when they're absent. `init` can generate this for
you from your current `.env`.

## "What about types?"

If a variable is `PORT=abc`, string-presence isn't enough. Schema
validation solves this:

```js
// env.schema.js
import { z } from 'zod'
export default z.object({
  PORT: z.coerce.number().min(1024),
  DATABASE_URL: z.string().url(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
})
```

```bash
env-surgeon validate --schema env.schema.js
```

Works with Zod if you want type inference. Works with a plain JSON schema
if you don't want another dependency. Pick one.

## The 30-second setup

```bash
npm install -D env-surgeon
npx env-surgeon init                              # generates .env.schema.json from your .env
npx env-surgeon scan ./src --output .env.example  # generates .env.example from code
```

Add to `package.json`:

```json
{
  "scripts": {
    "prestart": "env-surgeon check",
    "prebuild": "env-surgeon validate"
  }
}
```

Now your app refuses to start with a broken env. Which is what you wanted
all along.

## What changed for us

After wiring this in:

- Zero prod incidents from missing env vars (previously: ~1/quarter).
- Onboarding a new engineer is actually zero friction — clone, `cp .env.example .env`, fill in values, run. The example is trustworthy.
- PR reviews stopped including "did you add this to the example?" comments. CI handles it.

The cost was one line in `package.json`.

## Caveats

- `scan` only sees *static* reads. If you do `process.env[someDynamicKey]`, it won't find it (intentionally — that's unknowable without running your code).
- Pattern edge cases: comments containing `process.env.X` get picked up. Usually you want that. If not, exclude files with `--ignore`.
- Schemas that coerce (Zod's `z.coerce.boolean()`) have footguns: any non-empty string is `true`. For booleans from env, use `z.enum(['true','false']).transform(v => v === 'true')` or similar.

## Links

- GitHub: [env-surgeon/env-surgeon](https://github.com/env-surgeon/env-surgeon)
- npm: [`env-surgeon`](https://www.npmjs.com/package/env-surgeon)
- GitHub Action: [`env-surgeon/env-surgeon@v1`](https://github.com/marketplace/actions/env-surgeon)

If you've ever deployed a service that crashed on missing env at startup,
this is a five-minute fix. Go do it.
