# Frontend Styleguide & Architecture (FRONTEND.md)

Guidelines for Next.js and frontend dashboard development.

---

## 1. Technical Stack

*   **Framework**: Next.js 15+ App Router.
*   **Styling**: Vanilla CSS or TailwindCSS (version 3.x/4.x matching workspace config).
*   **Icons**: `lucide-react`.
*   **State Management**: React Server Components (RSC) for data fetching, React `useState`/`useContext` for client interactivity.
*   **Charting**: `recharts` for audit log analytics.

---

## 2. Design Aesthetics

Our dashboard must look premium and professional. Avoid raw default colors or generic bootstrap themes.
*   **Theme**: Dark mode, deep slate/indigo backgrounds, frosted glass containers (`backdrop-filter: blur()`).
*   **Typography**: Clean fonts (Inter, Outfit).
*   **Micro-interactions**: Hover scaling (`scale-105`), smooth transitions (`transition-all duration-300`), active states.

---

## 3. Best Practices

1.  **Component Co-location**: Keep component-specific styles and tests close to the component.
2.  **No Placeholders**: Never ship empty placeholders. Use mock data or generate visual assets.
3.  **SEO**: Provide descriptive title tags and meta descriptions in layouts.
