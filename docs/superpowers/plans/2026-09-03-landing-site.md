# Landing Site (`apps/landing`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `barklog.gg` serves a marketing page plus Terms and Privacy, from an nginx container published like the existing three images.

**Architecture:** A static Astro 7 site styled with Tailwind 4, built to plain HTML/CSS/JS and copied into `nginxinc/nginx-unprivileged`. Its own Dockerfile with the repository root as build context, a service in `compose.yaml`, and a fourth publish step in `images.yml`. The build emits no inline `<style>` or `<script>`, which is what allows a Content-Security-Policy with no `'unsafe-inline'`.

**Tech Stack:** Astro 7.2.10, Tailwind CSS 4.3.3 via `@tailwindcss/vite`, Motion One, nginx, vitest.

**Spec:** `docs/superpowers/specs/2026-09-03-landing-site-design.md`

## Global Constraints

- **`build.inlineStylesheets: "never"`.** Astro's default `"auto"` inlines stylesheets under ~4KB into a `<style>` tag, which alone would force `style-src 'unsafe-inline'`. This is load-bearing, not cosmetic.
- **No `is:inline` scripts, no `<ViewTransitions />`, no `prefetch`, no JSON-LD.** All emit inline script, with the same consequence for `script-src`.
- **Every nginx `location` block must `include` the security-headers snippet.** `add_header` does not inherit into a block that declares its own.
- **No third-party requests at runtime.** Fonts are self-hosted. No analytics, no CDNs, no embeds. The Privacy policy asserts this.
- **Copy voice:** second person, present tense, concrete over abstract. Banned: *seamlessly*, *effortlessly*, *powerful yet simple*, *revolutionize*, *elevate*, *unlock*, *supercharge*, *game-changer*, and exclamation marks.
- **There is no dog companion.** No streaks, no scoring, no pet mechanic exists in the app. The dog is the mark. Copy must not imply a feature.
- **Free tier is ten *active* slots** — `waiting` or `playing` only. Completing or abandoning returns the slot. From `FREE_ACTIVE_SLOTS` and `slotDelta` in `packages/contracts/src/subscription.ts`.
- **Operator:** Volodymyr Chornonoh, individual developer, Ukraine. **Contact:** `chernonog.vova@gmail.com`. **Governing law:** Ukraine.
- Versions: `astro@^7.2.10`, `tailwindcss@^4.3.3`, `@tailwindcss/vite@^4.3.3`, `eslint-plugin-astro@^1.7.0` (v2+ peers eslint ≥10; this repo is on 9).

---

### Task 1: Scaffold the app, and guard the CSP invariants

**Files:**
- Create: `apps/landing/package.json`, `astro.config.mjs`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`
- Create: `apps/landing/src/styles/global.css`, `src/config.ts`, `src/layouts/Base.astro`, `src/pages/index.astro`, `src/pages/404.astro`
- Create: `apps/landing/test/setup/build.ts`, `apps/landing/test/output.test.ts`
- Create: `packages/eslint-config/astro.js`
- Modify: `packages/eslint-config/package.json`, `pnpm-workspace.yaml`, `.dockerignore`

**Interfaces:**
- Produces:
  - `APP_STORE_URL: string`, `CONTACT_EMAIL: string` from `apps/landing/src/config.ts`
  - `Base.astro` accepting props `{ title: string; description: string }`
  - `@repo/eslint-config/astro` exporting `config`
  - A built `apps/landing/dist/` with no inline `<style>` or inline `<script>`

- [ ] **Step 1: Create the package manifest**

`apps/landing/package.json`:

```json
{
  "name": "landing",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "test": "vitest run",
    "lint": "eslint . --max-warnings 0",
    "check-types": "astro check"
  },
  "dependencies": {
    "astro": "^7.2.10"
  },
  "devDependencies": {
    "@astrojs/check": "^0.9.10",
    "@repo/eslint-config": "workspace:*",
    "@repo/typescript-config": "workspace:*",
    "@tailwindcss/vite": "^4.3.3",
    "eslint": "^9.39.5",
    "eslint-plugin-astro": "^1.7.0",
    "motion": "^13.2.0",
    "tailwindcss": "^4.3.3",
    "typescript": "~6.0.3",
    "vitest": "^4.1.11"
  }
}
```

`sharp` is an optional dependency of `astro` itself (`^0.35.4`), so it is not listed here — but it must be allowed to build, which step 3 handles.

- [ ] **Step 2: Create the Astro config**

`apps/landing/astro.config.mjs`:

```js
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://barklog.gg",
  output: "static",
  build: {
    // NOT the default of "auto", which inlines stylesheets under ~4KB into a
    // <style> tag. That alone would force style-src 'unsafe-inline' and gut
    // the CSP in nginx/snippets/security-headers.conf. test/output.test.ts
    // fails if this regresses.
    inlineStylesheets: "never",
  },
  vite: { plugins: [tailwindcss()] },
});
```

Note there is no `@astrojs/tailwind` integration: that package peers on `astro ^3 || ^4 || ^5` and `tailwindcss ^3`, so it cannot be used here. Tailwind 4 is a Vite plugin.

- [ ] **Step 3: Allow the native builds**

In `pnpm-workspace.yaml`, add to `allowBuilds`:

```yaml
  # Tailwind 4's native engine and Astro's image pipeline. Both have native
  # postinstall steps; leaving either undecided makes a fresh
  # `pnpm install --frozen-lockfile` exit 1, which fails CI.
  '@tailwindcss/oxide': true
  sharp: true
