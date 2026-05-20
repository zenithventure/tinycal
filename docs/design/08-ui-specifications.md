# SchedulSign High-Fidelity UI Specifications

Detailed UI specs for priority screens. Each specification includes layout, component usage, interactive states, responsive behavior, and accessibility notes. References the design system (`07-design-system.md`) and wireframes (`06-wireframes.md`).

---

## 1. Landing Page

### 1.1 Layout

The landing page is a single-page scroll with distinct sections stacked vertically. Max content width: `max-w-6xl` (1152px) with `px-6` horizontal padding.

### 1.2 Navigation Bar

```tsx
<nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
  <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
```

| Element | Specification |
|---------|-------------|
| Container | Sticky top, z-50, border-bottom, semi-transparent white with backdrop blur |
| Height | 64px (`h-16`) |
| Logo | `text-xl font-bold` -- "Schedul" in blue-600, "Sign" in gray-900 |
| Right actions | `flex items-center gap-4` |
| Log in link | `text-sm text-gray-600 hover:text-gray-900` |
| Get Started button | `text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition` |

**Responsive:** Same on all breakpoints. On very small screens (< 360px), button text may wrap but remains usable.

### 1.3 Hero Section

```tsx
<section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
```

| Element | Specification |
|---------|-------------|
| Padding | `pt-20 pb-16` (80px top, 64px bottom) |
| Badge | `inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-sm px-4 py-1.5 rounded-full mb-6` with Zap icon (`w-4 h-4`) |
| Headline | `text-5xl md:text-6xl font-bold tracking-tight text-gray-900 mb-6 text-balance` |
| Headline accent | `text-blue-600` on "One platform." |
| Subtitle | `text-xl text-gray-600 max-w-2xl mx-auto mb-10` |
| CTA group | `flex flex-col sm:flex-row items-center justify-center gap-4` |
| Primary CTA | `bg-blue-600 text-white px-8 py-3.5 rounded-lg text-lg font-medium hover:bg-blue-700 transition flex items-center gap-2` + ArrowRight icon |
| Secondary CTA | `text-gray-600 px-8 py-3.5 rounded-lg text-lg border hover:bg-gray-50 transition` |
| Note text | `text-sm text-gray-400 mt-4` |

**Interactive states:**
- Primary CTA hover: `bg-blue-700`
- Secondary CTA hover: `bg-gray-50`
- Both: `transition` (150ms)

**Responsive:**
- Mobile: `text-5xl` headline, CTAs stack vertically (`flex-col`)
- Desktop: `text-6xl` headline, CTAs side by side (`sm:flex-row`)

### 1.4 Social Proof Bar

```tsx
<section className="border-y bg-gray-50 py-8">
```

| Element | Specification |
|---------|-------------|
| Label | `text-sm text-gray-500 mb-4` uppercase |
| Segments | `flex items-center justify-center gap-8 text-gray-400 text-lg font-medium` |
| Separators | Centered dot character "·" |

### 1.5 Features Section

```tsx
<section id="features" className="max-w-6xl mx-auto px-6 py-20">
```

| Element | Specification |
|---------|-------------|
| Section heading | `text-3xl font-bold text-center mb-4` |
| Section subtitle | `text-gray-600 text-center mb-12 max-w-xl mx-auto` |
| Grid | `grid md:grid-cols-2 gap-8` |

**Feature Card:**
```tsx
<div className="border rounded-2xl p-8 hover:shadow-lg transition">
```

| Element | Specification |
|---------|-------------|
| Icon container | `w-12 h-12 bg-{color}-100 rounded-xl flex items-center justify-center mb-4` |
| Icon | `w-6 h-6 text-{color}-600` (blue for Scheduling, purple for E-Signatures) |
| Title | `text-xl font-semibold mb-3` |
| Description | `text-gray-600 mb-6` |
| Feature list | `space-y-2` with Check icons (`w-4 h-4 text-green-500 shrink-0`) |
| Feature text | `text-sm text-gray-700` |

**Interactive:** `hover:shadow-lg transition` -- shadow appears on hover

**Responsive:**
- Mobile: Single column (`grid-cols-1`)
- Tablet+: Two columns (`md:grid-cols-2`)

### 1.6 How It Works Section

```tsx
<section className="bg-gray-50 py-20">
```

