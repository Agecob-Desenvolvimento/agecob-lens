## AgDash UI conventions

Import every component as a bare named import from `'agecob-lens'`, e.g.
`import { Button, Card, CardHeader, CardTitle, CardContent } from 'agecob-lens';`
No provider or root wrapper is required for styling — colors/spacing come
from compiled Tailwind CSS + CSS custom properties already in the bundle, not
from a runtime theme context. **Exception**: `Tooltip` throws without a
`<TooltipProvider>` ancestor — wrap any screen that uses `Tooltip` in one
`<TooltipProvider>` near its root (see `Tooltip.tsx` preview). No dark mode
exists yet (no `.dark` class block is defined) — always design for light mode.

### Styling idiom — Tailwind utility classes over HSL tokens

Never write raw hex/rgb colors. Every color utility resolves through an HSL
CSS custom property (`hsl(var(--name))`), so classes stay semantic:

| Family | Classes | Use for |
|---|---|---|
| `primary` | `bg-primary`, `text-primary-foreground` | primary actions, active state |
| `secondary` | `bg-secondary`, `text-secondary-foreground` | secondary actions |
| `destructive` | `bg-destructive`, `text-destructive-foreground` | delete/danger actions |
| `muted` | `bg-muted`, `text-muted-foreground` | de-emphasized text/backgrounds |
| `accent` | `bg-accent`, `text-accent-foreground` | hover/highlight state |
| `card` | `bg-card`, `text-card-foreground` | card surfaces |
| `success` | `bg-success`, `bg-success-soft`, `border-success-border`, `text-success-fg` | positive KPIs, "on target" |
| `danger` | `bg-danger`, `bg-danger-soft`, `border-danger-border`, `text-danger-fg` | negative KPIs, exceptions |
| `warning` | `bg-warning`, `bg-warning-soft`, `border-warning`, `text-warning-fg` | at-risk KPIs |
| `chart-1`…`chart-5` | `fill-[hsl(var(--chart-1))]` etc (Recharts) | data-viz series colors |
| `sidebar` | `bg-sidebar`, `text-sidebar-foreground`, `border-sidebar-border` | sidebar/nav surfaces only |

Structural utilities are plain Tailwind: `border`, `border-slate-200`,
`rounded-md`/`rounded-lg`, `text-sm`/`text-xs`/`text-2xl`/`text-3xl`,
`font-medium`/`font-semibold`/`font-bold`, `p-*`/`gap-*`/`space-y-*`. Only
use a utility class if it's already used somewhere in the bound `styles.css`
— Tailwind purges anything unused at build time, so an invented class
compiles to nothing and silently drops the style. When in doubt, prefer an
inline `style` for one-off layout over a class you haven't seen elsewhere in
this library.

### Where the truth lives

Read `styles.css` (root) before styling — it `@import`s the real token
definitions and every compiled component class. Per-component usage
guidance and prop tables live in each `components/<group>/<Name>/<Name>.prompt.md`.

### Example — KPI card (adapted from a verified preview)

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge } from 'agecob-lens';

function ConversaoCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversão</CardTitle>
        <CardDescription>vs. média do escritório</CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ fontSize: 32, fontWeight: 700 }}>68%</div>
        <Badge variant="default" className="mt-2">Positivo</Badge>
      </CardContent>
    </Card>
  );
}
```
