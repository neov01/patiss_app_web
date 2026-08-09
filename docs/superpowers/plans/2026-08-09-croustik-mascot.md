# Mascotte Croustik — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic `Bot`/`Sparkles` icons in the Comptable IA chat with a named mascot ("Croustik") rendered as 4 state-specific images (greeting, thinking, happy, alert).

**Architecture:** A small pure domain module (`src/lib/domain/mascot.ts`) maps chat state to an image path under `public/mascot/`. `AIAssistant.tsx` consumes that module and swaps its two icon locations (header avatar, message-bubble avatar) for `next/image` elements. No new network calls, no new state beyond one boolean flag (`isError`) already implied by the existing catch block.

**Tech Stack:** Next.js (`next/image`), React, TypeScript, Vitest (existing `src/lib/domain/*.test.ts` convention).

## Global Constraints

- Exactly 4 mascot states: `greeting`, `thinking`, `happy`, `alert`. No others.
- Assets live at `public/mascot/croustik-{greeting,thinking,happy,alert}.png` — PNG, transparent background, square, ~512×512px source.
- No animation, no budget-alert content detection, no hero image on `/ai-assistant`, no rename of the page title `"Comptable IA"`.
- Chat header label changes from `"Assistant Compta-Gâteau"` to `"Croustik"`.
- Code style matches the existing file: no semicolons, single quotes, 2-space indentation (see [src/lib/domain/phone.ts](../../../src/lib/domain/phone.ts) and [AIAssistant.tsx](../../../src/components/dashboard/AIAssistant.tsx)).
- Test command: `npx vitest run <path>` (project-wide: `npm run test`).

---

## ⚠️ Task 1 is manual and cannot be automated by a coding subagent

Task 1 requires actually generating image files with an image-generation tool. A subagent with only `Read/Write/Edit/Bash` cannot produce these — a human (or an agent with image-generation access) must run the prompts and save the outputs. Do not let a coding subagent invent placeholder images and call the task done; if it cannot generate real assets, it must stop and report that Task 1 needs a human.

### Task 1: Generate and place the 4 mascot assets

**Files:**
- Create: `public/mascot/croustik-greeting.png`
- Create: `public/mascot/croustik-thinking.png`
- Create: `public/mascot/croustik-happy.png`
- Create: `public/mascot/croustik-alert.png`

**Interfaces:**
- Produces: 4 PNG files at the exact paths above, square (equal width/height), with an alpha channel (transparent background). Later tasks reference these paths as string literals — the filenames must match exactly (lowercase, hyphenated, `.png`).

- [x] **Step 1: Generate the 4 images**

Use an image-generation tool with these 4 prompts (from [docs/superpowers/specs/2026-08-09-croustik-mascot-design.md](2026-08-09-croustik-mascot-design.md)). Each prompt is self-contained — include the full style block every time so the 4 outputs read as one consistent character.

Common style block (prepend to every prompt):
```
A cute cartoon mascot character shaped like a golden-brown croissant,
personifying a friendly AI accountant. Round black-rimmed glasses, a
white chef's toque on top, small white pastry-dough gloves for hands and
feet, rosy pink cheeks, simple friendly dot eyes, flat vector cartoon
illustration style with clean bold outlines, warm orange/gold and white
color palette only, soft flat shading (no gradients, no photorealism),
centered composition, transparent background, no text, no logos, no
watermark, no other characters, square framing.
```

1. `croustik-greeting.png`: `[style block] Pose: standing, one gloved hand raised in a friendly wave, warm open smile, welcoming and approachable expression, looking directly at viewer.`
2. `croustik-thinking.png`: `[style block] Pose: one gloved hand near the chin in a thinking gesture, eyebrows slightly raised, eyes looking upward or to the side, thoughtful and focused expression, as if calculating something.`
3. `croustik-happy.png`: `[style block] Pose: both gloved hands giving an enthusiastic thumbs-up (or one thumbs-up if two hands reads awkwardly), big joyful smile, eyes slightly closed with happiness, small sparkle accents optional, celebratory and confident expression.`
4. `croustik-alert.png`: `[style block] Pose: one gloved hand touching the side of the face or head in a worried gesture, slightly furrowed brow, wide concerned eyes, mouth in a small worried line, apologetic and concerned expression (not scared or sad, just mildly concerned).`

- [x] **Step 2: Save the outputs**

Save each generated image at its exact path:
```bash
mkdir -p "public/mascot"
# place the 4 downloaded/exported files at:
#   public/mascot/croustik-greeting.png
#   public/mascot/croustik-thinking.png
#   public/mascot/croustik-happy.png
#   public/mascot/croustik-alert.png
```

- [x] **Step 3: Verify format and dimensions**

