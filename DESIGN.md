---
name: "Pâtiss'App"
description: "A tactile operations system for pastry shops: checkout, orders, stock, team, reporting, and AI guidance."
colors:
  atelier-terracotta: "#815431"
  terracotta-pressed: "#C08A63"
  sage-register: "#4B6450"
  sage-mist: "#CDEAD0"
  teal-context: "#2F6671"
  teal-soft: "#699EAA"
  app-canvas: "#EDE6DC"
  recessed-well: "#F5EEE4"
  raised-surface: "#FFFFFF"
  tonal-pocket: "#E0D8CE"
  ink: "#1A1C1A"
  muted-ink: "#51443C"
  working-border: "#83746B"
  border-soft: "#D5C3B8"
  danger: "#BA1A1A"
  danger-soft: "#FFDAD6"
  warning: "#C08A63"
  pending-soft: "#FEF3C7"
  info-soft: "#DBEAFE"
  success-soft: "#D1FAE5"
typography:
  display:
    fontFamily: "Manrope, Inter, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 800
    lineHeight: "40px"
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Manrope, Inter, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: "32px"
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: "26px"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: "16px"
    letterSpacing: "0.02em"
rounded:
  sm: "10px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.atelier-terracotta}"
    textColor: "{colors.raised-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 28px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.terracotta-pressed}"
    textColor: "{colors.raised-surface}"
  button-secondary:
    backgroundColor: "{colors.sage-mist}"
    textColor: "{colors.sage-register}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
  card:
    backgroundColor: "{colors.raised-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  input:
    backgroundColor: "{colors.recessed-well}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "48px"
  nav-active:
    backgroundColor: "{colors.sage-mist}"
    textColor: "{colors.sage-register}"
    rounded: "{rounded.pill}"
    padding: "12px 20px"
  badge-status:
    backgroundColor: "{colors.tonal-pocket}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
---

# Design System: Pâtiss'App

## 1. Overview

**Creative North Star: "The Artisan Workbench"**

Pâtiss'App is a working interface for pastry teams, not a showroom. It should feel like a clean, reliable counter surface: warm enough to belong in a bakery, structured enough for a rush hour, and tactile enough for tablets and kiosks. The system favors restrained color, clear hierarchy, and familiar product patterns over ornamental pastry tropes.

The visual language is product-first. Cards, buttons, inputs, filters, payment states, stock alerts, and offline badges must help users act faster. Decoration is only allowed when it improves orientation or feedback. The interface must not become a generic SaaS dashboard, a cold supermarket POS, a marketing landing page, or a beige-on-beige bakery moodboard.

**Key Characteristics:**
- Dense but breathable layouts for repeated operational use.
- Warm terracotta and sage accents used sparingly for action and state.
- Touch-first controls with stable 48px interaction targets.
- Tonal surfaces over heavy borders; shadows respond to state rather than decorating every panel.
- Clear, non-color-only status language for orders, stock, payments, network, and subscriptions.

## 2. Colors

The palette is a restrained operational palette: warm clay for primary actions, sage for navigation and success, teal for secondary context, and strong ink on layered neutral surfaces.

### Primary
- **Atelier Terracotta**: The primary action color. Use it for the most important action on a screen, active emphasis, and brand-bearing moments such as the app mark.
- **Pressed Terracotta**: The hover or elevated companion to primary actions. Use it to indicate feedback, not as a second default accent.

### Secondary
- **Sage Register**: The operational selection color. Use it for active navigation, success-leaning states, and calm confirmation surfaces.
- **Sage Mist**: A soft selected background for active navigation pills, secondary buttons, and positive low-emphasis states.

### Tertiary
- **Teal Context**: A quiet contextual accent for analytics, AI, and informational panels where terracotta would overstate urgency.
- **Teal Soft**: A supporting tint for charts, secondary status markers, and calm data accents.

