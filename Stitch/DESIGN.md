---
name: Precision Academic Roster
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#434655'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#515f74'
  on-secondary: '#ffffff'
  secondary-container: '#d5e3fc'
  on-secondary-container: '#57657a'
  tertiary: '#005a82'
  on-tertiary: '#ffffff'
  tertiary-container: '#0074a6'
  on-tertiary-container: '#e4f2ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#d5e3fc'
  secondary-fixed-dim: '#b9c7df'
  on-secondary-fixed: '#0d1c2e'
  on-secondary-fixed-variant: '#3a485b'
  tertiary-fixed: '#c9e6ff'
  tertiary-fixed-dim: '#89ceff'
  on-tertiary-fixed: '#001e2f'
  on-tertiary-fixed-variant: '#004c6e'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.03em
  data-tabular:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  space-xxs: 2px
  space-xs: 4px
  space-sm: 8px
  space-md: 12px
  space-lg: 16px
  space-xl: 20px
  space-2xl: 24px
  space-3xl: 32px
  gutter-mobile: 12px
  gutter-desktop: 16px
  container-padding: 16px
---

## Brand & Style

This design system delivers an ultra-clean, utilitarian, and high-density interface engineered specifically for academic attendance management. Geared toward collegiate faculty, lab instructors, and departmental registrars, the interface prioritizes immediacy, high-speed visual scanning, and zero operational friction.

The design philosophy adopts an uncompromising Minimalist / Structured Utility approach:
- **Zero Visual Noise**: Decorative illustrations, heavy drop shadows, promotional banners, and multi-tone decorative gradients are strictly banned.
- **5-Second Comprehension**: Layouts and contrast ratios are calibrated so an instructor can glance at a 60-seat lecture grid or list and assess roll-call completeness, attendance percentages, and anomalies within five seconds.
- **Instrument Precision**: Every pixel functions as structured data. Layouts rely on crisp division borders, tabular legibility, and unmistakable semantic cues.

## Colors

The palette is engineered for extreme clarity under harsh classroom lighting and projector environments. It pairs an ultra-crisp slate surface model with a high-contrast text hierarchy and dedicated tri-state semantic tokens for immediate attendance auditing.

### Core Roles
- **Primary (`#2563eb`)**: Reserved exclusively for key system interactions, active states, active tab markers, and primary submission triggers.
- **Secondary (`#475569`)**: Structural controls, secondary action buttons, inactive icons, and column headers.
- **Neutral Foreground (`#0f172a`)**: Primary typographic color offering WCAG AAA compliance against pure white.
- **Muted Foreground (`#64748b`)**: Secondary meta-information, timestamps, section IDs, and subtitle annotations.
- **Neutral Border (`#e2e8f0`)**: Standard 1px boundary line applied across cards, dividers, tabular cells, and input fields.
- **Subtle Surface (`#f8fafc`)**: Table header fills, alternating table row stripes, and secondary container canvases.
- **Canvas Base (`#ffffff`)**: Pure white base for high readability and immediate data contrast.

### Functional Status Tokens
Status colors must never be used decoratively; they signify operational student states:
- **Present / Online**: Text & Border `#16a34a`, Tinted Background `#f0fdf4`.
- **Absent / Offline**: Text & Border `#dc2626`, Tinted Background `#fef2f2`.
- **Warning / Late / Excused**: Text & Border `#d97706`, Tinted Background `#fffbeb`.

## Typography

This design system uses Inter uniformly to ensure absolute metric cohesion across all operational screens. Numbers, register rolls, student identifiers, and percentages rely on OpenType tabular figures (`font-feature-settings: "tnum" 1`) to guarantee perfect vertical alignment down data columns.

### Scale Rules
- **Headline XL / LG**: Used sparingly for page headers, course codes, and lecture block titles.
- **Body MD & Data Tabular**: Primary working sizes for student rosters, verification inputs, and timestamps.
- **Label Small**: All-caps or title-case micro-labels for column headings, status badges, and aggregate metrics.
- Keep tracking tight on headings (`-0.01em` to `-0.02em`) and neutral or slightly expanded on labels to optimize rapid scannability under stress.

## Layout & Spacing

The layout is built on a compact, dense 4px base increment. By limiting whitespace padding, the design ensures that 30–50 rows of student data remain visible above the fold on standard laptop displays without requiring extensive vertical scrolling.

