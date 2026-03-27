# NEURON Design System

**JJB OS Design Language for Asset-Light Freight Forwarding SMEs**

---

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Color System](#color-system)
3. [Typography](#typography)
4. [Spacing & Layout](#spacing--layout)
5. [Component Architecture](#component-architecture)
6. [Visual Hierarchy](#visual-hierarchy)
7. [Interaction Patterns](#interaction-patterns)
8. [Responsive Design](#responsive-design)
9. [Accessibility](#accessibility)
10. [Implementation Guidelines](#implementation-guidelines)

---

## Design Philosophy

### Core Principles

**1. Stroke-First Clarity**
- No shadows or layering effects
- Visual separation achieved through subtle stroke borders (`#E5ECE9`, `#EEF3F1`)
- Clean, flat surfaces with pure white backgrounds (`#FFFFFF`)
- Emphasis on content over decoration

**2. Professional Minimalism**
- Desktop-first approach for logistics professionals
- Information density balanced with breathing room
- Consistent 32px vertical padding, 48px horizontal padding on major containers
- Grid-based layouts with 24px gutters

**3. Data-Centric Design**
- Tabular numerals for all numeric displays
- Optimized for scanning financial data and logistics metrics
- Clear visual hierarchy for different data types (revenue, expense, neutral)
- Philippine Peso (₱) currency formatting throughout

**4. Cohesive Module Experience**
- All 7 modules (Dashboard, Bookings, Clients, Accounting, Reports, HR, Admin) share the same design DNA
- Consistent navigation patterns, card layouts, and interaction behaviors
- Unified color semantics across all screens

---

## Color System

### Brand Colors

**Primary Green Palette**
```css
--neuron-brand-green: #237F66       /* Primary actions, links, active states */
--neuron-brand-green-600: #1E6D59   /* Hover states, pressed */
--neuron-brand-green-100: #E8F2EE   /* Subtle backgrounds, highlights */
```

**Ink (Text) Hierarchy**
```css
--neuron-ink-primary: #12332B       /* Primary headings, labels */
--neuron-ink-secondary: #2E5147     /* Body text, secondary content */
--neuron-ink-muted: #6B7A76         /* Tertiary text, metadata */
```

### UI Colors

**Backgrounds**
```css
--neuron-bg-page: #F7FAF8          /* Page canvas background */
--neuron-bg-elevated: #FFFFFF       /* Cards, modals, elevated surfaces */
```

**Borders & Dividers**
```css
--neuron-ui-border: #E5ECE9        /* Default borders, container outlines */
--neuron-ui-divider: #EEF3F1       /* Subtle dividers, table borders */
```

**Interactive States**
```css
--neuron-state-hover: #F1F6F4      /* Hover backgrounds (rows, buttons) */
--neuron-state-selected: #E4EFEA   /* Selected/active state backgrounds */
```

### Semantic Colors

**Status Indicators**
```css
--neuron-semantic-success: #2B8A6E  /* Confirmed bookings, revenue */
--neuron-semantic-warn: #C88A2B     /* Pending states, warnings */
--neuron-semantic-danger: #C94F3D   /* Cancelled, expenses, errors */
```

**Accent**
```css
--neuron-accent-terracotta: #B06A4F /* Warm accent for visual variety */
```

### Color Usage Guidelines

**Booking Status Colors**
- **Pending**: `#C88A2B` (Warn) with `#FEF3E0` background
- **Confirmed**: `#2B8A6E` (Success) with `#E8F2EE` background
- **Cancelled**: `#C94F3D` (Danger) with `#FCE8E6` background

**Accounting Entry Colors**
- **Revenue**: `#16A34A` (Green) - positive cash flow
- **Expense**: `#DC2626` (Red) - negative cash flow
- **Transfer**: `#374151` (Neutral gray) - internal movements

**Interactive Elements**
- **Primary buttons**: `#237F66` background, white text
- **Secondary buttons**: White background, `#E5ECE9` border, `#12332B` text
- **Links**: `#237F66` with underline on hover
- **Focus rings**: `#237F66` with 2px offset

---

## Typography

### Font Family

**Inter Variable** with SF Pro Display-inspired tracking
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 
             Roboto, 'Helvetica Neue', Arial, sans-serif;
```

Loaded via Google Fonts with weights: 400 (Regular), 500 (Medium), 600 (Semibold), 700 (Bold)

### Type Scale

| Element | Size | Weight | Line Height | Tracking | Usage |
|---------|------|--------|-------------|----------|-------|
| **H1** | 24px | 600 | 36px | -0.01em | Page titles, main headings |
| **H2** | 20px | 500 | 30px | -0.005em | Section headings, card titles |
| **H3** | 18px | 500 | 27px | -0.005em | Subsection headings |
| **H4** | 16px | 500 | 24px | 0 | Component headings |
| **Body** | 15px | 400 | 22.5px | 0 | Paragraph text, descriptions |
| **Label** | 14px | 500 | 21px | 0 | Form labels, table headers |
| **Button** | 15px | 500 | 22.5px | 0 | Button text, interactive elements |
| **Table** | 14px | 400 | 21px | 0 + tabular | Table cells, data rows |
| **Small** | 12px | 600 | 18px | +0.002em | Uppercase badges, metadata |

### Letter Spacing Strategy

**SF Pro Display-inspired tracking** for optical balance:

- **Small UI (10-12px)**: `+0.2%` (`0.002em`) - Improved readability
- **Body (12-16px)**: `0%` - Natural spacing
- **H3 (18-20px)**: `-0.5%` (`-0.005em`) - Slightly tighter
- **H2 (22-28px)**: `-1.0%` (`-0.01em`) - Tighter for impact
- **H1/Page titles (30-40px)**: `-1.5%` (`-0.015em`) - Tight, elegant
- **Display (≥44px)**: `-2.0%` (`-0.02em`) - Maximum impact

### OpenType Features

**Tabular Numerals** (`font-feature-settings: 'tnum' 1`) applied to:
- All table cells (`<td>`, `<th>`)
- KPI metric displays (`.text-[32px]`, `.text-[28px]`, `.text-[24px]`)
- Currency amounts and financial data
- Chart axis labels
- Dashboard statistics

**Kerning** (`font-feature-settings: 'kern' 1`) enabled globally for optical spacing

### Typography Utilities

```css
.tracking-heading-tight { letter-spacing: -0.015em; } /* 30-40px */
.tracking-heading       { letter-spacing: -0.01em; }  /* 22-28px */
.tracking-subheading    { letter-spacing: -0.005em; } /* 18-20px */
.tracking-body          { letter-spacing: 0; }        /* 12-16px */
.tracking-small-ui      { letter-spacing: 0.002em; }  /* 10-12px */
```

---

## Spacing & Layout

### Spacing Scale

**Base unit: 4px** (using Tailwind's default scale)

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Tight internal spacing |
| `space-2` | 8px | Icon-text gaps, compact elements |
| `space-3` | 12px | Button padding, small gaps |
| `space-4` | 16px | Standard component padding |
| `space-6` | 24px | Grid gutters, section spacing |
| `space-8` | 32px | Vertical container padding |
| `space-12` | 48px | Horizontal container padding |

### Container Patterns

**Standard Module Container**
```tsx
<div className="p-8 px-12"> {/* 32px vertical, 48px horizontal */}
  <div className="bg-white border border-[#E5ECE9] rounded-[10px]">
    {/* Content */}
  </div>
</div>
```

**Grid System**
- **12-column grid** with 24px gutters
- Max width: 1200px (accounting modules) or 1280px (general)
- Centered with auto margins
- Responsive breakpoints at 1024px and 768px

### Border Radius

```css
--neuron-radius-s: 6px   /* Small elements: badges, tags */
--neuron-radius-m: 10px  /* Standard: cards, inputs, buttons */
--neuron-radius-l: 14px  /* Large containers: modals, dialogs */
```

### Elevation

**Minimal use of shadows** (stroke-first philosophy):
```css
--elevation-1: 0 1px 2px 0 rgba(16, 24, 20, 0.04)   /* Subtle lift */
--elevation-2: 0 2px 8px 0 rgba(16, 24, 20, 0.06)   /* Modals, popovers */
```

**Preferred approach**: Use `border: 1px solid #E5ECE9` instead of shadows

---

## Surface Hierarchy

Every user interaction in Neuron OS must be presented at the correct surface level. Choose based on the complexity and weight of the interaction — never upsize or downsize.

### The Four Surfaces

| Surface | When to Use | Examples |
|---|---|---|
| **Full Screen** | The primary task is large, has many fields, or requires the user's full focus. The user navigates *into* it. | Quotation Builder, Contract Builder, Booking Detail, Invoice Builder |
| **Side Panel** | Important action or detail that doesn't require full focus. The underlying context remains visible. | Customer Detail, Contact Detail, Task Detail, Budget Request Detail |
| **Inline** | A small number of fields (1–3) that logically belong within the current context. No navigation required. | Inline task edit, adding a line item, renaming a record |
| **Modal** | A system-level action that requires explicit confirmation before proceeding. **Requires permission from Marcus before introducing a new modal.** Only for irreversible or high-consequence actions. | Delete, Void, Cancel, Override |

### Rules

- **Default to Side Panel** for any detail view or CRUD form that isn't a primary workspace.
- **Use Inline** only when the action is truly contained (e.g., clicking a row to edit one field).
- **Never use Modal for forms.** A form with more than one field belongs in a Side Panel or Full Screen view.
- **Modal = system action only.** Do not use modals for create, edit, or navigation flows.
- **No new modals without explicit approval.** The `NeuronModal` component is the only permitted modal implementation.

---

## Modal Design System

### When a Modal Is Appropriate

Modals are reserved for **system actions** — operations that are irreversible, high-consequence, or require the user to explicitly confirm before the system proceeds. Examples:

- Permanent deletion of a record
- Voiding a financial document
- Cancelling a contract or booking
- Overriding a locked state

### The `NeuronModal` Component

All modals in Neuron OS use the shared `NeuronModal` component at `/src/components/ui/NeuronModal.tsx`. Never build a one-off modal inline.

```tsx
import { NeuronModal } from "../ui/NeuronModal";

<NeuronModal
  isOpen={showDeleteModal}
  onClose={() => setShowDeleteModal(false)}
  title="Delete Quotation"
  description="Are you sure you want to delete QUO-2026-001? This action is permanent and cannot be undone. All associated history and linked documents will be removed."
  confirmLabel="Delete Quotation"
  confirmIcon={<Trash2 size={15} />}
  onConfirm={handleDelete}
  variant="danger"
/>
```

### Variants

| Variant | Use Case | Confirm Button Color | Category Label |
|---|---|---|---|
| `danger` | Permanent deletion, irreversible destruction | `#C94F3D` | DANGER ZONE |
| `warning` | Voiding, cancellation, status override | `#C88A2B` | WARNING |
| `info` | Confirmation of non-destructive system action | `#237F66` | CONFIRMATION |

### Anatomy

```
┌─────────────────────────────────────────┐
│  Delete Quotation                         │  ← Title: 20px/600, #12332B
│                                           │
│  Are you sure you want to delete this     │  ← Description: 14px, #6B7A76
│  quotation? This action is permanent...   │
│  ────────────────────────────────────     │  ← Divider: #EEF3F1
│                     Cancel  🗑 Delete     │  ← Footer: right-aligned buttons
└─────────────────────────────────────────┘
```

**Dimensions**: max-width 420px, padding 28px body / 18px footer

**Backdrop**: `rgba(18, 51, 43, 0.35)` with `blur(2px)` — uses Neuron primary color, not generic black

**Card**: `#FFFFFF` background, `border: 1px solid #E5ECE9`, `border-radius: 8px`, `box-shadow: 0 8px 32px 0 rgba(16, 24, 20, 0.12)`

**Buttons**:
- Cancel: transparent background, `border: 1px solid #E5ECE9`, `#12332B` text — hover `#F1F6F4`, `border-radius: 6px`
- Confirm: solid variant color, white text — hover darkens by ~15%, `border-radius: 6px`

**Keyboard**: Escape closes the modal. Clicking the backdrop closes the modal. Focus trap within the card.

### What NOT to Put in a Modal

- Forms with more than one field → use Side Panel
- Create flows → use Full Screen or Side Panel
- Navigation → use routing
- Informational messages → use Toast (sonner)

---

## Component Architecture

### Card Anatomy

**Standard Card Structure**
```tsx
<div className="bg-white border border-[#E5ECE9] rounded-[10px]">
  {/* Header (optional) */}
  <div className="px-6 py-4 border-b border-[#EEF3F1]">
    <h3 className="text-[18px] font-medium text-[#12332B]">Card Title</h3>
  </div>
  
  {/* Content */}
  <div className="p-6">
    {/* Card content */}
  </div>
</div>
```

### Button Variants

**Primary Button**
```tsx
<button className="px-4 py-2 bg-[#237F66] text-white rounded-lg hover:bg-[#1E6D59]">
  Primary Action
</button>
```

**Secondary Button**
```tsx
<button className="px-4 py-2 bg-white border border-[#E5ECE9] text-[#12332B] rounded-lg hover:bg-[#F1F6F4]">
  Secondary Action
</button>
```

**Danger Button**
```tsx
<button className="px-4 py-2 bg-white border border-[#C94F3D] text-[#C94F3D] rounded-lg hover:bg-[#FCE8E6]">
  Delete
</button>
```

### Input Fields

**Standard Input**
```tsx
<input
  type="text"
  className="w-full px-4 py-2 border border-[#E5ECE9] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#237F66]"
  placeholder="Enter value..."
/>
```

**Select Dropdown**
```tsx
<select className="w-full px-4 py-2 border border-[#E5ECE9] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#237F66]">
  <option>Option 1</option>
  <option>Option 2</option>
</select>
```

### Status Badges

**Badge Component Pattern**
```tsx
<span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#E8F2EE] text-[#2B8A6E] text-[12px] font-semibold uppercase tracking-[0.002em]">
  <CheckCircle2 className="w-3 h-3" />
  Confirmed
</span>
```

**Status Color Mapping**
- **Pending**: `bg-[#FEF3E0] text-[#C88A2B]`
- **Confirmed**: `bg-[#E8F2EE] text-[#2B8A6E]`
- **Cancelled**: `bg-[#FCE8E6] text-[#C94F3D]`

### Tables

**Table Layout Pattern**
```tsx
<div className="bg-white border border-[#E5ECE9] rounded-[10px] overflow-hidden">
  {/* Header */}
  <div className="grid grid-cols-[...] gap-4 px-6 py-3 border-b border-[#EEF3F1] bg-[#F7FAF8]">
    <div className="text-[12px] font-semibold text-[#6B7A76] uppercase">Column 1</div>
    <div className="text-[12px] font-semibold text-[#6B7A76] uppercase">Column 2</div>
  </div>
  
  {/* Rows */}
  <div className="divide-y divide-[#EEF3F1]">
    <div className="grid grid-cols-[...] gap-4 px-6 py-4 hover:bg-[#F1F6F4]">
      <div className="text-[14px] text-[#12332B]">Cell 1</div>
      <div className="text-[14px] text-[#12332B]">Cell 2</div>
    </div>
  </div>
</div>
```

---

## Visual Hierarchy

### Heading Hierarchy

1. **Page Title (H1)** - 24px/600/-0.01em - `#12332B`
   - Appears once per page
   - Top-level navigation context

2. **Section Title (H2)** - 20px/500/-0.005em - `#12332B`
   - Major content sections
   - Card titles, dialog headers

3. **Subsection Title (H3)** - 18px/500/-0.005em - `#12332B`
   - Component groups
   - Table sections

4. **Component Title (H4)** - 16px/500/0 - `#12332B`
   - Individual component labels
   - Form section headers

### Text Color Hierarchy

1. **Primary** (`#12332B`) - Main content, headings, labels
2. **Secondary** (`#2E5147`) - Supporting text, descriptions
3. **Muted** (`#6B7A76`) - Metadata, timestamps, helper text

### Data Emphasis

**Financial Data**
- Large KPI numbers: 32px/600/tabular with `-0.015em` tracking
- Medium metrics: 28px/600/tabular with `-0.01em` tracking
- Table amounts: 14px/400/tabular with `0` tracking
- Always use tabular numerals for vertical alignment

**Status Indicators**
- Color-coded badges with uppercase 12px/600 text
- Icons paired with text for redundancy
- Consistent placement (typically right-aligned in tables)

---

## Interaction Patterns

### Hover States

**Buttons**
- Primary: Background darkens from `#237F66` to `#1E6D59`
- Secondary: Background tints to `#F1F6F4`
- Text: No color change, maintain contrast

**Table Rows**
- Background: `transparent` → `#F1F6F4`
- Border: No change
- Cursor: `cursor-pointer` if clickable

**Cards**
- Subtle lift with `elevation-1` shadow (optional)
- Border color intensifies to `#D1DBD7`

### Active/Selected States

**Navigation Items**
- Background: `#E4EFEA`
- Text color: `#237F66`
- Border-left: 3px solid `#237F66`

**Tabs**
- Active tab: Bottom border `#237F66`, text `#237F66`
- Inactive tab: No border, text `#6B7A76`

### Focus States

**Form Inputs**
```css
focus:outline-none 
focus:ring-2 
focus:ring-[#237F66] 
focus:ring-offset-2
```

**Buttons**
```css
focus-visible:outline-none 
focus-visible:ring-2 
focus-visible:ring-[#237F66] 
focus-visible:ring-offset-2
```

### Loading States

- Use subtle shimmer effect with `#F1F6F4` background
- Skeleton screens match final layout structure
- Spinner: `#237F66` with 2px stroke

### Empty States

- Centered icon (48px) in `#6B7A76`
- Heading: "No [Resource] Yet"
- Description: Brief explanation in `#6B7A76`
- CTA button to create first item

---

## Responsive Design

### Breakpoint Strategy

```css
/* Desktop-first approach */
Default: ≥1280px   /* Full desktop layout */
Medium:  1024-1279px  /* Tablet landscape */
Tablet:  768-1023px   /* Tablet portrait */
Mobile:  <768px       /* Mobile devices */
```

### Layout Adaptations

**≥1280px (Desktop)**
- Full 12-column grid
- 48px horizontal padding
- Multi-column tables with all fields visible

**1024-1279px (Medium Desktop)**
- 12-column grid maintained
- Some column widths reduced (e.g., Amount, Status)
- 40px horizontal padding

**768-1023px (Tablet)**
- Grid collapses to fewer columns
- Cards stack vertically
- Date controls wrap to two rows
- 32px horizontal padding

**<768px (Mobile)**
- Single column layout
- Simplified tables (hide non-essential columns)
- Stacked form fields
- 24px horizontal padding
- Action buttons go full-width

### Responsive Patterns

**Date Controls (Reports Module)**
- Desktop: Single row with all controls
- Tablet: Two rows - controls wrap, Apply + Export together
- Mobile: Stacked vertically, action buttons in a row

**Accounting Grid**
```css
/* Desktop */
.accounting-grid {
  grid-template-columns: repeat(12, 1fr);
  gap: 24px;
  max-width: 1200px;
}

/* Tablet */
@media (max-width: 1023px) {
  .accounting-grid {
    grid-template-columns: repeat(6, 1fr);
    gap: 16px;
  }
}

/* Mobile */
@media (max-width: 767px) {
  .accounting-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}
```

---

## Accessibility

### Color Contrast

All text meets **WCAG 2.1 AA standards**:
- Primary text on white: `#12332B` on `#FFFFFF` (12.5:1)
- Secondary text on white: `#2E5147` on `#FFFFFF` (8.2:1)
- Muted text on white: `#6B7A76` on `#FFFFFF` (4.8:1)
- Button text: White on `#237F66` (4.9:1)

### Keyboard Navigation

**Focus Order**
- Logical tab order follows visual hierarchy
- Skip links for main content navigation
- Focus traps in modals and dialogs

**Focus Indicators**
- Visible focus ring on all interactive elements
- 2px `#237F66` ring with 2px offset
- Never remove focus outlines

### Screen Reader Support

**Semantic HTML**
- Use `<table>`, `<th>`, `<td>` for tabular data
- Proper heading hierarchy (`<h1>` → `<h2>` → `<h3>`)
- `<button>` for actions, `<a>` for navigation

**ARIA Labels**
- `aria-label` for icon-only buttons
- `aria-describedby` for form field hints
- `role="status"` for status messages
- `aria-live="polite"` for dynamic content updates

**Icon Accessibility**
- Always pair icons with text labels
- Use `aria-hidden="true"` on decorative icons
- Provide `aria-label` when icon stands alone

---

## Implementation Guidelines

### Component Creation Checklist

When building new components:

1. **Structure**
   - [ ] Use semantic HTML elements
   - [ ] Follow established container padding (32px/48px)
   - [ ] Apply consistent border radius (10px for cards)
   - [ ] Use stroke borders instead of shadows

2. **Typography**
   - [ ] Don't specify font-size/weight classes unless necessary
   - [ ] Use tabular numerals for numeric displays
   - [ ] Apply proper letter-spacing for heading sizes
   - [ ] Maintain text color hierarchy

3. **Colors**
   - [ ] Use NEURON CSS variables (e.g., `var(--neuron-brand-green)`)
   - [ ] Follow semantic color guidelines (success/warn/danger)
   - [ ] Ensure WCAG AA contrast ratios
   - [ ] Test color-blind friendly alternatives

4. **Interactions**
   - [ ] Implement hover states (`#F1F6F4` backgrounds)
   - [ ] Add focus states (2px `#237F66` ring)
   - [ ] Provide loading states for async actions
   - [ ] Handle empty states with helpful CTAs

5. **Responsiveness**
   - [ ] Test at all breakpoints (1280px, 1024px, 768px, mobile)
   - [ ] Ensure touch targets are ≥44px on mobile
   - [ ] Adapt grid layouts for smaller screens
   - [ ] Stack elements vertically on mobile

6. **Accessibility**
   - [ ] Add proper ARIA labels
   - [ ] Test keyboard navigation
   - [ ] Verify focus indicators are visible
   - [ ] Run axe DevTools audit

### Currency Formatting

**Always use Philippine Peso (₱)**
```tsx
// Correct
const formatted = `₱${amount.toLocaleString('en-PH', { 
  minimumFractionDigits: 2,
  maximumFractionDigits: 2 
})}`;
// Output: ₱15,000.00

// Incorrect - Do not use $, USD, or other currencies
```

### Date Formatting

**Philippine Context**
```tsx
// Standard date format
const formatted = new Date(date).toLocaleDateString('en-PH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric'
});
// Output: Jan 15, 2024

// Date + Time
const formatted = new Date(date).toLocaleDateString('en-PH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});
// Output: Jan 15, 2024, 2:30 PM
```

### Scrollbar Styling

**Custom Scrollbars** (subtle, non-intrusive)
```css
* {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
}

*::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

*::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}
```

### Toast Notifications

**Sonner Toast Styling** (matches NEURON design)
```tsx
import { toast } from "sonner@2.0.3";

// Success
toast.success("Booking created successfully");

// Error
toast.error("Failed to save changes");

// Info
toast("Payment processed", {
  description: "₱15,000 transferred to vendor"
});
```

Custom styling applied via `/styles/globals.css` to match NEURON colors and typography.

---

## Design Tokens Reference

### Complete Color Tokens

```css
/* Backgrounds */
--neuron-bg-page: #F7FAF8;
--neuron-bg-elevated: #FFFFFF;

/* Ink (Text) */
--neuron-ink-primary: #12332B;
--neuron-ink-secondary: #2E5147;
--neuron-ink-muted: #6B7A76;

/* Brand */
--neuron-brand-green: #237F66;
--neuron-brand-green-600: #1E6D59;
--neuron-brand-green-100: #E8F2EE;

/* Accent */
--neuron-accent-terracotta: #B06A4F;

/* UI */
--neuron-ui-border: #E5ECE9;
--neuron-ui-divider: #EEF3F1;

/* States */
--neuron-state-hover: #F1F6F4;
--neuron-state-selected: #E4EFEA;

/* Semantic */
--neuron-semantic-success: #2B8A6E;
--neuron-semantic-warn: #C88A2B;
--neuron-semantic-danger: #C94F3D;

/* Elevations */
--elevation-1: 0 1px 2px 0 rgba(16, 24, 20, 0.04);
--elevation-2: 0 2px 8px 0 rgba(16, 24, 20, 0.06);

/* Radius */
--neuron-radius-s: 6px;
--neuron-radius-m: 10px;
--neuron-radius-l: 14px;
```

### Usage in Components

```tsx
// Using CSS variables (recommended)
<div className="bg-[var(--neuron-bg-elevated)] border border-[var(--neuron-ui-border)]">
  <h2 className="text-[var(--neuron-ink-primary)]">Title</h2>
  <p className="text-[var(--neuron-ink-secondary)]">Description</p>
</div>

// Using hex values directly (also acceptable)
<div className="bg-white border border-[#E5ECE9]">
  <h2 className="text-[#12332B]">Title</h2>
  <p className="text-[#2E5147]">Description</p>
</div>
```

---

## Module-Specific Patterns

### Dashboard

- **4-column KPI grid** at desktop (1fr each with 24px gap)
- Large metric display: 32px/600/tabular
- Trend indicators with color-coded arrows
- Mini charts with `#237F66` accent
- Revenue/expense split clearly marked

### Bookings

- **8-column table grid** with responsive breakpoints
- Status badges prominently displayed
- Quick actions menu (3-dot) on row hover
- Color-coded booking types (revenue vs expense)
- Drawer panel for booking details (right-side slide-in)

### Clients

- **Card grid layout** (3 columns at desktop)
- Client logo/avatar in top-left
- Key stats (total bookings, revenue) in card footer
- Search bar with instant filtering
- Alphabetical grouping with section headers

### Accounting

- **Entries table** with date-grouped rows
- Running balance column (right-aligned, tabular nums)
- Category badges with icon + text
- Multi-entry selection with bulk actions
- Detail panel shows full entry metadata

### Reports

- **Chart-heavy layout** with date range controls
- Recharts library with NEURON color palette
- Export to CSV/PDF buttons (secondary style)
- Filter bar with responsive wrapping
- Print-optimized styles

### HR

- **Employee cards** with photo, name, role
- Status indicators (active/inactive)
- Contact information prominently displayed
- Role-based access indicators
- Quick edit actions on hover

### Admin

- **Settings sections** with clear groupings
- Toggle switches for binary options
- Multi-select dropdowns for permissions
- Danger zone (delete actions) clearly separated
- Save bar sticks to bottom when changes detected

---

## Best Practices

### DO ✅

- Use stroke borders (`border border-[#E5ECE9]`) for visual separation
- Apply tabular numerals to all numeric displays
- Maintain consistent padding (32px vertical, 48px horizontal)
- Use semantic color tokens for status indicators
- Test keyboard navigation on all interactive elements
- Provide empty states with helpful CTAs
- Use Philippine Peso (₱) for all currency
- Keep information density balanced with whitespace

### DON'T ❌

- Don't use box shadows unless absolutely necessary (modals/popovers only)
- Don't specify font-size/weight classes unless overriding defaults
- Don't use colors outside the NEURON palette
- Don't create visual hierarchy with size alone (use color, weight, spacing)
- Don't forget focus states on interactive elements
- Don't use USD or other currencies
- Don't stack multiple levels of cards/containers
- Don't use decorative animations or transitions (keep it professional)

---

## Version History

**v1.0** - December 2024
- Initial NEURON design system documentation
- Covers all 7 modules (Dashboard, Bookings, Clients, Accounting, Reports, HR, Admin)
- Based on Inter typography with SF Pro Display-inspired tracking
- Stroke-first visual language with minimal shadows
- Philippine Peso currency formatting
- Desktop-first responsive strategy

---

## Related Documentation

- [NEURON System Overview](./NEURON_SYSTEM_OVERVIEW.md) - Full system architecture and technical details
- `/styles/globals.css` - Design token implementation and CSS variables
- `/components/ui/*` - shadcn/ui component library with NEURON styling

---

**Maintained by**: JJB OS Development Team  
**Last Updated**: December 8, 2024