### Neutral
- **App Canvas**: The main application background. It should sit behind operational surfaces and never carry long blocks of low-contrast text.
- **Recessed Well**: Input and toolbar surface, used when a control should feel inset and ready for action.
- **Raised Surface**: Cards, modals, drawers, and high-priority panels.
- **Tonal Pocket**: Subtle grouped areas, inactive chips, or low-emphasis content wells.
- **Ink**: Primary text. Use this for all body text and numbers.
- **Muted Ink**: Secondary text, helper copy, icons, and subdued metadata. It must remain readable.
- **Working Border** and **Border Soft**: Dividers, separators, and controlled outlines. Never use thick colored side stripes.
- **Danger** and **Danger Soft**: Destructive actions, validation errors, and critical stock/payment warnings.

### Named Rules

**The Workbench Rule.** Most screens should be neutral surfaces with one clear action color. If more than two saturated accents compete in one viewport, the surface is losing its operational focus.

**The Status Must Speak Rule.** Color may reinforce status, but labels, icons, or numbers must carry the meaning. A red chip without text is not acceptable.

## 3. Typography

**Display Font:** Manrope with Inter/system fallback
**Body Font:** Inter with system fallback
**Label/Mono Font:** Inter; no separate mono style is currently part of the product language.

**Character:** Manrope gives page headings and major totals a confident, rounded presence; Inter keeps forms, tables, buttons, and operational text crisp. This is a product UI, so the type scale stays compact and fixed rather than fluid.

### Hierarchy
- **Display** (800, 32px, 40px): Reserved for admin/report headers and major empty states. Do not use inside compact cards.
- **Headline** (800, 24px, 32px): Primary page titles, modal titles, and section headers that introduce a workflow.
- **Title** (700, 18px, 26px): Card titles, drawer headings, grouped controls, and form section titles.
- **Body** (500, 14px, 20px): Default UI text, table copy, helper copy, labels near controls, and most dashboard text.
- **Label** (700, 12px, 16px, 0.02em): Pills, table labels, compact metadata, and status tags. Avoid wide uppercase tracking as a default pattern.

### Named Rules

**The Counter Distance Rule.** Text must stay readable on a tablet at arm's length. Muted copy cannot drop below accessible contrast just because the surface is warm.

**The No-Shouting Dashboard Rule.** Product screens do not use hero-scale typography. Big type is for totals and page identity, not every panel.

## 4. Elevation

The system uses a hybrid of tonal layering and restrained shadow. Surfaces are differentiated first by background color and spacing; shadows appear when a control is lifted, hovered, modal, or truly layered above the work surface.

### Shadow Vocabulary
- **Resting Lift** (`0 2px 8px rgba(45,27,14,0.08), 0 1px 3px rgba(45,27,14,0.06)`): Default raised surfaces such as operational cards.
- **Interactive Lift** (`0 8px 24px rgba(45,27,14,0.12), 0 4px 8px rgba(45,27,14,0.08)`): Hovered cards, active primary buttons, and touch feedback.
- **Modal Lift** (`0 16px 48px rgba(45,27,14,0.16), 0 8px 16px rgba(45,27,14,0.10)`): Dialogs, drawers, and blocking overlays.

### Named Rules

**The Shadow Earns Its Place Rule.** Do not pair a visible border and a wide soft shadow on the same ordinary card. Pick tonal separation, a thin border, or a shadow based on the job.

**The Modal Is Above Work Rule.** Modals and drawers may use blur and deeper shadow because they interrupt the workflow. Normal cards may not imitate modal depth.

## 5. Components

### Buttons

Buttons are tactile, clear, and predictable. They use icons when the action benefits from quick recognition.

- **Shape:** Full pill for primary and secondary action buttons (`9999px`), smaller rounded corners for compact icon controls (`10px` to `12px`).
- **Primary:** Atelier Terracotta background, white text, 48px height, horizontal padding of 28px. Use one primary action per focused workflow.
- **Hover / Focus:** Hover may shift to Pressed Terracotta and lift slightly. Focus must use a visible ring with enough contrast. Active press may scale slightly, but never enough to move layout.
- **Secondary:** Sage Mist background with Sage Register text for safe secondary actions.
- **Destructive:** Danger background or Danger Soft surface with explicit destructive text. Never rely on red icon-only buttons without a label or tooltip.

### Chips