| Element | Specification |
|---------|-------------|
| Heading | `text-3xl font-bold text-center mb-12` |
| Grid | `grid md:grid-cols-3 gap-8` |
| Step number | `w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 font-bold` |
| Step title | `font-semibold mb-2` centered |
| Step description | `text-gray-600 text-sm` centered |

**Responsive:** Single column on mobile, 3 columns on tablet+.

### 1.7 Pricing Section

```tsx
<section id="pricing" className="max-w-6xl mx-auto px-6 py-20">
```

| Element | Specification |
|---------|-------------|
| Grid | `grid md:grid-cols-2 gap-8 max-w-3xl mx-auto` |

**Free Plan Card:**
```tsx
<div className="border rounded-2xl p-8">
```
- Plan name: `text-lg font-semibold mb-1`
- Price: `text-4xl font-bold mb-1`
- Period: `text-gray-500 text-sm mb-6`
- Feature list: same as feature cards (Check icons)
- CTA: `block text-center border border-gray-300 py-2.5 rounded-lg hover:bg-gray-50 transition font-medium`

**Pro Plan Card:**
```tsx
<div className="border-2 border-blue-600 rounded-2xl p-8 relative">
```
- "MOST POPULAR" badge: `absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs px-3 py-1 rounded-full`
- Border: `border-2 border-blue-600` (stronger than Free)
- CTA: `block text-center bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition font-medium`

### 1.8 CTA Section

```tsx
<section className="bg-blue-600 py-16">
```

| Element | Specification |
|---------|-------------|
| Heading | `text-3xl font-bold text-white mb-4` |
| Subtitle | `text-blue-100 mb-8` |
| CTA | `inline-flex items-center gap-2 bg-white text-blue-600 px-8 py-3.5 rounded-lg text-lg font-medium hover:bg-blue-50 transition` |

### 1.9 Footer

```tsx
<footer className="border-t py-12">
```

| Element | Specification |
|---------|-------------|
| Layout | `flex flex-col md:flex-row items-center justify-between gap-4` |
| Copyright | `text-sm text-gray-500` |
| Links | `flex items-center gap-6 text-sm text-gray-500` with `hover:text-gray-700` |

---

## 2. Booking Page (Public)

The core user-facing experience. This is the most critical screen for conversion.

### 2.1 Page Layout

```tsx
<div className="min-h-screen bg-gray-50 py-8 px-4">
  <BookingWidget ... />
</div>
```

Background: `bg-gray-50`, centered widget with padding.

### 2.2 Widget Container

```tsx
<div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-lg overflow-hidden">
  <div className="md:flex">
```

| Property | Value |
|----------|-------|
| Max width | 768px (`max-w-3xl`) |
| Background | White |
| Border radius | 16px (`rounded-2xl`) |
| Shadow | Large (`shadow-lg`) |
| Layout | Horizontal on tablet+ (`md:flex`), vertical on mobile |

### 2.3 Left Panel (Event Info)

```tsx
<div className="md:w-72 p-6 border-b md:border-b-0 md:border-r">
```

| Element | Specification |
|---------|-------------|
| Width | 288px (`md:w-72`) on desktop, full width on mobile |
| Border | Bottom on mobile, right on desktop |
| Avatar | `w-10 h-10 rounded-full mb-3` -- image or initial with brand color bg |
| Host name | `text-sm text-gray-500` |
| Event title | `text-xl font-bold mt-1` with `style={{ color: host.brandColor }}` |
| Description | `text-sm text-gray-600 mt-2` (if present) |
| Metadata | `mt-4 space-y-2 text-sm text-gray-500` |
| Duration | Clock icon `w-4 h-4` + "{duration} min" |
| Location | Globe icon `w-4 h-4` + location type string |
| Price | `font-medium text-gray-700` (if payment required) |
| Timezone select | `mt-4`, `w-full text-xs border rounded px-2 py-1 text-gray-600` |

### 2.4 Right Panel - Calendar View

```tsx
<div className="flex-1 p-6">
  <div className="md:flex gap-6">
```

**Calendar grid:**
- Month header: `flex items-center justify-between mb-4`
  - Title: `font-semibold` (e.g., "February 2026")
  - Nav: ChevronLeft/Right icons in `p-1 hover:bg-gray-100 rounded`