```

- [ ] **Step 4: Create the tsconfig and design tokens**

`apps/landing/tsconfig.json`:

```json
{
  "extends": ["@repo/typescript-config/base.json", "astro/tsconfigs/strict"],
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

`apps/landing/src/styles/global.css`:

```css
@import "tailwindcss";

/* Tailwind 4 has no config file — this block is the design system. The two
   colours match the app: #0B1A3C is the splash background from app.json,
   #208AEF is Brand.tint from apps/mobile/src/theme.ts. */
@theme {
  --color-ground: #0b1a3c;
  --color-ground-raised: #12244d;
  --color-ink: #f4f7fb;
  --color-ink-muted: #9fb2d0;
  --color-accent: #208aef;
  --color-accent-bright: #4aa6ff;

  --font-display: "Barklog Display", ui-sans-serif, system-ui, sans-serif;
  --font-body: "Barklog Text", ui-sans-serif, system-ui, sans-serif;
}
```

The two `--font-*` families are placeholders for the faces chosen in Task 3, where the `@font-face` rules are added. Until then they fall through to the system stack, which is a correct intermediate state.

`apps/landing/src/config.ts`:

```ts
// TODO: replace with the real listing URL once the app is on the App Store.
// Referenced by the hero and the footer, so this is the only line to change.
export const APP_STORE_URL = "https://apps.apple.com/app/barklog/id0000000000";

export const CONTACT_EMAIL = "chernonog.vova@gmail.com";
```

- [ ] **Step 5: Create the base layout and two pages**

`apps/landing/src/layouts/Base.astro`:

```astro
---
import "../styles/global.css";

interface Props {
  title: string;
  description: string;
}

const { title, description } = Astro.props;
---

<!doctype html>
<html lang="en" class="bg-ground text-ink">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={new URL(Astro.url.pathname, Astro.site)} />
  </head>
  <body class="font-body antialiased">
    <slot />
  </body>
</html>
```

`apps/landing/src/pages/index.astro` — a placeholder that Task 3 replaces:

```astro
---
import Base from "../layouts/Base.astro";
---

<Base title="Barklog" description="A backlog tracker for the games you keep meaning to finish.">
  <main class="mx-auto max-w-3xl px-6 py-24">
    <h1 class="font-display text-5xl font-bold">Barklog</h1>
  </main>
</Base>
```

`apps/landing/src/pages/404.astro`:

```astro
---
import Base from "../layouts/Base.astro";
---

<Base title="Not found — Barklog" description="That page does not exist.">
  <main class="mx-auto max-w-3xl px-6 py-24">
    <h1 class="font-display text-4xl font-bold">That page does not exist.</h1>
    <p class="mt-4 text-ink-muted">
      <a class="text-accent underline underline-offset-4" href="/">Back to the start</a>
    </p>
  </main>
</Base>
```

- [ ] **Step 6: Write the failing output guard**

`apps/landing/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/setup/build.ts"],
    // An Astro production build, not a unit test.
    testTimeout: 30_000,
  },
});
```

`apps/landing/test/setup/build.ts`:

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * The CSP guarantees this suite asserts are properties of the built output,
 * not of the source, so the suite builds for real rather than mocking one.
 */
export async function setup(): Promise<void> {
  await run("pnpm", ["exec", "astro", "build"], { cwd: process.cwd() });
}
```

`apps/landing/test/output.test.ts`:

```ts
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";

const DIST = path.resolve(import.meta.dirname, "../dist");

async function htmlFiles(dir: string = DIST): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return htmlFiles(full);

      return entry.name.endsWith(".html") ? [full] : [];
    }),
  );

  return found.flat();
}

/** A <script> with no src= and a non-empty body — what 'unsafe-inline' would be for. */
const INLINE_SCRIPT = /<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/i;
const INLINE_STYLE = /<style[^>]*>[\s\S]*?<\/style>/i;

test("the build produced pages", async () => {
  expect(await htmlFiles()).not.toHaveLength(0);
});

test("no page carries an inline <style>", async () => {
  for (const file of await htmlFiles()) {
    const html = await readFile(file, "utf8");

    expect(
      INLINE_STYLE.test(html),
      `${path.relative(DIST, file)} has an inline <style>. Check build.inlineStylesheets in astro.config.mjs — an inline style forces style-src 'unsafe-inline'.`,
    ).toBe(false);
  }
});

test("no page carries an inline <script>", async () => {
  for (const file of await htmlFiles()) {
    const html = await readFile(file, "utf8");

    expect(
      INLINE_SCRIPT.test(html),
      `${path.relative(DIST, file)} has an inline <script>. Use a bundled module — an inline script forces script-src 'unsafe-inline'.`,
    ).toBe(false);
  }
});

test("no page requests a third-party origin", async () => {
  for (const file of await htmlFiles()) {
    const html = await readFile(file, "utf8");
    const external = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)]
      .map((match) => match[1])
      // Anchors to the App Store and mailto: links are navigation, not a
      // subresource request. Only src/href on link and script elements matter.
      .filter((url) => !url.startsWith("https://apps.apple.com/"));

    expect(external, `${path.relative(DIST, file)} loads a third-party resource`).toEqual([]);
  }
});
```

The last test will need refining once the real page exists — a bare `href` to an external site in prose is fine. If it produces false positives in Task 3, narrow the regex to `<link ... href=` and `<script ... src=` rather than deleting the test; the claim it guards is one the Privacy policy makes.

- [ ] **Step 7: Install and run the tests to verify they fail**

Run: `pnpm install && pnpm --filter landing test`
Expected: FAIL — `dist` does not exist yet, or the build errors. Read the error. If it is `sharp` failing to build on this machine, that is the risk the spec flags; note it and continue, since the container build is what matters.

- [ ] **Step 8: Run the build and re-run the tests**

Run: `pnpm --filter landing build && pnpm --filter landing test`
Expected: PASS, four tests. Confirm by hand that `dist/index.html` links a stylesheet with `<link rel="stylesheet">` rather than embedding one.

- [ ] **Step 9: Add the shared Astro lint config**

`packages/eslint-config/astro.js`:

```js
import astro from "eslint-plugin-astro";

import { config as base } from "./base.js";

/**
 * Pinned to eslint-plugin-astro ^1.7.0: every release from 2.0.0 peers on
 * eslint >= 10, and this workspace is on 9. Moving to eslint 10 unlocks ^3.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [...base, ...astro.configs.recommended];
```

In `packages/eslint-config/package.json`, add to `exports`:

```json
    "./astro": "./astro.js"
```

and to `devDependencies`:

```json
    "eslint-plugin-astro": "^1.7.0"
```

`apps/landing/eslint.config.js`:

```js
import { config } from "@repo/eslint-config/astro";

export default [...config, { ignores: ["dist/**", ".astro/**"] }];
```

- [ ] **Step 10: Ignore the Astro cache in Docker builds**

In `.dockerignore`, beside the `.expo` entries:

```
.astro
**/.astro
```

- [ ] **Step 11: Verify lint and types**

Run: `pnpm --filter landing lint && pnpm --filter landing check-types`
Expected: both pass. `astro check` will warn about unused `Props` interfaces if a page has none — that is fine, but `--max-warnings 0` applies to eslint only.

- [ ] **Step 12: Commit**

```bash
git add apps/landing packages/eslint-config pnpm-workspace.yaml .dockerignore pnpm-lock.yaml
git commit -m "feat(landing): scaffold the Astro app with Tailwind 4