### Grid & Structure
- **Desktop (1024px and above)**: A structured 12-column grid or standard sticky master-detail split (collapsible 240px navigation rail, fluid tabular workspace, optional 320px contextual side-panel for active student records).
- **Tablet / Mobile (<1024px)**: Fluid single-column layout with pinned bottom action bars for single-tap attendance submissions.
- **Data Tables**: Fixed-height rows (36px compact row height, 44px standard row height) with sticky header rows pinned during scroll.

### Density Guidelines
- Standard horizontal padding within cells and inputs is capped at `12px` (`space-md`).
- Inter-component spacing is kept tightly bounded between `12px` and `16px`. Avoid generous, expansive marketing margins.

## Elevation & Depth

Visual hierarchy is maintained via low-contrast outlines and tonal containment rather than heavy drop shadows.

- **Outlines over Shadows**: Surfaces are segregated using a razor-sharp `1px solid #e2e8f0` border.
- **Default Surfaces**: Standard cards and tables rest flat on the `#ffffff` canvas with zero shadow (`box-shadow: none`).
- **Floating Overlays & Popovers**: Quick-action menus, seat assignment dropdowns, and date pickers use a precise, tight ambient boundary: `box-shadow: 0 1px 3px 0 rgba(15, 23, 42, 0.08), 0 1px 2px -1px rgba(15, 23, 42, 0.08)`.
- **Focused State Elevation**: Active or focused rows and elements utilize a `0 0 0 2px rgba(37, 99, 235, 0.2)` ring coupled with an explicit `#2563eb` border, ensuring no screen shifting or fuzzy blur.

## Shapes

The design system employs a restrained, soft-corner philosophy calibrated precisely between 4px and 6px:

- **Base Radius (`rounded-md`, 6px)**: Applied to table cards, input fields, dropdown containers, and modal dialogs.
- **Sub-Component Radius (`rounded-sm`, 4px)**: Applied to status badges, chips, action buttons, and segmented control segments.
- **Circular Components (`rounded-full`)**: Strictly restricted to student avatar thumbnails (28px × 28px) and status dot indicators (8px × 8px). Avoid pill-shaped buttons.

## Components

### 1. Attendance Action Buttons (Present / Absent / Late)
- **Design**: Compact segmented button or three-stage toggle per student row.
- **Present Button**: Neutral state has transparent fill with `#e2e8f0` border; active state has `#f0fdf4` fill, `#16a34a` text, and `#16a34a` border.
- **Absent Button**: Active state has `#fef2f2` fill, `#dc2626` text, and `#dc2626` border.
- **Late Button**: Active state has `#fffbeb` fill, `#d97706` text, and `#d97706` border.
- **Dimensions**: 32px height, 4px border radius, font size 12px, font weight 600.

### 2. Status Badges & Chips
- **Present Badge**: Background `#f0fdf4`, text `#16a34a`, border `1px solid #bbf7d0`.
- **Absent Badge**: Background `#fef2f2`, text `#dc2626`, border `1px solid #fecaca`.
- **Late Badge**: Background `#fffbeb`, text `#d97706`, border `1px solid #fde68a`.
- **Structure**: 20px height, 4px radius, inline-flex with a 6px status dot. All typography 11px uppercase weight 600.

### 3. Quick-Scanning Data Table
- **Header**: Background `#f8fafc`, text `#475569`, 11px uppercase tracking `0.05em`, border-bottom `1px solid #e2e8f0`. Height 36px.
- **Rows**: Background `#ffffff`, alternating hover state `#f8fafc`. Height 40px–44px.
- **Cells**: Single-line text truncation, vertical-align middle, `1px solid #e2e8f0` horizontal dividers. No vertical interior column borders.

### 4. Input Fields & Search Bars
- **Base Style**: Height 36px, `1px solid #e2e8f0` border, `#ffffff` surface, text `#0f172a`, placeholder text `#94a3b8`, 6px corner radius.
- **Focus State**: Border `#2563eb` with `box-shadow: 0 0 0 1px #2563eb`. No floating animations; instantaneous transition.

### 5. Checkboxes & Selection Controls
- **Default**: 16px × 16px square, 4px border radius, border `1px solid #cbd5e1`.
- **Checked**: Background `#2563eb`, border `#2563eb`, white checkmark icon (10px).
- **Indeterminate**: Background `#2563eb`, border `#2563eb`, white horizontal dash.

### 6. Summary Metric Cards
- **Structure**: Border `1px solid #e2e8f0`, background `#ffffff`, radius 6px, padding `12px 16px`.
- **Metrics Hierarchy**: 11px uppercase muted category label at top, 22px bold integer below, paired with an inline status indicator percentage (e.g., "94.2% PRESENT"). No large decorative icons or shadow cards.