- Day labels: `grid grid-cols-7 gap-1 text-center text-xs text-gray-500 mb-2`
- Day cells: `grid grid-cols-7 gap-1`
  - Each cell: `h-10 rounded-lg text-sm transition`
  - Normal: `hover:bg-gray-100`
  - Selected: `text-white font-bold` + `backgroundColor: host.brandColor`
  - Past/Out of month: `text-gray-300` disabled
  - Today: no special treatment (keeps clean look)

**Time slots panel:**
```tsx
<div className="md:w-44 mt-4 md:mt-0">
```
- Date header: `font-medium text-sm mb-3`
- Slots: `space-y-2 max-h-80 overflow-y-auto`
- Slot button: `w-full text-sm py-2 px-3 rounded-lg border transition text-center`
  - Default: `hover:border-blue-300`
  - Selected: `text-white border-transparent` + `backgroundColor: host.brandColor`, text becomes "Confirm ->"
  - Click selected slot -> transitions to form step

**Interactive flow:**
1. User selects a date -> slots load (with "Loading..." pulse animation)
2. User clicks a slot -> slot highlights, text changes to "Confirm ->"
3. User clicks "Confirm ->" -> transitions to form step

**Loading state:** `text-sm text-gray-400 animate-pulse` with "Loading..." text

**Empty state:** `text-sm text-gray-500` with "No available times"

### 2.5 Right Panel - Form View

Replaces calendar view when `step === "form"`.

| Element | Specification |
|---------|-------------|
| Back button | `text-sm text-blue-600 hover:underline mb-4` with "← Back" |
| Section title | `font-semibold mb-1` "Enter your details" |
| Time summary | `text-sm text-gray-500 mb-4` formatted date + time + timezone |
| Form | `space-y-4` |
| Name input | Required, standard text input |
| Email input | Required, email type |
| Phone input | Optional, tel type |
| Custom questions | Dynamic based on event type config |
| Submit button | Full width, brand color bg, white text |
| Submit text | "Confirm Booking" (or "Book & Pay USD $50" if payment required) |

**Custom question types:**
- TEXT: Standard text input
- TEXTAREA: `h-20 resize-none`
- SELECT: Standard select with options
- CHECKBOX: Rounded checkbox
- EMAIL: Email type input
- PHONE: Tel type input

### 2.6 Confirmation View

Replaces the widget with a centered card (`max-w-md`).

| Element | Specification |
|---------|-------------|
| Success icon | `w-16 h-16 bg-green-100 rounded-full` + Check `w-8 h-8 text-green-600` |
| Title | `text-2xl font-bold mb-2` "Booking Confirmed!" |
| Subtitle | `text-gray-600 mb-6` |
| Details card | `bg-gray-50 rounded-xl p-4 text-left space-y-2` |
| Meeting link | `inline-block mt-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700` |
| Actions | `mt-4 flex gap-4 justify-center text-sm` -- Reschedule (blue) + Cancel (red) links |
| Branding | `text-xs text-gray-400 mt-6` "Powered by SchedulSign" |

---

## 3. Dashboard Home

### 3.1 Layout

Uses dashboard shell: top bar (h-14) + sidebar (w-56) + main content area.

```tsx
<main className="flex-1 p-6 md:p-8 max-w-5xl">
```

### 3.2 Page Title

```tsx
<h1 className="text-2xl font-bold mb-6">Dashboard</h1>
```

### 3.3 Stat Cards

```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
```

Each stat card:
```tsx
<div className="bg-white rounded-xl border p-6">
  <div className="flex items-center gap-3 mb-2">
    <Icon className="w-5 h-5 text-{color}-600" />
    <span className="text-sm text-gray-600">{label}</span>
  </div>
  <p className="text-3xl font-bold">{value}</p>
</div>
```

| Stat | Icon | Color |
|------|------|-------|
| Event Types | Calendar | blue-600 |
| Upcoming Bookings | Clock | green-600 |
| Contacts | Users | purple-600 |

**Responsive:** Stacks to single column on mobile.

### 3.4 Upcoming Bookings Card

```tsx
<div className="bg-white rounded-xl border">
```

**Header:**
```tsx
<div className="flex items-center justify-between p-4 border-b">
  <h2 className="font-semibold">Upcoming Bookings</h2>
  <Link className="text-sm text-blue-600 hover:underline flex items-center gap-1">
    View all <ArrowRight className="w-3 h-3" />
  </Link>
</div>
```