Chips communicate filter, status, and compact metadata.

- **Style:** Full pill, 4px to 10px padding, 12px label text.
- **State:** Selected chips use Sage Mist/Sage Register or a semantic tint. Unselected chips use Tonal Pocket or Raised Surface with a thin soft border.
- **Status:** Pending, production, ready, completed, cancelled, success, and alert states must include text and, where space allows, an icon.

### Cards / Containers

Cards are for meaningful groups, not decoration.

- **Corner Style:** Operational cards should usually use 16px. Avoid 24px+ except large modal surfaces or profile media.
- **Background:** Raised Surface for primary cards, Recessed Well or Tonal Pocket for nested controls.
- **Shadow Strategy:** Resting Lift only for surfaces that need clear separation. Flat tonal panels are preferred in dense workflows.
- **Border:** Thin soft borders may define data tables, alerts, and admin panels. Never use thick colored side accents.
- **Internal Padding:** 16px for dense tool panels, 24px for normal cards, 32px only for major summaries or modals.

### Inputs / Fields

Inputs are built for fast entry and touch use.

- **Style:** Recessed Well background, 48px minimum height, 12px radius, 14px body text, strong Ink text.
- **Focus:** Raised Surface background plus visible focus ring or border. Focus must be obvious on tablet and keyboard.
- **Error / Disabled:** Error fields use Danger border and a soft danger background; disabled fields lower opacity but keep readable text.
- **Touch Inputs:** Numeric and phone controls should preserve stable width, shrink long values inside the field, and open purpose-built pads instead of relying on cramped native keyboard behavior.

### Navigation

Navigation should orient, not compete.

- **Desktop:** Left sidebar with icon + label rows, active pill state, compact app identity, and role-aware destinations.
- **Mobile:** Bottom navigation exposes the highest-frequency destinations and hides overflow behind a drawer.
- **Active State:** Sage tint plus stronger text/icon weight. Do not rely on a colored stripe alone.
- **Network State:** Online, unstable, and offline indicators need visible copy or tooltip where space allows.

### Modals / Drawers

Modals support focused entry and confirmation.

- **Shape:** 16px to 20px for production modals; 24px only when the modal is spacious and central.
- **Overlay:** Use a controlled dark overlay; blur is allowed only for blocking context.
- **Actions:** Primary and cancel actions should be visually distinct and stable on mobile. Destructive confirmations must name the consequence.

### Signature Component: POS Work Surface

The checkout surface combines cart lines, payment methods, customer context, ready orders, and offline behavior. It should remain visually quieter than the actions inside it: compact rows, stable quantities, large enough +/- controls, and immediate feedback for optimistic changes.

## 6. Do's and Don'ts

### Do:

- **Do** prioritize checkout, order creation, stock review, and payment completion over decorative layout.
- **Do** keep primary actions in Atelier Terracotta and reserve that color for the action the user is most likely to take next.
- **Do** use Sage Register for active navigation, success-leaning states, and low-stress confirmations.
- **Do** maintain 48px minimum touch targets for primary buttons, inputs, payment controls, and kiosk actions.
- **Do** include text with every critical status: offline, stock alert, unpaid order, cancelled order, expired subscription, failed sync.
- **Do** use Inter for dense UI copy and Manrope only for meaningful headings or large values.
- **Do** keep product screens compact, scannable, and stable across tablet and mobile.

### Don't:

- **Don't** turn the app into a generic SaaS dashboard with decorative card grids and low-value metrics.
- **Don't** make it feel like a cold supermarket POS with harsh black, hard edges, and no craft context.
- **Don't** create a marketing landing-page mood inside authenticated workflows.
- **Don't** use low-contrast beige-on-beige text; warmth is not an excuse for poor readability.
- **Don't** over-round ordinary cards past 20px or combine a visible border with a wide decorative shadow.
- **Don't** use gradient text, thick side-stripe borders, decorative blur/glassmorphism, or repeated all-caps eyebrows as scaffolding.
- **Don't** animate page loads for spectacle. Motion must communicate state: hover, focus, opening, closing, loading, sync, or confirmation.
