# Croustik Floating Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent floating Croustik button, visible on every page of the app, that opens an anchored chat panel reusing the existing `AIAssistant` component.

**Architecture:** One new client component, `FloatingMascot`, renders a fixed circular button (closed state) and, when clicked, an anchored panel wrapping the existing `AIAssistant` component (open state). It is mounted once in the shared `(pâtisserie)` layout so it appears on every page without per-page wiring. No changes to `AIAssistant.tsx` itself — conversation sharing comes for free from its existing `localStorage` persistence.

**Tech Stack:** Next.js (`next/image`), React (`useState`), styled-jsx (already used in `AIAssistant.tsx` for the same kind of scoped CSS), TypeScript.

## Global Constraints

- Closed button: 56×56px circle, fixed position, right edge 20px from viewport edge.
- Desktop (≥768px): button `bottom: 20px`; panel `bottom: 84px`.
- Mobile (<768px, same breakpoint used by `DashboardSidebar`'s `sidebar-mobile-bar`): button `bottom: 90px`; panel `bottom: 154px` — must clear the 70px-tall fixed mobile bottom nav bar.
- z-index `45` for both button and panel — above page content and the mobile nav bar (`zIndex: 40`), below the app's fullscreen overlays (mobile drawer and session overlays, `zIndex: 50`/`9999`).
- Button always shows the `greeting` mascot pose; pulsing animation only while closed (stops while panel is open).
- Panel width `min(360px, calc(100vw - 40px))`; no forced height — `AIAssistant` keeps its own internal `500px` height.
- No changes to `AIAssistant.tsx`. No new pure/testable logic beyond what already exists in `src/lib/domain/mascot.ts`.
- Code style matches the existing files: no semicolons, single quotes, 4-space indentation inside JSX (see [AIAssistant.tsx](../../../src/components/dashboard/AIAssistant.tsx)), styled-jsx for scoped CSS (see the same file's `<style jsx>` block).
- Existing dashboard card and `/ai-assistant` page are untouched — this is purely additive.

---

### Task 1: `FloatingMascot` component

**Files:**
- Create: `src/components/dashboard/FloatingMascot.tsx`

**Interfaces:**
- Consumes: `getMascotImagePath` from `@/lib/domain/mascot` (`getMascotImagePath('greeting')` → `/mascot/croustik-greeting.png`, already used the same way in `AIAssistant.tsx`). `AIAssistant` default export from `./AIAssistant` — props `{ currency: string, organizationId: string, userRole?: string }`.
- Produces: `export default function FloatingMascot({ currency, organizationId, userRole }: { currency: string, organizationId: string, userRole?: string })` — a self-contained component with no exported state; Task 2 mounts it with these three props.

- [ ] **Step 1: Create the component**

Create `src/components/dashboard/FloatingMascot.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Image from 'next/image'
import AIAssistant from './AIAssistant'
import { getMascotImagePath } from '@/lib/domain/mascot'

interface Props {
    currency: string
    organizationId: string
    userRole?: string
}

export default function FloatingMascot({ currency, organizationId, userRole }: Props) {
    const [open, setOpen] = useState(false)

    return (
        <>
            <button
                onClick={() => setOpen(v => !v)}
                aria-label="Ouvrir Croustik, l'assistant comptable IA"
                className="floating-mascot-button"
                style={{
                    position: 'fixed',
                    right: '20px',
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    background: 'var(--color-primary)',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    zIndex: 45,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                    padding: 0,
                    animation: open ? 'none' : 'floating-mascot-pulse 2s ease-in-out infinite',
                }}
            >
                <Image src={getMascotImagePath('greeting')} alt="" width={44} height={44} />
            </button>

            {open && (
                <div
                    className="floating-mascot-panel"
                    style={{
                        position: 'fixed',
                        right: '20px',
                        width: 'min(360px, calc(100vw - 40px))',
                        zIndex: 45,
                        borderRadius: '16px',
                        overflow: 'hidden',
                        boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
                    }}
                >
                    <AIAssistant currency={currency} organizationId={organizationId} userRole={userRole} />
                </div>
            )}

            <style jsx>{`
                .floating-mascot-button {
                    bottom: 20px;
                }
                .floating-mascot-panel {
                    bottom: 84px;
                }
                @keyframes floating-mascot-pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.08); }
                }
                @media (max-width: 767px) {
                    .floating-mascot-button {
                        bottom: 90px;
                    }
                    .floating-mascot-panel {
                        bottom: 154px;
                    }
                }
            `}</style>
        </>
    )
}
```