**Booking Row:**
```tsx
<div className="p-4 flex items-center justify-between">
  <div>
    <p className="font-medium">{title}</p>
    <p className="text-sm text-gray-600">{date} at {time}</p>
    <p className="text-sm text-gray-500">{bookerName} ({bookerEmail})</p>
  </div>
  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
    {status}
  </span>
</div>
```

**Empty state:**
```tsx
<div className="p-8 text-center text-gray-500">
  <p>No upcoming bookings</p>
  <Link className="text-blue-600 text-sm hover:underline mt-2 inline-block">
    Create an event type to get started
  </Link>
</div>
```

---

## 4. Event Type Creation

### 4.1 List View Header

```tsx
<div className="flex items-center justify-between mb-6">
  <h1 className="text-2xl font-bold">Event Types</h1>
  <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2 text-sm">
    <Plus className="w-4 h-4" /> New Event Type
  </button>
</div>
```

### 4.2 Event Type Card (List Item)

```tsx
<div className="bg-white border rounded-xl p-5 flex items-center justify-between hover:shadow-sm transition">
  <div className="flex items-center gap-4">
    <div className="w-2 h-12 rounded-full" style={{ backgroundColor: et.color }} />
    <div>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-gray-500">{duration} · {location} · {bookingCount} bookings</p>
    </div>
  </div>
  <div className="flex items-center gap-2">
    <!-- Copy, Edit, Delete icon buttons -->
  </div>
</div>
```

**Color bar:** 2px wide (`w-2`), 48px tall (`h-12`), rounded-full, dynamic color from event type

**Action buttons:** `p-2 hover:bg-gray-100 rounded-lg` with:
- Copy: `w-4 h-4 text-gray-500`
- Edit: `w-4 h-4 text-gray-500`
- Delete: `w-4 h-4 text-red-500`

### 4.3 Create Modal

```tsx
<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
  <div className="bg-white rounded-xl max-w-md w-full p-6">
```

**Form fields:**

| Field | Type | Placeholder |
|-------|------|-------------|
| Title | text input | "e.g. 30 Minute Meeting" |
| Duration | select | [15, 20, 30, 45, 60, 90, 120] minutes |
| Location | select | Google Meet, Zoom, Phone, In Person, Custom |
| Description | textarea | "Optional" |

**Actions:**
```tsx
<div className="flex gap-3 justify-end">
  <button className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
  <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
    {loading ? "Creating..." : "Create"}
  </button>
</div>
```

### 4.4 Edit Event Type (Full Page)

**Header:**
```tsx
<div className="flex items-center gap-3 mb-6">
  <Link href="/dashboard/event-types" className="p-2 hover:bg-gray-100 rounded-lg">
    <ArrowLeft className="w-4 h-4" />
  </Link>
  <h1 className="text-2xl font-bold">Edit Event Type</h1>
</div>
```

**Form container:** `bg-white border rounded-xl p-6 space-y-6`

**Sections separated by `<hr />`:**

1. **Basic Info** - 2-column grid (`grid grid-cols-1 md:grid-cols-2 gap-6`)
   - Title (text)
   - Duration (select)
   - Location (select)
   - Color (color picker)
   - Description (textarea, full width)

2. **Scheduling Rules** - 3-column grid (`grid grid-cols-1 md:grid-cols-3 gap-4`)
   - Buffer before (number, min 0)
   - Buffer after (number, min 0)
   - Min notice (number, min 0)
   - Daily limit (number, placeholder "No limit")
   - Weekly limit (number, placeholder "No limit")
   - Max future days (number, min 1)

3. **Payment** - Checkbox toggle + conditional fields
   - Checkbox: `rounded` + label
   - If enabled: 2-column grid with Price (number, step 0.01) and Currency (select: USD/EUR/GBP)

4. **Options** - Checkboxes
   - Collective scheduling
   - Active (visible on booking page)

5. **Save** - Right-aligned
   ```tsx
   <button className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
     <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Changes"}
   </button>
   ```

---

## 5. Availability Settings

### 5.1 Layout

```tsx
<div>
  <div className="flex items-center justify-between mb-6">
    <h1 className="text-2xl font-bold">Availability</h1>
    <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm">
      <Save className="w-4 h-4" /> {saving ? "Saving..." : saved ? "Saved check" : "Save"}
    </button>
  </div>
  <div className="bg-white border rounded-xl divide-y">
    {/* 7 day rows */}
  </div>
</div>
```