Note: `sips -g hasAlpha` only reports whether a file has an alpha *channel*, not
whether any pixel is actually transparent. A fully-opaque RGBA file (every pixel
alpha=255, with a checkerboard baked into the RGB content) passes that check
while looking broken in the UI — this exact bug shipped once already in this
project and was only caught by a human re-generating the assets after a later
manual review. Use a Python-based check that actually inspects the alpha
channel's pixel values instead (Pillow may need a one-off venv):

```bash
python3 -c "
from PIL import Image
import sys

files = ['public/mascot/croustik-greeting.png', 'public/mascot/croustik-thinking.png', 'public/mascot/croustik-happy.png', 'public/mascot/croustik-alert.png']
ok = True
for path in files:
    img = Image.open(path)
    if img.mode != 'RGBA':
        print(f'{path}: FAIL — no alpha channel (mode={img.mode})')
        ok = False
        continue
    w, h = img.size
    if w != h:
        print(f'{path}: FAIL — not square ({w}x{h})')
        ok = False
    alpha = img.getchannel('A')
    hist = alpha.histogram()
    total = w * h
    transparent_pct = 100 * hist[0] / total
    if transparent_pct < 10:
        print(f'{path}: FAIL — only {transparent_pct:.1f}% fully transparent pixels, likely opaque/fake-transparent')
        ok = False
    else:
        print(f'{path}: OK — {w}x{h}, {transparent_pct:.1f}% fully transparent')
sys.exit(0 if ok else 1)
"
```
Expected: every file prints `OK` with a meaningful (not near-zero) transparent-pixel percentage, and the script exits 0. If any file is missing or fails this check, regenerate it before continuing — later tasks assume these files exist and are genuinely transparent PNGs.

- [x] **Step 4: Visual consistency check**

Open all 4 files side by side (Finder Quick Look or an image viewer) and confirm they read as the *same* character: same glasses shape, same toque, same body color/proportions, only pose and expression differ. If one pose looks like a different character, regenerate it with the same style block before moving on.

- [x] **Step 5: Commit**

```bash
git add public/mascot/croustik-greeting.png public/mascot/croustik-thinking.png public/mascot/croustik-happy.png public/mascot/croustik-alert.png
git commit -m "assets: add Croustik mascot images (greeting, thinking, happy, alert)"
```

---

### Task 2: Mascot state-to-image mapping module (TDD)

**Files:**
- Create: `src/lib/domain/mascot.ts`
- Test: `src/lib/domain/mascot.test.ts`