@astrojs/tailwind is not used: it peers on astro ^3-^5 and tailwind ^3.
Tailwind 4 is a Vite plugin configured in CSS, so @theme in global.css is
the design system rather than a config file.

build.inlineStylesheets is set to never. Astro's default inlines small
stylesheets into a <style> tag, which alone would force style-src
'unsafe-inline' and gut the CSP the nginx image will serve. The test suite
builds for real and fails if an inline style or script appears.

eslint-plugin-astro is pinned to ^1.7.0 — v2 onward peers on eslint 10,
and this workspace is on 9."
```

---

### Task 2: Terms and Privacy

**Files:**
- Create: `apps/landing/src/layouts/Legal.astro`, `src/pages/terms.astro`, `src/pages/privacy.astro`
- Test: `apps/landing/test/legal.test.ts`

**Interfaces:**
- Consumes: `Base.astro`, `CONTACT_EMAIL` (Task 1).
- Produces: `Legal.astro` accepting `{ title: string; description: string; updated: string }`; routes `/terms/` and `/privacy/`.

- [ ] **Step 1: Write the failing test**

`apps/landing/test/legal.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";

const DIST = path.resolve(import.meta.dirname, "../dist");

const read = (route: string) => readFile(path.join(DIST, route, "index.html"), "utf8");

test("the legal routes are built as directories", async () => {
  await expect(read("terms")).resolves.toContain("<h1");
  await expect(read("privacy")).resolves.toContain("<h1");
});

test("the legal pages ship no JavaScript", async () => {
  for (const route of ["terms", "privacy"]) {
    expect(await read(route)).not.toMatch(/<script/i);
  }
});

test("the terms name the operator, the law, and Apple's role", async () => {
  const html = await read("terms");

  expect(html).toContain("Volodymyr Chornonoh");
  expect(html).toContain("chernonog.vova@gmail.com");
  expect(html).toMatch(/Ukrain/);
  // The single most consequential sentence: deleting an account does not
  // cancel the subscription.
  expect(html).toMatch(/does not cancel/i);
});

test("the privacy policy names every processor", async () => {
  const html = await read("privacy");

  for (const processor of ["Clerk", "RevenueCat", "Apple", "Anthropic", "PlanetScale", "IGDB"]) {
    expect(html, `privacy policy does not mention ${processor}`).toContain(processor);
  }
});