### 5.2 Day Row

```tsx
<div className="p-4 flex items-center gap-4">
  <input type="checkbox" checked={rule.enabled} className="rounded" />
  <span className="w-28 text-sm font-medium">{dayName}</span>
  {rule.enabled ? (
    <div className="flex items-center gap-2">
      <input type="time" className="border rounded px-2 py-1 text-sm" />
      <span className="text-gray-400">---</span>
      <input type="time" className="border rounded px-2 py-1 text-sm" />
    </div>
  ) : (
    <span className="text-sm text-gray-400">Unavailable</span>
  )}
</div>
```

| Element | Specification |
|---------|-------------|
| Row height | Auto, min ~56px |
| Checkbox | Rounded, toggles enabled state |
| Day name | Fixed width (`w-28`), `text-sm font-medium` |
| Time inputs | Small (`text-sm`), time type, border + rounded |
| Separator | Em dash in `text-gray-400` |
| Disabled text | `text-sm text-gray-400` "Unavailable" |

**Interactive states:**
- Toggle checkbox: immediately shows/hides time inputs
- Save button: changes to "Saving..." then briefly shows "Saved (check)" before resetting

**Responsive:** Same layout on all sizes (compact enough). Time inputs may wrap on very small screens.

### 5.3 Improvement Recommendations

The current implementation covers weekly recurring rules. Future enhancements:
- Date-specific overrides (the schema supports `date` field)
- Multiple time blocks per day
- Named availability schedules (e.g., "Summer Hours")
- Visual weekly timeline view

---

## 6. Shared Interactive States Reference

### Hover States

| Component | Hover Treatment |
|-----------|----------------|
| Primary button | `bg-blue-700` (darker blue) |
| Secondary button | `bg-gray-50` (light gray fill) |
| Ghost button | `bg-gray-100` |
| Nav item | `bg-gray-50` |
| Card | `shadow-sm` or `shadow-lg` (feature cards) |
| Link | `hover:underline` |
| Icon button | `bg-gray-100` |
| Time slot | `border-blue-300` |
| Delete icon | parent `hover:bg-red-50` (contextual) |

### Focus States

All interactive elements:
```
focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none
```

Tab order follows visual order (left-to-right, top-to-bottom). Skip links recommended for dashboard layout.

### Disabled States

```
disabled:opacity-50 cursor-not-allowed
```

Applied to: buttons during async operations, past calendar dates, disabled form fields.

### Error States

- Form validation: `bg-red-50 text-red-600 text-sm p-3 rounded-lg` appears above or near the invalid field
- Input error: standard border (no red border change in current implementation). Consider adding `border-red-500` for invalid inputs.

### Loading States

| Context | Treatment |
|---------|----------|
| Page load | Full-screen centered spinner |
| Data fetch | `animate-pulse` text or skeleton |
| Button action | Text changes ("Creating..."), disabled |
| Slot loading | "Loading..." with `animate-pulse` |
| Save action | "Saving..." -> "Saved (check)" -> "Save" |

---

## 7. Responsive Specifications

### Mobile (< 768px)

| Screen | Adaptation |
|--------|-----------|
| Landing nav | Same layout, buttons may be smaller |
| Hero | `text-5xl`, CTAs stack vertically |
| Features grid | Single column |
| Pricing grid | Single column |
| Dashboard sidebar | Hidden entirely |
| Dashboard content | Full width, `p-6` padding |
| Stat cards | Single column stack |
| Booking widget | Left panel stacks above right panel |
| Booking widget | `border-b` instead of `border-r` on left panel |
| Calendar + slots | Slots appear below calendar |
| Edit event type | Form fields stack to single column |
| Settings sections | Single column for 2-col grids |

### Tablet (768px+, `md:`)

| Screen | Adaptation |
|--------|-----------|
| Landing hero | `text-6xl` |
| Features/Pricing | 2-column grid |
| Dashboard sidebar | Visible (`md:block`) |
| Stat cards | 3-column grid |
| Booking widget | Side-by-side panels (`md:flex`) |
| Form grids | 2-3 column grids active |

### Mobile Dashboard Navigation (Recommendation)

The current implementation hides the sidebar on mobile with no alternative. Recommended addition:

