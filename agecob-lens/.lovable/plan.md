

## Internal Dashboard — Agecob Debt Collection

### Layout
- Single-page dashboard with a header showing "Agecob" logo/name and current date
- Database selector tabs: COBwebRCBAUTOS | COBwebRCBCONSUMER | Todos
- Grid of module cards below

### Architecture
- A `DashboardModule` reusable component that takes a config object (title, endpoint path, funnel field mappings) and handles: fetching, error states, funnel chart rendering, column selector, and data table
- A central config array where each entry defines a module — adding new endpoints later means just adding a new config entry
- A React context or top-level state for the selected database, passed down to all modules

### Health Check
- On load (and on database switch), call `GET /health/db/{db}` — show a warning banner in Portuguese if it fails

### Module: "Acordos fechados hoje"
- Fetches `/dashboard/acordos-hoje/{db}`
- Recharts FunnelChart visualizing key numeric fields from the response
- Checkboxes above the data table for column visibility toggling
- Error state rendered inside the card if the fetch fails

### Styling
- Clean dark theme with neutral corporate palette (slate/zinc tones)
- Cards with subtle borders, clear typography, professional spacing

### Tech
- React + Recharts (FunnelChart), Fetch API, no routing, no auth

