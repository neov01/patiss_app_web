---
name: Pâtiss'App
colors:
  surface: "#EDE6DC"
  surface-dim: "#D8D0C6"
  surface-bright: "#F5EEE4"
  surface-container-lowest: "#FFFFFF"
  surface-container-low: "#F5EEE4"
  surface-container: "#EDE6DC"
  surface-container-high: "#E5DDD3"
  surface-container-highest: "#DDD5CB"
  on-surface: "#2D1B0E"
  on-surface-variant: "#9C8070"
  inverse-surface: "#2D1B0E"
  inverse-on-surface: "#FDF8F3"
  outline: "#F0E8E0"
  outline-variant: "#9C8070"
  surface-tint: "#C4836A"
  primary: "#C4836A"
  on-primary: "#FFFFFF"
  primary-container: "#FDE8E0"
  on-primary-container: "#6B3F2A"
  inverse-primary: "#FDE8E0"
  secondary: "#C78A4A"
  on-secondary: "#FFFFFF"
  secondary-container: "#FEF3C7"
  on-secondary-container: "#92400E"
  tertiary: "#9CB8A0"
  on-tertiary: "#FFFFFF"
  tertiary-container: "#D1FAE5"
  on-tertiary-container: "#065F46"
  error: "#D94F38"
  on-error: "#FFFFFF"
  error-container: "#FEE2E2"
  on-error-container: "#991B1B"
  primary-fixed: "#E8B4A0"
  primary-fixed-dim: "#C4836A"
  on-primary-fixed: "#2D1B0E"
  on-primary-fixed-variant: "#6B3F2A"
  secondary-fixed: "#F5DDB0"
  secondary-fixed-dim: "#C78A4A"
  on-secondary-fixed: "#2D1B0E"
  on-secondary-fixed-variant: "#6B3F2A"
  tertiary-fixed: "#D1FAE5"
  tertiary-fixed-dim: "#9CB8A0"
  on-tertiary-fixed: "#065F46"
  on-tertiary-fixed-variant: "#7A9E7E"
  background: "#EDE6DC"
  on-background: "#2D1B0E"
  surface-variant: "#FDE8E0"
typography:
  display:
    fontFamily: Inter
    fontSize: 44px
    fontWeight: "800"
    lineHeight: 52px
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: "800"
    lineHeight: 36px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: "700"
    lineHeight: 32px
  title-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: "700"
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: "400"
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: "500"
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: "600"
    lineHeight: 20px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: "600"
    lineHeight: 16px
rounded:
  sm: 8px
  DEFAULT: 12px
  md: 12px
  lg: 16px
  xl: 24px
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
  margin: 24px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  button-primary-hover:
    backgroundColor: "{colors.primary-fixed-dim}"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  button-secondary-hover:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "{colors.primary}"
  card-profile:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "{spacing.lg}"
  card-stat:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  input-field:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  list-item:
    backgroundColor: transparent
    padding: "{spacing.sm}"
    rounded: "{rounded.md}"
  list-item-hover:
    backgroundColor: "{colors.surface-container-high}"
  badge-status:
    backgroundColor: "{colors.surface-container-high}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs}"
---

## Brand & Style
The design system for Pâtiss'App evokes the warmth, craft, and premium quality of a high-end French bakery or pastry shop ("pâtisserie"). The brand personality is artisanal, inviting, yet highly professional and efficient.

The chosen style is **Artisanal Premium** with a focus on tactile ergonomics and clean organization. It utilizes a warm, appetizing color palette and generous whitespace to create a welcoming environment that reduces cognitive load for bakery staff during busy shifts. The interface avoids cold, clinical aesthetics in favor of soft gradients, delicate borders, and warm shadows to reflect the sensory pleasure of baking.

## Colors
The palette is rooted in the rich, organic colors of pastry making—creams, baked crusts, caramel, and berry tones.