**Interfaces:**
- Consumes: nothing (pure module, no dependency on Task 1's files existing on disk — this is pure string logic).
- Produces:
  - `export type MascotState = 'greeting' | 'thinking' | 'happy' | 'alert'`
  - `export function getMascotImagePath(state: MascotState): string` — returns `/mascot/croustik-${state}.png`
  - `export function getMessageMascotState(item: { loading?: boolean; isError?: boolean }): MascotState` — `loading` wins over `isError`; used by Task 4.

- [x] **Step 1: Write the failing test**

Create `src/lib/domain/mascot.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getMascotImagePath, getMessageMascotState } from './mascot'

describe('mascot domain helpers', () => {
  it('builds the public image path for each state', () => {
    expect(getMascotImagePath('greeting')).toBe('/mascot/croustik-greeting.png')
    expect(getMascotImagePath('thinking')).toBe('/mascot/croustik-thinking.png')
    expect(getMascotImagePath('happy')).toBe('/mascot/croustik-happy.png')
    expect(getMascotImagePath('alert')).toBe('/mascot/croustik-alert.png')
  })

  it('shows thinking while a message is loading, even if also flagged as an error', () => {
    expect(getMessageMascotState({ loading: true, isError: true })).toBe('thinking')
  })

  it('shows alert for a completed message flagged as an error', () => {
    expect(getMessageMascotState({ loading: false, isError: true })).toBe('alert')
  })

  it('shows happy for a normal completed message', () => {
    expect(getMessageMascotState({ loading: false, isError: false })).toBe('happy')
    expect(getMessageMascotState({})).toBe('happy')
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/domain/mascot.test.ts`
Expected: FAIL — `Cannot find module './mascot'` (or similar), because `mascot.ts` doesn't exist yet.

- [x] **Step 3: Write minimal implementation**

Create `src/lib/domain/mascot.ts`:

```ts
export type MascotState = 'greeting' | 'thinking' | 'happy' | 'alert'

export function getMascotImagePath(state: MascotState): string {
  return `/mascot/croustik-${state}.png`
}

export function getMessageMascotState(item: { loading?: boolean; isError?: boolean }): MascotState {
  if (item.loading) return 'thinking'
  if (item.isError) return 'alert'
  return 'happy'
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/domain/mascot.test.ts`
Expected: PASS — 4 tests passing.

- [x] **Step 5: Commit**

```bash
git add src/lib/domain/mascot.ts src/lib/domain/mascot.test.ts
git commit -m "feat: add mascot state-to-image mapping for Comptable IA chat"
```

---

### Task 3: Header avatar — swap icon for Croustik, rename label

**Files:**
- Modify: `src/components/dashboard/AIAssistant.tsx:4` (imports)
- Modify: `src/components/dashboard/AIAssistant.tsx:149-159` (header avatar + title)

**Interfaces:**
- Consumes: `getMascotImagePath` from `@/lib/domain/mascot` (Task 2). `Image` from `next/image` (existing project dependency — see [src/components/catalogue/ProductModal.tsx](../../../src/components/catalogue/ProductModal.tsx) for the established usage pattern).
- Produces: no new exports — this is a leaf UI change.

- [x] **Step 1: Update imports**

In `src/components/dashboard/AIAssistant.tsx`, the current import block is:

```ts
'use client'

import { useState, useEffect, useRef } from 'react'
import { Bot, Send, Loader2, Sparkles, MoreVertical, Trash2 } from 'lucide-react'
import DOMPurify from 'dompurify'
```

Replace it with (adds `next/image` and the mascot module; `Sparkles` is dropped here — `Bot` stays for now, it's still used elsewhere until Task 4):

```ts
'use client'

import { useState, useEffect, useRef } from 'react'
import { Bot, Send, Loader2, MoreVertical, Trash2 } from 'lucide-react'
import Image from 'next/image'
import DOMPurify from 'dompurify'
import { getMascotImagePath } from '@/lib/domain/mascot'
```

- [x] **Step 2: Replace the header avatar and title**

Find this block (inside the header's first `<div>` with `gap: '20px'`):

```tsx
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{
                        width: '48px', height: '48px', borderRadius: '16px',
                        background: 'rgba(255,255,255,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 8px 16px rgba(0,0,0,0.1)'
                    }}>
                        <Sparkles size={24} color="white" />
                    </div>
                    <div>
                        <h4 style={{ margin: 0, color: 'white', fontWeight: 900, fontFamily: 'var(--font-display)', fontSize: '1.15rem', letterSpacing: '-0.02em' }}>Assistant Compta-Gâteau</h4>
```

Replace with:

```tsx
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{
                        width: '48px', height: '48px', borderRadius: '16px',
                        background: 'rgba(255,255,255,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 8px 16px rgba(0,0,0,0.1)',
                        overflow: 'hidden'
                    }}>
                        <Image src={getMascotImagePath('greeting')} alt="Croustik" width={40} height={40} />
                    </div>
                    <div>
                        <h4 style={{ margin: 0, color: 'white', fontWeight: 900, fontFamily: 'var(--font-display)', fontSize: '1.15rem', letterSpacing: '-0.02em' }}>Croustik</h4>
```

Leave the rest of that block (the "Intelligence Artisanale" status line) untouched.

- [x] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. (If `Sparkles` or `Bot` show as unused-import errors, that's expected only for `Sparkles` at this point — `Bot` is still used by the message bubbles until Task 4. If `Sparkles` is reported unused, confirm it was fully removed from the import in Step 1.)

- [x] **Step 4: Manual visual check**

Run the dev server and open both places this component renders:
```bash
npm run dev
```
- Dashboard (`/dashboard`): the chat card's header should show the Croustik greeting image instead of the sparkle icon, with the title "Croustik".
- `/ai-assistant`: same check.

- [x] **Step 5: Commit**

```bash
git add src/components/dashboard/AIAssistant.tsx
git commit -m "feat: show Croustik mascot and name in Comptable IA chat header"
```

---

### Task 4: Message-bubble avatars — per-state mascot, drop the Bot icon

**Files:**
- Modify: `src/components/dashboard/AIAssistant.tsx:4` (imports — drop `Bot`, add `getMessageMascotState`)
- Modify: `src/components/dashboard/AIAssistant.tsx:24` (history state type — add `isError?: boolean`)
- Modify: `src/components/dashboard/AIAssistant.tsx:112-122` (catch block — set `isError: true`)
- Modify: `src/components/dashboard/AIAssistant.tsx:203-212` (empty-state bubble avatar)
- Modify: `src/components/dashboard/AIAssistant.tsx:227-230` (per-message bubble avatar)

**Interfaces:**
- Consumes: `getMascotImagePath`, `getMessageMascotState` from `@/lib/domain/mascot` (Task 2).
- Produces: no new exports.

- [x] **Step 1: Finish the import cleanup**

The import block from Task 3 currently reads:

```ts
import { Bot, Send, Loader2, MoreVertical, Trash2 } from 'lucide-react'
import Image from 'next/image'
import DOMPurify from 'dompurify'
import { getMascotImagePath } from '@/lib/domain/mascot'
```

Replace with (drops `Bot`, which is no longer used anywhere in the file after this task; adds `getMessageMascotState`):

```ts
import { Send, Loader2, MoreVertical, Trash2 } from 'lucide-react'
import Image from 'next/image'
import DOMPurify from 'dompurify'
import { getMascotImagePath, getMessageMascotState } from '@/lib/domain/mascot'
```

- [x] **Step 2: Track error state on history entries**

Find:

```ts
    const [history, setHistory] = useState<Array<{ q: string; a: string; loading?: boolean }>>([])
```

Replace with:

```ts
    const [history, setHistory] = useState<Array<{ q: string; a: string; loading?: boolean; isError?: boolean }>>([])
```

- [x] **Step 3: Set `isError` in the connection-failure branch**

Find:

```ts
        } catch {
            setHistory(prev => {
                const updated = prev.map((item, idx) =>
                    idx === prev.length - 1
                        ? { ...item, a: "Erreur de connexion à l'assistant IA.", loading: false }
                        : item
                )
                persistHistory(updated)
                return updated
            })
        }
```

Replace with:

```ts
        } catch {
            setHistory(prev => {
                const updated = prev.map((item, idx) =>
                    idx === prev.length - 1
                        ? { ...item, a: "Erreur de connexion à l'assistant IA.", loading: false, isError: true }
                        : item
                )
                persistHistory(updated)
                return updated
            })
        }
```

- [x] **Step 4: Replace the empty-state greeting bubble's icon**

Find (note: this is the bubble shown when `history.length === 0`, distinguishable from the loop version by the surrounding `{history.length === 0 && (` line just above it):

```tsx
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-surface-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Bot size={16} color="var(--color-primary)" />
                        </div>
                        <div style={{ background: 'var(--color-surface-container-low)', padding: '16px', borderRadius: '0 16px 16px 16px', fontSize: '0.875rem', color: 'var(--color-on-surface)' }}>
                            Bonjour ! J&apos;ai analysé vos données. Souhaitez-vous un récapitulatif ou une prévision ?
                        </div>
```

Replace with:

```tsx
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-surface-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                            <Image src={getMascotImagePath('greeting')} alt="Croustik" width={28} height={28} />
                        </div>
                        <div style={{ background: 'var(--color-surface-container-low)', padding: '16px', borderRadius: '0 16px 16px 16px', fontSize: '0.875rem', color: 'var(--color-on-surface)' }}>
                            Bonjour ! J&apos;ai analysé vos données. Souhaitez-vous un récapitulatif ou une prévision ?
                        </div>
```

- [x] **Step 5: Replace the per-message loop bubble's icon**

Find (inside `history.map(...)`, distinguishable by the preceding `alignSelf: 'flex-start'` line):

```tsx
                        <div style={{ display: 'flex', gap: '12px', maxWidth: '85%', alignSelf: 'flex-start' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-surface-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Bot size={16} color="var(--color-primary)" />
                            </div>
```

Replace with:

```tsx
                        <div style={{ display: 'flex', gap: '12px', maxWidth: '85%', alignSelf: 'flex-start' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-surface-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                                <Image src={getMascotImagePath(getMessageMascotState(item))} alt="Croustik" width={28} height={28} />
                            </div>
```

- [x] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (no unused-import errors — `Bot` is fully removed, `Loader2` is still used by the "Analyse en cours…" spinner further down).

- [x] **Step 7: Manual visual check of all 4 states**

With `npm run dev` running, on both `/dashboard` and `/ai-assistant`:
- **greeting**: clear the chat (menu → "Effacer la conversation") — the empty-state bubble shows the greeting pose.
- **thinking**: type a question and submit — while the response streams in, the bubble briefly shows the thinking pose (may be quick; watch closely or throttle network in devtools).
- **happy**: after a normal response finishes, its bubble shows the happy pose.
- **alert**: temporarily stop the dev server's ability to reach `/api/ai` (e.g. go offline, or block the request in devtools' Network tab) and submit a question — the resulting bubble ("Erreur de connexion à l'assistant IA.") shows the alert pose.

- [x] **Step 8: Commit**

```bash
git add src/components/dashboard/AIAssistant.tsx
git commit -m "feat: show per-state Croustik mascot in chat message bubbles"
```

---

### Task 5: Final regression pass

**Files:** none (verification only).

**Interfaces:** none.

- [x] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all tests pass, including the 4 new `mascot.test.ts` cases.

- [x] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no errors.

- [x] **Step 3: Confirm no stray changes**

Run: `git status --short`
Expected: clean (everything from Tasks 1–4 already committed). If anything is unstaged, review it before deciding whether to commit or discard.

- [ ] **Step 4: Re-run the 4-state manual check from Task 4 Step 7 one more time end-to-end**

This time without stopping between states, to confirm the transitions (greeting → thinking → happy, and separately → alert) feel coherent as a single conversation flow, on both `/dashboard` and `/ai-assistant`.