test("the privacy policy states the two strong claims", async () => {
  const html = await read("privacy");

  expect(html).toMatch(/no cookies/i);
  // Only the video's title and channel name reach Anthropic.
  expect(html).toMatch(/title and channel name/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter landing test legal`
Expected: FAIL — `dist/terms/index.html` does not exist.

- [ ] **Step 3: Create the legal layout**

`apps/landing/src/layouts/Legal.astro`:

```astro
---
import Base from "./Base.astro";

interface Props {
  title: string;
  description: string;
  updated: string;
}

const { title, description, updated } = Astro.props;
---

<Base title={`${title} — Barklog`} description={description}>
  <main
    class="mx-auto max-w-[68ch] px-6 py-16 font-sans text-[15px] leading-relaxed
           [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold
           [&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mt-1
           [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-4"
  >
    <p><a href="/">← Barklog</a></p>
    <h1 class="mt-8 text-3xl font-bold">{title}</h1>
    <p class="mt-2 text-ink-muted">Last updated {updated}</p>
    <slot />
  </main>
</Base>
```

Deliberately plain: system font stack via `font-sans`, one measure, no motion, no script.

- [ ] **Step 4: Write the Terms**

`apps/landing/src/pages/terms.astro`:

```astro
---
import Legal from "../layouts/Legal.astro";
import { CONTACT_EMAIL } from "../config";
---

<Legal
  title="Terms & Conditions"
  description="The terms you agree to when you use Barklog."
  updated="3 September 2026"
>
  <p>
    Barklog is made and run by Volodymyr Chornonoh, an individual developer based in Ukraine.
    You can reach me at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. By using the
    app you agree to what follows.
  </p>

  <h2>Using the app</h2>
  <p>
    You get a personal, non-transferable licence to use Barklog on devices you own. You keep
    whatever you put into it — your backlog is yours.
  </p>
  <p>
    Don't try to break the service, pull data out of it in bulk, or use it to do something
    illegal. If you do, I may close your account.
  </p>

  <h2>Accounts</h2>
  <p>
    You need an account, handled by Clerk. You have to be at least 13. Keep your sign-in
    details to yourself — anything done through your account is treated as done by you.
  </p>

  <h2>Barklog Premium</h2>
  <p>
    The free tier holds ten unfinished games at a time. Premium removes that cap. It's an
    auto-renewing subscription sold through the App Store, which means Apple handles the
    payment, the renewal, and the receipt — not me.
  </p>
  <p>
    Your subscription renews until you cancel it, and you cancel it in your Apple subscription
    settings. Refunds are Apple's to give; I can't issue one.
  </p>
  <p>
    <strong>
      Deleting your Barklog account does not cancel your subscription.
    </strong>
    Only Apple can do that. If you're subscribed and you delete your account, cancel through
    Apple as well or you'll keep being billed.
  </p>
  <p>
    If the price changes, the change applies to renewals after you've been told, never
    retroactively.
  </p>

  <h2>Game data</h2>
  <p>
    Every cover, release date, platform and summary in Barklog comes from
    <a href="https://www.igdb.com" rel="noreferrer">IGDB</a>, a games database maintained by its
    community. It's theirs, not mine, and it's occasionally wrong or incomplete — Barklog
    passes it along as it is.
  </p>

  <h2>What I don't promise</h2>
  <p>
    Barklog is provided as it is. I don't promise it will always be available, always be
    correct, or never lose data, and I'm not liable for what follows from using it, as far as
    Ukrainian law allows. Keep your own record of anything you'd be upset to lose.
  </p>

  <h2>Ending things</h2>
  <p>
    You can delete your account at any time from the profile screen in the app. I may suspend
    or close an account that breaks these terms. If Barklog shuts down, I'll give notice in the
    app before it happens.
  </p>

  <h2>Changes and law</h2>
  <p>
    I'll update these terms when the app changes, and the date at the top will tell you when.
    Carrying on using Barklog after a change means you accept it.
  </p>
  <p>
    These terms are governed by the law of Ukraine, and Ukrainian courts have jurisdiction over
    any dispute.
  </p>
</Legal>
```

- [ ] **Step 5: Write the Privacy policy**

`apps/landing/src/pages/privacy.astro`:

```astro
---
import Legal from "../layouts/Legal.astro";
import { CONTACT_EMAIL } from "../config";
---

<Legal
  title="Privacy policy"
  description="What Barklog collects, who it shares it with, and how to get rid of it."
  updated="3 September 2026"
>
  <p>
    Barklog is made and run by Volodymyr Chornonoh, an individual developer based in Ukraine.
    This page says what the app collects, who else sees it, and how to delete it. Questions go
    to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
  </p>

  <h2>This website</h2>
  <p>
    This site sets no cookies, runs no analytics, and makes no third-party requests. The fonts
    are served from this server. Nothing here tries to work out who you are. The web server
    keeps ordinary access logs — IP address, page, timestamp — for a few weeks, to spot abuse.
  </p>

  <h2>What the app collects</h2>
  <ul>
    <li>Your account identifier, and whatever you gave Clerk to sign in with.</li>
    <li>Your backlog: which games you added, their status, and any rating you gave them.</li>
    <li>
      Your subscription status — the product, whether it's a trial, and when it renews or
      expires. Never your card details, which Barklog never sees.
    </li>
  </ul>
  <p>
    That's the lot. No location, no contacts, no photos, no advertising identifier, no
    behavioural tracking.
  </p>

  <h2>Sharing a video</h2>
  <p>
    When you share a YouTube or TikTok video to Barklog, the app fetches that video's public
    title and channel name and sends <em>only the title and channel name</em> to Anthropic,
    which guesses which game it's about. The video itself never leaves the platform it's on,
    and nothing identifying you is included in the request.
  </p>

  <h2>Who else handles your data</h2>
  <ul>
    <li><strong>Clerk</strong> — accounts and sign-in.</li>
    <li><strong>RevenueCat</strong> — subscription state.</li>
    <li><strong>Apple</strong> — the purchase itself, and billing.</li>
    <li><strong>Anthropic</strong> — the video title and channel name described above.</li>
    <li><strong>PlanetScale</strong> — the database your backlog lives in.</li>
    <li><strong>IGDB and Twitch</strong> — game data. They receive nothing about you.</li>
    <li><strong>Hetzner</strong> — the server the API and this site run on.</li>
  </ul>
  <p>
    Nobody's data is sold, and nobody gets it for advertising.
  </p>

  <h2>How long it's kept</h2>
  <p>
    Your account and backlog stay until you delete them. Records of subscription payments are
    kept longer for accounting, with your identifier removed from them when you delete your
    account, so what remains can't be traced back to you.
  </p>

  <h2>Deleting everything</h2>
  <p>
    Open the profile screen in the app, tap your avatar, and choose to delete your account.
    That removes your account, your backlog, and your subscription record. It happens
    immediately and it can't be undone.
  </p>
  <p>
    <strong>Deleting your account does not cancel an App Store subscription.</strong>
    Cancel that in your Apple subscription settings, or you'll keep being billed.
  </p>
  <p>
    If you'd rather ask me to do it, or you want a copy of what's stored about you, email
    <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and I'll deal with it within 30 days.
  </p>

  <h2>Children</h2>
  <p>
    Barklog isn't for under-13s, and I don't knowingly keep data about them. If you think a
    child has an account, email me and I'll remove it.
  </p>

  <h2>Changes</h2>
  <p>
    If this policy changes, the date at the top changes with it, and anything significant gets
    a notice in the app.
  </p>
</Legal>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter landing build && pnpm --filter landing test legal`
Expected: PASS, five tests.

- [ ] **Step 7: Check the copy reads as human**

Invoke the `humanizer` skill against both files. Apply what it finds, but do not let it soften the two load-bearing sentences — the App Store cancellation warning and the title-and-channel-name claim must survive word for word.

Then re-run: `pnpm --filter landing test legal`

- [ ] **Step 8: Commit**

```bash
git add apps/landing/src/layouts/Legal.astro apps/landing/src/pages/terms.astro \
        apps/landing/src/pages/privacy.astro apps/landing/test/legal.test.ts
git commit -m "feat(landing): add the terms and the privacy policy

Written from what the code does rather than from a template. Two claims
are stronger than boilerplate and are asserted by tests so they cannot
rot: this site makes no third-party requests, and sharing a video sends
only the video's title and channel name to Anthropic — verifiable in
apps/api/src/share/extract.ts.

The sentence that matters most is that deleting an account does not
cancel an App Store subscription. It appears in both documents."
```

---

### Task 3: The root page

**Files:**
- Create: `apps/landing/src/components/Hero.astro`, `Feature.astro`, `Pricing.astro`, `Footer.astro`, `Screenshot.astro`
- Create: `apps/landing/src/assets/screenshots/{backlog,game,explore,share}.png`
- Create: `apps/landing/src/assets/fonts/` (chosen faces, woff2)
- Modify: `apps/landing/src/pages/index.astro`, `src/styles/global.css`
- Test: `apps/landing/test/home.test.ts`

**Interfaces:**
- Consumes: `Base.astro`, `APP_STORE_URL`, `CONTACT_EMAIL` (Task 1).
- Produces: `Feature.astro` with props `{ title: string; eyebrow: string; image: ImageMetadata; alt: string; flip?: boolean }`.

- [ ] **Step 1: Generate the screenshot placeholders**

Run from the repository root:

```bash
mkdir -p apps/landing/src/assets/screenshots
for name in backlog game explore share; do
  printf '%s' "<svg xmlns='http://www.w3.org/2000/svg' width='1290' height='2796'>
    <rect width='100%' height='100%' fill='#12244D'/>
    <text x='50%' y='50%' fill='#9FB2D0' font-family='sans-serif' font-size='72'
          text-anchor='middle'>REPLACE: ${name}</text>
  </svg>" > /tmp/${name}.svg
  pnpm --filter landing exec node -e "
    const sharp = require('sharp');
    sharp('/tmp/${name}.svg').png().toFile('src/assets/screenshots/${name}.png');
  "
done
```

If that `node -e` cannot resolve `sharp`, produce the four PNGs any other way — the only requirements are 1290×2796 and that they visibly read as placeholders.

- [ ] **Step 2: Write the failing test**

`apps/landing/test/home.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";

const home = () => readFile(path.resolve(import.meta.dirname, "../dist/index.html"), "utf8");

/** From the design's global constraints. Each is a word humans do not use here. */
const BANNED = [
  "seamlessly",
  "effortlessly",
  "powerful yet simple",
  "revolutionize",
  "elevate",
  "unlock",
  "supercharge",
  "game-changer",
];

test("the hero links to the App Store", async () => {
  expect(await home()).toContain("apps.apple.com");
});

test("the page links to the legal routes", async () => {
  const html = await home();

  expect(html).toContain('href="/terms"');
  expect(html).toContain('href="/privacy"');
});

test("the page credits IGDB", async () => {
  expect(await home()).toContain("IGDB");
});

test("the free tier is described with the real number", async () => {
  expect(await home()).toMatch(/ten unfinished games|10 unfinished games/i);
});

test("the copy avoids marketing filler", async () => {
  const text = (await home()).toLowerCase();

  for (const word of BANNED) {
    expect(text, `the copy contains "${word}"`).not.toContain(word);
  }
});

test("the copy claims no dog feature", async () => {
  // The README says "a cute dog companion keeping score". No such feature
  // exists in the app — the dog is the mark. See the spec, section 5.2.
  expect(await home()).not.toMatch(/keeping score|your companion|streak/i);
});

test("every image has alt text", async () => {
  const html = await home();

  for (const tag of html.match(/<img[^>]*>/g) ?? []) {
    expect(tag, `an <img> has no alt attribute: ${tag}`).toMatch(/\salt="/);
  }
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter landing test home`
Expected: FAIL — the placeholder index page has none of this.

- [ ] **Step 4: Pick and self-host the typefaces**

Invoke the `frontend-design` skill for the visual direction, including the type choice. Constraints it must respect:

- Two faces at most: one display, one text.
- Downloaded as woff2, Latin subset, committed to `src/assets/fonts/`. **Never linked from Google Fonts or any CDN** — Task 1's third-party test and the Privacy policy both depend on it.
- Declared with `@font-face` in `global.css`, with `font-display: swap`, and referenced from the `--font-display` / `--font-body` tokens already in `@theme`.
- Both preloaded from `Base.astro` with `<link rel="preload" as="font" type="font/woff2" crossorigin>`.

- [ ] **Step 5: Build the components and the page**

Write `Screenshot.astro` (wraps `astro:assets`' `<Image>` in a device frame), `Hero.astro`, `Feature.astro`, `Pricing.astro` and `Footer.astro`, then assemble `index.astro` in this order: Hero → backlog → explore → share → Pricing → IGDB credit → Footer.

The copy, which is the deliverable — use it verbatim:

**Hero**
> # Every game you meant to get back to.
> Barklog keeps your backlog in one place: what you're playing, what's waiting, what you finished, and what you gave up on. No spreadsheet, no shame.
>
> [Download on the App Store] · Free. Premium is optional.

**Backlog** (eyebrow "Your backlog", screenshot `backlog.png`)
> ## Four honest statuses
> Waiting, playing, completed, abandoned. Most trackers assume you'll finish everything. Barklog doesn't — abandoned is a real answer, and it's one tap away.

**Explore** (eyebrow "Explore", screenshot `explore.png`, flipped)
> ## Find the next one
> See what's popular, what's coming, and what just landed. Or search by name when you already know. Tap through to a game for its platforms, its summary, and what it's similar to.

**Share** (eyebrow "Share a video", screenshot `share.png`)
> ## Share a video, get the game
> You're watching a clip of some game you can't name. Share it to Barklog and it works out which game that is, then hands you the matches to pick from. It reads the video's title and channel name — not the video.

**Pricing**
> ## Ten at a time, free
> Barklog is free for ten unfinished games — the ones waiting and the one you're playing. Finish one, or admit you're done with it, and the spot comes back.
>
> Premium takes the cap off. That's the whole difference.

**IGDB credit**
> Game data by [IGDB](https://www.igdb.com) — covers, release dates, platforms and summaries, maintained by its community.

**Footer**
> Barklog · Made by Volodymyr Chornonoh
> [Terms](/terms) · [Privacy](/privacy) · [chernonog.vova@gmail.com](mailto:…)

Every `<Image>` needs real alt text describing the screen, not the word "screenshot".

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter landing build && pnpm --filter landing test`
Expected: PASS, all suites. If the third-party test from Task 1 now flags the IGDB anchor, narrow that regex to `<link ... href=` and `<script ... src=` as its comment instructs.

- [ ] **Step 7: Check the copy reads as human**

Invoke the `humanizer` skill over `index.astro` and the components. Re-run `pnpm --filter landing test home` afterwards — the banned-word test is the guard against it introducing filler of its own.

- [ ] **Step 8: Commit**

```bash
git add apps/landing/src apps/landing/test/home.test.ts
git commit -m "feat(landing): build the marketing page

Voice taken from the app's own copy — features/backlog/empty-states.ts
sets the register ('Games you gave up on. No judgement.'), so the page
matches it rather than inventing a marketing tone.

The pricing section states the real rule: ten unfinished games, and
finishing or abandoning one returns the spot. That last clause comes
from slotDelta and is the part most apps would leave out.

Screenshots are committed as visible placeholders. A test asserts the
copy claims no dog companion — the README implies a feature the app does
not have."
```

---

### Task 4: Motion

**Files:**
- Create: `apps/landing/src/scripts/reveal.ts`
- Modify: `apps/landing/src/layouts/Base.astro`, components from Task 3
- Test: `apps/landing/test/motion.test.ts`

**Interfaces:**
- Consumes: components from Task 3, which gain a `data-reveal` attribute.
- Produces: a bundled module that animates `[data-reveal]` elements into view once.

- [ ] **Step 1: Write the failing test**

`apps/landing/test/motion.test.ts`:

```ts
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";

const DIST = path.resolve(import.meta.dirname, "../dist");

test("the reveal script is bundled, not inline", async () => {
  const html = await readFile(path.join(DIST, "index.html"), "utf8");

  expect(html).toMatch(/<script type="module" src="\/_astro\/[^"]+\.js"><\/script>/);
});

test("the bundle honours prefers-reduced-motion", async () => {
  const assets = await readdir(path.join(DIST, "_astro"));
  const scripts = assets.filter((name) => name.endsWith(".js"));
  const sources = await Promise.all(
    scripts.map((name) => readFile(path.join(DIST, "_astro", name), "utf8")),
  );

  expect(sources.some((source) => source.includes("prefers-reduced-motion"))).toBe(true);
});

test("the legal pages still ship no script", async () => {
  for (const route of ["terms", "privacy"]) {
    const html = await readFile(path.join(DIST, route, "index.html"), "utf8");

    expect(html).not.toMatch(/<script/i);
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter landing test motion`
Expected: FAIL — no script is emitted at all.

- [ ] **Step 3: Write the reveal module**

`apps/landing/src/scripts/reveal.ts`:

```ts
import { animate } from "motion";

const DISTANCE = 16;
const DURATION = 0.24;

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const targets = document.querySelectorAll<HTMLElement>("[data-reveal]");

if (reduced) {
  // Clear the pre-animation state rather than returning early: the CSS hides
  // these until revealed, so bailing out would leave the page blank for
  // exactly the people who asked for less motion.
  for (const target of targets) target.style.opacity = "1";
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        // Once. Re-animating on scroll-up reads as a glitch, not as polish.
        observer.unobserve(entry.target);
        void animate(
          entry.target,
          { opacity: [0, 1], transform: [`translateY(${DISTANCE}px)`, "translateY(0)"] },
          { duration: DURATION, easing: [0.22, 1, 0.36, 1] },
        );
      }
    },
    { rootMargin: "0px 0px -10% 0px" },
  );

  for (const target of targets) observer.observe(target);
}
```

Consult the `emil-design-eng` skill before tuning the numbers. The rules it must not break: transform and opacity only, 150–250ms, fire once, and no element left invisible under reduced motion.

- [ ] **Step 4: Add the pre-animation state and load the module**

In `global.css`, after the `@theme` block:

```css
@media (prefers-reduced-motion: no-preference) {
  [data-reveal] {
    opacity: 0;
  }
}
```

Guarding the hidden state behind the media query means a reduced-motion visitor never depends on JavaScript running to see the page.

In `Base.astro`, above `</body>`, add a slot-controlled script so the legal pages stay script-free:

```astro
  {motion && <script>import "../scripts/reveal.ts";</script>}
```

Add `motion?: boolean` to `Props`, defaulting to `false`, and pass `motion` from `index.astro` only. A bare `<script>` in an `.astro` file is bundled by Astro into an external module — this is not an inline script, and Task 1's test confirms it.

Then add `data-reveal` to each section wrapper in the Task 3 components.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter landing build && pnpm --filter landing test`
Expected: PASS, every suite — including Task 1's inline-script guard, which is the real check that the `<script>` above got bundled.

If Task 1's inline-script guard now fails, Astro has inlined the module because it is small. Do not weaken the guard and do not add `'unsafe-inline'`. Set `build.inlineStylesheets` aside — the relevant knob is `vite.build.assetsInlineLimit: 0` in `astro.config.mjs`, which stops small assets being inlined. Add it with a comment pointing at this step, and re-run.

- [ ] **Step 6: Verify it by eye**

Run: `pnpm --filter landing dev`, open the page, and scroll. Then enable Reduce Motion (macOS: System Settings → Accessibility → Display) and reload. Confirm every section is visible immediately with no animation and nothing stuck at zero opacity.

- [ ] **Step 7: Commit**

```bash
git add apps/landing/src apps/landing/test/motion.test.ts
git commit -m "feat(landing): reveal sections on scroll

Transform and opacity only, 240ms, fires once and unobserves. Re-animating
on scroll-up reads as a glitch rather than as polish.

The hidden pre-animation state lives behind prefers-reduced-motion:
no-preference, so a reduced-motion visitor never depends on JavaScript
having run to see the page — and the script clears opacity directly
rather than returning early, which would have left the page blank for
exactly the people who asked for less motion.

The legal pages pass motion={false} and ship no script at all."
```

---

### Task 5: The container

**Files:**
- Create: `apps/landing/Dockerfile`, `apps/landing/nginx/default.conf`, `apps/landing/nginx/snippets/security-headers.conf`
- Test: `apps/landing/test/nginx.test.ts`

**Interfaces:**
- Consumes: `apps/landing/dist/` from Task 1's build.
- Produces: image target `landing`, listening on 8080, serving `/healthz`.

- [ ] **Step 1: Write the failing test**

`apps/landing/test/nginx.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";

const NGINX = path.resolve(import.meta.dirname, "../nginx");

const conf = () => readFile(path.join(NGINX, "default.conf"), "utf8");
const snippet = () => readFile(path.join(NGINX, "snippets/security-headers.conf"), "utf8");

/**
 * The whole point of this suite. nginx's add_header does NOT inherit into a
 * location block that declares any add_header of its own, so the block that
 * sets immutable caching on hashed assets would silently serve them with no
 * security headers at all. The site would look fine and be unprotected.
 */
test("every location block includes the security headers", async () => {
  const text = await conf();
  const blocks = text.split(/\blocation\b/).slice(1);

  expect(blocks.length, "no location blocks found — is default.conf right?").toBeGreaterThan(0);

  for (const block of blocks) {
    const body = block.slice(0, block.indexOf("}"));

    expect(body, `a location block does not include security-headers.conf:\n${body}`).toContain(
      "security-headers.conf",
    );
  }
});

test("the CSP allows nothing inline and nothing third-party", async () => {
  const text = await snippet();

  expect(text).toContain("default-src 'none'");
  expect(text).not.toContain("unsafe-inline");
  expect(text).not.toContain("unsafe-eval");
  expect(text).toMatch(/script-src 'self'/);
  expect(text).toMatch(/style-src 'self'/);
});

test("HSTS is set without preload", async () => {
  const text = await snippet();

  expect(text).toContain("Strict-Transport-Security");
  // Deliberate: preload submission is effectively irreversible.
  expect(text).not.toContain("preload");
});

test("the expected headers are all present", async () => {
  const text = await snippet();

  for (const header of [
    "X-Content-Type-Options",
    "Referrer-Policy",
    "X-Frame-Options",
    "Permissions-Policy",
    "Cross-Origin-Opener-Policy",
    "Cross-Origin-Resource-Policy",
  ]) {
    expect(text, `missing ${header}`).toContain(header);
  }
});

test("the server listens unprivileged and hides its version", async () => {
  const text = await conf();

  expect(text).toContain("listen 8080");
  expect(text).toContain("server_tokens off");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter landing test nginx`
Expected: FAIL — the `nginx` directory does not exist.

- [ ] **Step 3: Write the headers snippet**

`apps/landing/nginx/snippets/security-headers.conf`:

```nginx
# Included explicitly by EVERY location block in default.conf.
#
# nginx's add_header does not inherit into a location block that declares any
# add_header of its own. The /_astro/ block sets Cache-Control, so without
# this include it would serve every script and stylesheet with no security
# headers — and nothing would look wrong. test/nginx.test.ts enforces it.

# 'none' by default, then only what the site genuinely uses. No 'unsafe-inline'
# anywhere, which is only possible because astro.config.mjs sets
# build.inlineStylesheets to "never" and the site emits no inline script.
add_header Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'; upgrade-insecure-requests" always;

# No preload: submission is effectively irreversible, and includeSubDomains
# from the apex already covers api.barklog.gg.
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
# Redundant with frame-ancestors above, kept for user agents that predate it.
add_header X-Frame-Options "DENY" always;
add_header Permissions-Policy "accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), usb=()" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Cross-Origin-Resource-Policy "same-origin" always;
```

- [ ] **Step 4: Write the server config**

`apps/landing/nginx/default.conf`:

```nginx
server {
    # 8080, not 80: nginx-unprivileged cannot bind a privileged port.
    listen 8080;
    server_name _;
    server_tokens off;

    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    # Cheap and unlogged, so the compose healthcheck costs nothing. Matches the
    # API's /healthz convention.
    location = /healthz {
        include /etc/nginx/snippets/security-headers.conf;
        access_log off;
        add_header Content-Type text/plain always;
        return 200 "ok\n";
    }

    # Content-hashed filenames, so they can never go stale.
    location /_astro/ {
        include /etc/nginx/snippets/security-headers.conf;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files $uri =404;
    }

    location / {
        include /etc/nginx/snippets/security-headers.conf;
        add_header Cache-Control "public, max-age=0, must-revalidate" always;
        # Astro builds directory-format output, so /terms is terms/index.html.
        try_files $uri $uri/index.html $uri/ =404;
    }

    error_page 404 /404.html;
    location = /404.html {
        include /etc/nginx/snippets/security-headers.conf;
        internal;
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter landing test nginx`
Expected: PASS, five tests.

- [ ] **Step 6: Write the Dockerfile**

`apps/landing/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1

# The static marketing site at barklog.gg, served by nginx.
# Design: docs/superpowers/specs/2026-09-03-landing-site-design.md
#
# Separate from the root Dockerfile on purpose: that file builds three Node
# runtime images from one shared install, and this chain shares only `base`.
#
#   docker build -f apps/landing/Dockerfile -t barklog-landing .

FROM node:24-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    TURBO_TELEMETRY_DISABLED=1 \
    DO_NOT_TRACK=1
RUN corepack enable pnpm
WORKDIR /app

# Pinned here as well as in the root package.json. Keep the two in step —
# the root Dockerfile carries the same duplication and the same warning.
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.10.11 prune landing --docker

FROM base AS deps
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY --from=pruner /app/out/full/ .
RUN pnpm exec turbo run build --filter=landing --ui=stream

# ---------------------------------------------------------------------------
# The runtime carries static files only — no node_modules reaches it, so there
# is no prod-deps stage. nginx-unprivileged rather than nginx: the stock image
# runs its master as root, and every other image in this repo runs unprivileged.
# ---------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:alpine AS landing
# From the build context, not from `builder`: this is checked-in configuration
# rather than build output, and copying it last keeps an edit to it from
# invalidating the install and build layers above.
COPY apps/landing/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY apps/landing/nginx/snippets/ /etc/nginx/snippets/
COPY --from=builder /app/apps/landing/dist/ /usr/share/nginx/html/
EXPOSE 8080
```

- [ ] **Step 7: Build the image and check the headers for real**

```bash
docker build -f apps/landing/Dockerfile -t barklog-landing .
docker run --rm -d -p 8081:8080 --name barklog-landing-test barklog-landing
sleep 2
curl -sI http://127.0.0.1:8081/ | sort
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8081/healthz
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8081/terms
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8081/nope
curl -sI http://127.0.0.1:8081/_astro/ 2>/dev/null | grep -i content-security-policy
docker rm -f barklog-landing-test
```

Expected: `/` and `/terms` are 200, `/nope` is 404, `/healthz` is 200, and every response — the `_astro` one especially — carries `Content-Security-Policy`. If the `_astro` response is missing it, the include is absent from that block and the test in step 1 was passing for the wrong reason.

If the build fails inside `sharp`, switch the `base` stage to `node:24-slim` and adjust the `RUN` lines; the spec anticipates this.

- [ ] **Step 8: Commit**

```bash
git add apps/landing/Dockerfile apps/landing/nginx apps/landing/test/nginx.test.ts
git commit -m "feat(landing): serve the site from nginx with a strict CSP

default-src 'none' with no unsafe-inline anywhere, which is only possible
because the Astro build emits no inline style or script.

Every location block includes the security-headers snippet explicitly,
and a test enforces it. nginx's add_header does not inherit into a block
that declares its own, so the immutable-cache block for hashed assets
would otherwise have served every script with no headers at all — and
nothing would have looked wrong.

HSTS without preload: submission is effectively irreversible."
```

---

### Task 6: Deploy wiring

**Files:**
- Modify: `compose.yaml`, `.github/workflows/images.yml`, `README.md`

**Interfaces:**
- Consumes: the `landing` image target from Task 5.
- Produces: `ghcr.io/chornonoh-vova/barklog-landing:${IMAGE_TAG}`, and a `landing` compose service.

- [ ] **Step 1: Add the compose service**

In `compose.yaml`, after the `worker` service and before `valkey`:

```yaml
  landing:
    image: ghcr.io/chornonoh-vova/barklog-landing:${IMAGE_TAG:-main}
    pull_policy: always # see migrate's comment above
    restart: unless-stopped
    # No environment, and no depends_on: it is static files. It does not read
    # the database, the cache, or anything else in this project, so a failed
    # migration must not keep the marketing site down.
    expose:
      - "8080"
    networks:
      - default
      - dokploy-network
    healthcheck:
      test: ["CMD-SHELL", "wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 5s
```

Add `barklog.gg` to this service in Dokploy's Domains tab, exactly as `api.barklog.gg` is attached to `api`. No `ports:`, as everywhere else in the file.

- [ ] **Step 2: Add the publish step**

In `.github/workflows/images.yml`, after the `meta-worker` build-push step, append:

```yaml
      # Last in the sequence, and deliberately so: nothing depends on the
      # landing image, so a failure here leaves the site at the previous
      # commit — the harmless direction, unlike the migrate-first ordering
      # reasoned about above.
      - id: meta-landing
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository_owner }}/barklog-landing
          tags: |
            type=ref,event=branch
            type=sha,format=short
            type=raw,value=latest,enable={{is_default_branch}}
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/landing/Dockerfile
          target: landing
          platforms: linux/amd64
          push: true
          tags: ${{ steps.meta-landing.outputs.tags }}
          labels: ${{ steps.meta-landing.outputs.labels }}
          cache-from: type=gha,scope=barklog
          cache-to: type=gha,scope=barklog,mode=max
          provenance: false
```

- [ ] **Step 3: Verify the whole workspace passes CI's gate**

Run from the repository root:

```bash
pnpm install --frozen-lockfile && pnpm build && pnpm lint && pnpm check-types && pnpm test
```

Expected: all pass. This is exactly the `verify` job. A failure in `pnpm install --frozen-lockfile` means an `allowBuilds` entry is missing from `pnpm-workspace.yaml`.

- [ ] **Step 4: Document the workspace**

In `README.md`, add a row to the "What's inside" table, keeping the column alignment:

```markdown
| `apps/landing`               | Astro static marketing site + legal pages, served by nginx at `barklog.gg`                      |
```

And a short section near the deployment notes:

```markdown
### Landing site

`apps/landing` builds to static files served by nginx. `barklog.gg` is attached
to the `landing` service in Dokploy's Domains tab, the same way
`api.barklog.gg` is attached to `api`.

It has its own `Dockerfile` rather than a target in the root one: that file
builds three Node runtime images from a shared install, and this chain shares
only the base stage.

Two constraints are load-bearing and have tests behind them. `astro.config.mjs`
sets `build.inlineStylesheets: "never"`, without which Astro inlines small
stylesheets and forces `style-src 'unsafe-inline'`. And every nginx `location`
block includes `snippets/security-headers.conf` explicitly, because
`add_header` does not inherit into a block that declares its own.

```sh
pnpm --filter landing dev     # http://localhost:4321
pnpm --filter landing build
```
```

- [ ] **Step 5: Commit**

```bash
git add compose.yaml .github/workflows/images.yml README.md
git commit -m "feat(landing): publish and deploy the landing image

A fourth publish step, last in the sequence: nothing depends on this
image, so a failure leaves the site at the previous commit rather than
leaving code running against a schema it does not match.

The compose service has no environment and no depends_on. It is static
files, so a failed migration must not take the marketing site down with
it."
```

---

## Manual verification

- [ ] Replace the four placeholder screenshots in `src/assets/screenshots/` with real captures at 1290×2796.
- [ ] Replace `APP_STORE_URL` in `src/config.ts` with the real listing URL.
- [ ] Read `/terms` and `/privacy` end to end against the shipped app and confirm every claim is still true — particularly the deletion paragraph, which depends on the account-deletion plan having shipped first.
- [ ] Point `barklog.gg` at the `landing` service in Dokploy and confirm the certificate is issued.
- [ ] Run the live URL through securityheaders.com and confirm an A grade with no `unsafe-inline` reported.
- [ ] Check the page on a phone at 375px wide: no horizontal scroll, tap targets at least 44px.
- [ ] Confirm `https://barklog.gg/problems/...` returns the 404 page rather than an nginx default — the API's `PROBLEM_BASE` points there and a `/problems/*` route is a recorded follow-up.

---

## Self-Review

**Spec coverage:**

| Spec section                                          | Task                       |
| ----------------------------------------------------- | -------------------------- |
| §2 Astro 7, Tailwind 4 via `@tailwindcss/vite`        | Task 1 Steps 1, 2          |
| §2 no `@astrojs/tailwind`                             | Task 1 Step 2 (comment)    |
| §3 file layout                                        | Tasks 1–5                  |
| §3.1 `inlineStylesheets: "never"`                     | Task 1 Step 2, guarded S6  |
| §3.1 no inline script / view transitions / prefetch   | Task 1 Step 6, Task 4 S5   |
| §3.1 `allowBuilds` for oxide and sharp                | Task 1 Step 3              |
| §3.1 sharp on alpine                                  | Task 5 Step 7 (fallback)   |
| §4 tokens in `@theme`, self-hosted fonts              | Task 1 Step 4, Task 3 S4   |
| §4.1 motion rules, reduced-motion                     | Task 4 Steps 3, 4, 6       |
| §5 page order                                         | Task 3 Step 5              |
| §5.1 screenshot slots and placeholders                | Task 3 Step 1              |
| §5.2 voice, banned words, no dog feature, real slots  | Task 3 Steps 5, 7; tests   |
| §6.1 Terms contents                                   | Task 2 Step 4              |
| §6.2 Privacy contents, both strong claims             | Task 2 Step 5, tests S1    |
| §7 CSP and the header set                             | Task 5 Step 3              |
| §7 HSTS without preload                               | Task 5 Steps 1, 3          |
| §7.1 `add_header` inheritance trap                    | Task 5 Steps 1, 4          |
| §8 nginx routing, caching, gzip, `/healthz`           | Task 5 Step 4              |
| §9 Dockerfile stages                                  | Task 5 Step 6              |
| §10 compose service                                   | Task 6 Step 1              |
| §11 CI publish step, eslint config, pinned plugin     | Task 6 Step 2, Task 1 S9   |
| §12 follow-ups                                        | Manual verification        |

No gaps. The spec's file layout names a `Reveal` component; the plan uses a
`data-reveal` attribute driven by one module instead, which is the same
behaviour with one fewer wrapper.

**Placeholder scan:** No `TBD`, no "similar to Task N", no "add error
handling". The legal copy and the marketing copy are written out in full,
because in this plan the copy *is* the deliverable. Two deliberately deferred
values are marked and have manual-verification entries: `APP_STORE_URL` and the
four screenshots.

**Type consistency:** `Base.astro`'s props are `{ title, description }` in Task
1 and gain `motion?: boolean` in Task 4 Step 4, which is stated there rather
than assumed. `Legal.astro`'s `{ title, description, updated }` matches its two
call sites in Task 2. `APP_STORE_URL` and `CONTACT_EMAIL` keep their names from
Task 1's `config.ts` through Tasks 2 and 3. `security-headers.conf` is spelled
identically in the snippet's path, all four `include` directives, the Dockerfile
`COPY`, and the test. Port 8080 matches across `listen`, `EXPOSE`, the compose
`expose:` and the healthcheck URL.

**Two risks the executor is told how to handle rather than left to discover:**
`sharp` failing on musl (Task 5 Step 7 → switch the base to `node:24-slim`),
and Astro inlining the small reveal module (Task 4 Step 5 →
`vite.build.assetsInlineLimit: 0`, never `'unsafe-inline'`).
