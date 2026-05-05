# Dependências

[← index](index.md)

## Python (`requirements.txt`)

```
fastapi
uvicorn[standard]
pyodbc
```

---

## Node.js (`agecob-lens/package.json`)

### Runtime

| Pacote | Versão | Uso |
|--------|--------|-----|
| react | ^18.3.1 | UI |
| react-dom | ^18.3.1 | DOM |
| react-router-dom | ^6.30.1 | Roteamento SPA |
| @tanstack/react-query | ^5.83.0 | Data fetching + cache |
| recharts | ^2.15.4 | Gráficos |
| @radix-ui/* | múltiplos | Componentes UI acessíveis |
| lucide-react | ^0.462.0 | Ícones |
| tailwind-merge | ^2.6.0 | Classes condicionais |
| tailwindcss-animate | ^1.0.7 | Animações CSS |
| class-variance-authority | ^0.7.1 | Variantes de componente |
| clsx | ^2.1.1 | `cn()` helper |
| react-hook-form | ^7.61.1 | Formulários |
| @hookform/resolvers | ^3.10.0 | Validação com Zod |
| zod | ^3.25.76 | Schema validation |
| date-fns | ^3.6.0 | Utilitários de data |
| posthog-js | ^1.369.2 | Analytics (opcional) |
| sonner | ^1.7.4 | Toast notifications |
| next-themes | ^0.3.0 | Tema claro/escuro |
| cmdk | ^1.1.1 | Command palette |
| embla-carousel-react | ^8.6.0 | Carousel |
| react-day-picker | ^8.10.1 | Date picker |
| react-resizable-panels | ^2.1.9 | Painéis redimensionáveis |
| vaul | ^0.9.9 | Drawer mobile |
| input-otp | ^1.4.2 | Input OTP |

### Dev

| Pacote | Versão | Uso |
|--------|--------|-----|
| vite | ^5.4.19 | Build + dev server |
| @vitejs/plugin-react-swc | ^3.11.0 | Compilação SWC |
| typescript | ^5.8.3 | Type checking |
| tailwindcss | ^3.4.17 | CSS utility |
| postcss | ^8.5.6 | PostCSS |
| autoprefixer | ^10.4.21 | Vendor prefixes |
| vitest | ^3.2.4 | Unit tests |
| @testing-library/react | ^16.0.0 | Testes de componente |
| @testing-library/jest-dom | ^6.6.0 | Matchers DOM |
| @playwright/test | ^1.57.0 | E2E tests |
| eslint | ^9.32.0 | Linting |
| typescript-eslint | ^8.38.0 | TS rules |
| eslint-plugin-react-hooks | ^5.2.0 | Hooks lint |
| eslint-plugin-react-refresh | ^0.4.20 | HMR lint |
| lovable-tagger | ^1.1.13 | Tagging (Lovable.dev) |
| jsdom | ^20.0.3 | DOM para testes |
| @tailwindcss/typography | ^0.5.16 | Plugin tipografia |
| globals | ^15.15.0 | Globals ESLint |
