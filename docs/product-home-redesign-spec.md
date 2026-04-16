# Product Home Redesign Spec

## Goal
- Replace the current futuristic/high-tech dashboard tone with a business-ready product operations experience.
- Optimize the first viewport for product managers, revenue leaders, and operational stakeholders.

## Visual Direction
- Palette:
  - `Slate 950` for primary text and headline emphasis
  - `Slate 600/500` for secondary content and metadata
  - `Slate 50/100/200` for surfaces, dividers, and quiet backgrounds
  - `Sky 600` for progress and neutral emphasis
  - `Emerald 600` for positive business movement
  - `Amber 600` for review/risk states
  - `Rose 600` for blockers or critical risk
- Typography:
  - Keep system sans stack already used by the app
  - Headings: semibold, tighter tracking, sentence case
  - Metadata: small uppercase labels only where useful for scannability
  - Avoid mono/terminal styling except where operational logs require it
- Iconography:
  - Use Lucide icons with standard stroke weight
  - Prefer business/product metaphors: backlog, analytics, roadmap, feedback, revenue

## Information Architecture
- First viewport must surface:
  - Active product initiatives with progress bars and next milestone
  - Quick access shortcuts to backlog, analytics, and customer feedback
  - Cross-team activity feed
- Secondary region:
  - Revenue trend
  - OKR snapshot
  - Release roadmap

## Component Library
- `ProductMetricCard`
  - KPI label, value, delta, and business context
- `InitiativeCard`
  - Initiative title, owner, status badge, progress bar, and next milestone
- `ShortcutCard`
  - Fast path to high-frequency workflows
- `ActivityFeedCard`
  - Timestamped cross-team updates
- `RevenueTrendCard`
  - Recharts line comparison for revenue vs. target
- `OkrSnapshotCard`
  - Objective + key result + progress
- `RoadmapCard`
  - Phase, ETA, and owner for near-term delivery

## Responsive Rules
- `320 px`
  - Single-column layout
  - Hero content stacks vertically
  - KPI cards stack
  - Charts maintain readability with simplified spacing
- `768 px`
  - KPI grid becomes two columns
  - Quick access cards can split into two columns
  - Main content remains vertically prioritized
- `1440 px`
  - Two-column dashboard layout
  - Initiatives + revenue left, shortcuts + activity right
  - OKRs and roadmap side by side

## Accessibility
- Target WCAG AA contrast for text and interactive surfaces
- Use visible focus states via outline/ring on shortcut links and buttons
- Keep semantic headings and readable body text sizes
- Avoid decorative motion as a source of meaning

## Performance
- Keep first render lightweight by using mock-backed data and no heavy hero animation
- Avoid large above-the-fold images/video
- Prefer CSS layout and simple SVG/chart primitives
- Target LCP under 2.5s on constrained networks by minimizing blocking UI dependencies

## Prototype Scope
- Implemented on authenticated route `/`
- Uses mock endpoint `api.getProductHomeDashboard()`
- Reuses existing shadcn/Tailwind foundation

## Testing / Success Criteria Handoff
- Usability validation:
  - Run moderated review with at least 5 product managers
  - Collect feedback on clarity of priorities, discoverability, and confidence
- Efficiency:
  - Measure common workflows against baseline
  - Target 20% faster completion for finding backlog, analytics, and customer signals
- Accessibility:
  - Run automated audits and require zero critical violations

## Figma-equivalent Handoff
- This document serves as the repository-based design handoff.
- If a formal Figma file is required later, mirror:
  - Hero section
  - KPI row
  - Initiatives stack
  - Quick access stack
  - Activity feed
  - Revenue chart
  - OKR and roadmap panels