**Option A: Bottom Tab Bar**
```tsx
<nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t z-50 flex justify-around py-2">
  {/* 5 main nav items as icons + labels */}
</nav>
```

**Option B: Hamburger Menu**
```tsx
<button className="md:hidden" onClick={toggleMenu}>
  <Menu className="w-5 h-5" />
</button>
{/* Slide-out drawer from left */}
```

Both require a mobile nav implementation -- currently missing from the codebase.

---

## 8. Accessibility Specifications

### Semantic Structure

```html
<!-- Landing Page -->
<nav role="navigation" aria-label="Main navigation">
<main>
  <section aria-labelledby="hero-heading">
  <section aria-labelledby="features-heading">
  <section aria-labelledby="pricing-heading">
</main>
<footer>

<!-- Dashboard -->
<header role="banner">
<aside role="navigation" aria-label="Dashboard navigation">
<main role="main">
```

### Focus Management

| Context | Behavior |
|---------|---------|
| Modal opens | Focus moves to modal title or first focusable element |
| Modal closes | Focus returns to trigger element |
| Step change (booking) | Focus moves to new step heading |
| Delete confirmation | Focus moves to confirmation dialog |

### Keyboard Shortcuts (Recommended)

| Key | Context | Action |
|-----|---------|--------|
| Escape | Modal open | Close modal |
| Enter | Time slot selected | Proceed to form |
| Arrow keys | Calendar | Navigate days (future enhancement) |

### ARIA Labels

| Element | Attribute |
|---------|----------|
| Logo link | `aria-label="SchedulSign home"` |
| Logout button | `aria-label="Sign out"` |
| Copy link button | `title="Copy booking link"` |
| Edit button | `title="Edit event type"` |
| Delete button | `title="Delete event type"` |
| Calendar prev | `aria-label="Previous month"` |
| Calendar next | `aria-label="Next month"` |
| Day cell | `aria-label="February 14, 2026"` or via date text content |
| Time slot | `aria-label="10:00 AM"` via visible text |
| Filter tabs | `role="tablist"` with `role="tab"` and `aria-selected` |

### Color Independence

All status information conveyed by color is also conveyed by text:
- Status badges include text labels ("CONFIRMED", "CANCELLED")
- Feature checkmarks have accompanying text
- Calendar selection has visual weight (font-bold) in addition to color
- Error messages include text, not just red color

---

## 9. Tailwind Configuration Recommendations

The current `tailwind.config.ts` has an empty `theme.extend`. For the design system to be fully utilized, consider extending with:

```ts
const config: Config = {
  content: [...],
  theme: {
    extend: {
      colors: {
        brand: {
          // Dynamic brand color handled via CSS custom property
          DEFAULT: 'var(--brand-color, #2563eb)',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
```

This allows using `bg-brand` and `text-brand` classes that respect user brand color settings, reducing inline `style` usage. Implementation would require setting `--brand-color` CSS custom property on the booking widget root element.

---

## 10. Component Inventory

Summary of all UI components used across screens, for potential extraction into a shared component library:

| Component | Used In | Reusable? |
|-----------|---------|-----------|
| Logo | Landing nav, dashboard nav, auth pages | Yes - extract `<Logo size="sm|md|lg" />` |
| Button | Everywhere | Yes - extract `<Button variant="primary|secondary|ghost|danger" size="sm|md|lg" />` |
| Input | All forms | Yes - extract `<Input label="" type="" />` |
| Select | Event type forms, settings | Yes - extract `<Select label="" options={} />` |
| Card | Dashboard pages | Yes - extract `<Card padding="sm|md|lg">` |
| Badge | Status indicators | Yes - extract `<Badge status="confirmed|cancelled|..." />` |
| Modal | Create event type, signature creation | Yes - extract `<Modal title="" onClose={}>` |
| EmptyState | Lists when empty | Yes - extract `<EmptyState message="" action="" />` |
| PageHeader | All dashboard pages | Yes - extract `<PageHeader title="" action={} />` |
| StatCard | Dashboard home | Yes - extract `<StatCard icon={} label="" value={} />` |
| Calendar | Booking widget, reschedule | Partially (booking-widget contains it inline) |
| DataTable | Contacts | Yes - extract `<DataTable columns={} rows={} />` |

Extracting these would reduce duplication and enforce design system consistency.