Notes on choices already made (don't relitigate these):
- `alt=""` on the button's image: the `<button>` already carries `aria-label`, so the image is decorative to assistive tech — this matches the `alt=""` pattern already used on `AIAssistant.tsx`'s decorative bubble avatars.
- The pulsing animation is a plain CSS `@keyframes` (`transform: scale`), not a library — this is the one deliberate animation exception approved for this feature; nothing else in the app should gain animation as a side effect of this task.
- `animation: open ? 'none' : ...` stops the pulse while the panel is open, per spec.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/FloatingMascot.tsx
git commit -m "feat: add FloatingMascot component with closed/open states"
```

---

### Task 2: Mount `FloatingMascot` in the shared layout

**Files:**
- Modify: `src/app/(pâtisserie)/layout.tsx`

**Interfaces:**
- Consumes: `FloatingMascot` default export from Task 1 (`{ currency: string, organizationId: string, userRole?: string }`).
- Produces: nothing new — this is the final leaf wiring, no later task depends on it.

- [ ] **Step 1: Add the import**

In `src/app/(pâtisserie)/layout.tsx`, the current import block is:

```ts
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { verifyKioskToken } from '@/lib/kiosk-token'
import DashboardSidebar from '@/components/layout/DashboardSidebar'
import AutoLockProvider from '@/components/auth/AutoLockProvider'
import { checkSubscriptionStatus } from '@/lib/utils/subscription'
import { getOpenSession } from '@/lib/actions/sessions'
import SessionMaster from '@/components/layout/SessionMaster'
import RealtimeSync from '@/components/shared/RealtimeSync'
import { CurrencyProvider } from '@/providers/CurrencyProvider'

import NetworkStatusBar from '@/components/layout/NetworkWrapper'
import OfflineProvider from '@/components/providers/OfflineProvider'
```

Add one import, after the `CurrencyProvider` import:

```ts
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { verifyKioskToken } from '@/lib/kiosk-token'
import DashboardSidebar from '@/components/layout/DashboardSidebar'
import AutoLockProvider from '@/components/auth/AutoLockProvider'
import { checkSubscriptionStatus } from '@/lib/utils/subscription'
import { getOpenSession } from '@/lib/actions/sessions'
import SessionMaster from '@/components/layout/SessionMaster'
import RealtimeSync from '@/components/shared/RealtimeSync'
import { CurrencyProvider } from '@/providers/CurrencyProvider'
import FloatingMascot from '@/components/dashboard/FloatingMascot'

import NetworkStatusBar from '@/components/layout/NetworkWrapper'
import OfflineProvider from '@/components/providers/OfflineProvider'
```

- [ ] **Step 2: Mount the component**

Find the end of the flex row that wraps `DashboardSidebar` and the main content column:

```tsx
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100dvh', overflow: 'hidden' }}>
                        <NetworkStatusBar />
                        <main style={{ 
                            flex: 1, 
                            minWidth: 0, 
                            padding: '24px', 
                            paddingTop: isExpired ? '60px' : '24px',
                            paddingBottom: '120px',
                            overflowY: 'auto' 
                        }}>
                            <SessionMaster 
                                initialSession={openSession} 
                                role={displayProfile.role_slug}
                            >
                                {children}
                            </SessionMaster>
                        </main>
                    </div>
                </div>
            </AutoLockProvider>
```

Replace with (adds `<FloatingMascot />` as a sibling of the content column, still inside the outer flex row, right before that row's closing `</div>`):

```tsx
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100dvh', overflow: 'hidden' }}>
                        <NetworkStatusBar />
                        <main style={{ 
                            flex: 1, 
                            minWidth: 0, 
                            padding: '24px', 
                            paddingTop: isExpired ? '60px' : '24px',
                            paddingBottom: '120px',
                            overflowY: 'auto' 
                        }}>
                            <SessionMaster 
                                initialSession={openSession} 
                                role={displayProfile.role_slug}
                            >
                                {children}
                            </SessionMaster>
                        </main>
                    </div>
                    <FloatingMascot
                        currency={currency}
                        organizationId={typedDisplayProfile.organization_id!}
                        userRole={typedDisplayProfile.role_slug}
                    />
                </div>
            </AutoLockProvider>
```

`currency` and `typedDisplayProfile` are already in scope at this point in the file (`currency` is computed a few lines earlier as `organization?.currency_symbol || ''`, `typedDisplayProfile` is the cast `displayProfile as DashboardProfileContext` used just above for `AutoLockProvider`) — no new variables needed.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(pâtisserie)/layout.tsx"
git commit -m "feat: mount FloatingMascot in the shared pâtisserie layout"
```

---

### Task 3: Manual verification across pages and breakpoints

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all existing tests still pass (this feature adds no new automated tests, per the spec's Tests section — `open` is a trivial local boolean with no pure logic to unit test). The pre-existing unrelated `e2e/commandes.spec.ts` Playwright-in-Vitest failure (present before this feature) is not a regression from this work.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Visual check on desktop width, 3 different pages**

With the dev server running, at a desktop viewport (≥768px), visit `/dashboard`, `/caisse`, and `/inventaire`:
- The floating button is visible in the bottom-right corner on all three pages, showing Croustik in the `greeting` pose, gently pulsing.
- Clicking it opens the panel anchored just above the button; the button stays visible and clicking it again closes the panel.
- The panel behaves exactly like the existing chat (same header, same quick questions, same input) since it's the same `AIAssistant` component.

- [ ] **Step 4: Verify shared conversation**

Open the floating panel on `/caisse`, send a message, wait for the response, then navigate to `/ai-assistant`. Confirm the same conversation (including the message just sent) appears in the full-page chat — this confirms the shared `localStorage` key is working as expected, with no code specific to sharing (it's inherent to reusing `AIAssistant` unmodified).

- [ ] **Step 5: Visual check on mobile width**

Resize to a mobile viewport (<768px) on any page with the mobile bottom nav bar visible. Confirm the floating button sits above the nav bar with a visible gap (not overlapping it), and that opening the panel doesn't visually collide with the nav bar either.

- [ ] **Step 6: Confirm no stray changes**

Run: `git status --short`
Expected: clean (everything from Tasks 1–2 already committed).