- **Cream & Surface:** The foundational backgrounds (`--color-bg`, `#FDF8F3`) evoke vanilla cream or lightly toasted flour, providing a soft, easy-on-the-eyes canvas. True white (`#FFFFFF`) is reserved for foreground cards to ensure high contrast and a clean "plate" for content.
- **Primary (Rose & Caramel):** Used for primary actions, active states, and brand highlights. A signature gradient combining dark rose (`#C4836A`) and caramel (`#C78A4A`) is frequently used for key calls to action (like the primary button) to create a sense of depth and richness.
- **Neutrals & Text:** Deep, rich brown (`#2D1B0E`) is used for text instead of stark black, maintaining the warm tonal harmony while ensuring excellent legibility. Muted brown (`#9C8070`) serves secondary text and subtle icons.
- **Status Colors:** Functional colors are carefully selected to remain harmonious but distinct. Sage green (`#4C9E6A`) signals success or fresh stock, warm amber/caramel (`#E6A817`) indicates pending items or warnings, and a baked red (`#D94F38`) highlights errors or critical stock shortages.

## Typography
This design system utilizes **Inter** as its primary typeface. As a highly versatile and legible geometric sans-serif, Inter provides the necessary clarity and performance for a data-dense management dashboard while its clean lines contrast beautifully with the warm, artisanal color palette.

- **Headlines:** Heavy weights (Bold 700, ExtraBold 800) are used to establish a strong, confident hierarchy. The contrast between heavy headlines and lighter body text creates a dynamic, modern feel.
- **Body & Controls:** Medium (500) and Regular (400) weights ensure readability for data tables, lists, and input fields.
- **Labels (Microcopy):** Uppercase styling with slight letter spacing (`0.05em`) is used for small labels, table headers, and form field titles to create a structured, "ticket-like" aesthetic common in hospitality POS systems.

## Layout & Spacing
The layout is designed for clarity and rapid scanning, essential in a fast-paced retail or production environment.

- **Cards & Containers:** Information is grouped into distinct, lifted cards. This modular "bento box" approach allows users to quickly locate key metrics or actions.
- **Whitespace:** Ample padding (typically `20px` or `24px` inside cards) ensures data doesn't feel cramped.
- **Rhythm:** Spacing follows a consistent scale, ensuring alignment and a sense of order.

## Elevation & Depth
The system employs subtle shadows and gradients to create a tactile, layered interface that feels premium and responsive.

- **Surfaces:** The main background (`--color-bg`) sits at the lowest level. Content cards (`--color-surface`) sit slightly above, defined by a delicate border (`--color-border`) and a soft, warm shadow.
- **Shadows:** Shadows are tinted with the dark text color (`rgba(45,27,14, 0.08)`) to maintain the warm color temperature. They are generally soft and diffused, increasing in depth (`--shadow-md`, `--shadow-lg`) for interactive states (hovering over a card) or overlays (modals).
- **Interactive Depth:** Primary buttons utilize a subtle drop shadow tinted with the primary rose color (`rgba(196,131,106,0.4)`), making them "pop" off the screen. On hover, the shadow increases, and on active (click), the element physically presses down (scale down, shadow decreases) for satisfying, tactile feedback.

## Shapes
The shape language favors **Rounded** corners to reinforce the friendly, approachable brand personality and echo the soft, organic shapes found in pastry.

- **Cards & Modals:** Large containers use generous radii (`16px` to `24px`, `--radius-lg` to `--radius-xl`) to create a soft, inviting structure.
- **Buttons & Inputs:** Interactive elements use a moderately rounded shape (`8px` to `12px`, `--radius-sm` to `--radius-md`) to appear friendly while remaining clearly identifiable as functional controls.
- **Badges:** Status indicators and small tags are fully rounded (`pill-shaped`, `99px`) for a distinct, compact appearance.

### Components in Action
- **Primary Buttons:** Combine a rich linear gradient with a tinted shadow and a scale transform on click, resulting in a highly satisfying, premium interaction.
- **Stat Cards:** Utilize the `card` styling with an icon contained in a softly tinted, rounded square (using the `accent` color with opacity), creating a clear visual focal point for key metrics.
- **Inputs:** Feature a cream background (`#FDF8F3`) that transitions to pure white (`#FFFFFF`) with a primary-colored border upon focus, clearly indicating active state while maintaining the soft aesthetic.
- **Sidebar Navigation:** Links utilize a transparent background that fills with a soft blush tint (`#FDE8E0`) and transitions the text to the dark rose color on hover or active state, providing clear wayfinding without heavy blocks of color.
