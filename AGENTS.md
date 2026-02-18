# AGENTS.md — Slide Codebase Standards

> This file governs all AI-assisted code generation in this repository.
> Every agent (Copilot, Claude, Cursor, etc.) MUST follow these rules.
> If a rule conflicts with "getting it done fast," the rule wins.
> This codebase handles real-money trading. Bugs cost dollars. Act accordingly.

---

## Core Philosophy

This is a production trading application. Every line of code must be written as if a user's money depends on it — because it does. Code that "works" is not good enough. Code must be correct, traceable, and recoverable.

**The Three Questions — ask before writing anything:**
1. Does this function/hook/component already exist somewhere in the codebase? (Search first.)
2. Will a developer understand this in 6 months without context?
3. If this breaks during a live trading round, can someone trace the error in under 5 minutes?

If the answer to any of these is "no," rewrite it.

---

## Tech Stack

- **Runtime:** React Native 0.81 via Expo SDK 54 (managed workflow)
- **Routing:** expo-router (file-based, Stack navigator)
- **Styling:** NativeWind (Tailwind CSS via `className`)
- **State:** React hooks + Context API (no external state library yet)
- **Charts:** react-native-svg (manual SVG paths, no charting library)
- **Language:** TypeScript with strict mode
- **Platforms:** iOS (primary), web (secondary)

---

## Project Structure

```
slide/
├── app/                # Expo Router pages — one file per route
│   ├── _layout.tsx     # Root layout, providers, navigation config
│   ├── index.tsx       # Home / trading screen
│   ├── settlements.tsx # Settlement history
│   └── settings.tsx    # User settings
├── components/
│   ├── ui/             # Generic reusable UI (buttons, icons, tokens)
│   ├── bets/           # Betting-specific components
│   ├── prediction/     # Prediction market components
│   └── layout/         # Layout wrappers
├── hooks/              # Custom React hooks — one hook per file
├── contexts/           # React Context providers
├── constants/          # Typed constants and market definitions
├── types/              # Shared TypeScript type definitions
├── utils/              # Pure utility functions (no React, no side effects)
├── data/               # Static data, mock data
├── assets/             # Images, audio, fonts
└── tests/              # Test files mirroring src structure
```

**Rules:**
- **Pages** live in `app/`. Each file is a route. No business logic in page files beyond wiring hooks to UI.
- **Hooks** live in `hooks/`. One hook per file. File name matches hook name: `useMarketRounds.ts` exports `useMarketRounds`.
- **Components** are organized by domain. If a component is used across domains, it goes in `components/ui/`.
- No file exceeds 300 lines. The current `app/index.tsx` violates this and must be refactored.
- No component/hook exceeds 80 lines of logic (excluding JSX/types). Extract sub-hooks or helpers.
- No function exceeds 50 lines. Extract helpers.
- No function has more than 4 parameters. Use an options/config object instead.

---

## The DRY Contract

**Before writing ANY new function, hook, component, or type:**

1. Search the codebase for similar functionality.
2. Check `utils/`, `hooks/`, `constants/`, and `types/` for shared code.
3. If something similar exists, extend it or refactor it. Do NOT create a parallel version.

**If you find yourself writing any of these, STOP:**
- A second WebSocket connection manager
- A second price formatting function
- A second market round timer
- A second context for the same data
- Any file named `utils.ts`, `helpers.ts`, `misc.ts`, or `common.ts`
- Any function prefixed with `custom`, `my`, `new`, or `v2`

**Shared utilities live in `utils/` or `hooks/`. Not in the component that happened to need it first.**

---

## Naming Conventions

### Files
- **Components:** `PascalCase.tsx` — name describes what it renders.
  - Good: `MarketCard.tsx`, `PriceChart.tsx`, `PositionRow.tsx`
  - Bad: `Card.tsx`, `Chart.tsx`, `Row.tsx`
- **Hooks:** `useCamelCase.ts` — name describes what state/behavior it provides.
  - Good: `useMarketRounds.ts`, `useLiveCryptoPrices.ts`
  - Bad: `useData.ts`, `useStuff.ts`
- **Utils:** `camelCase.ts` — name describes the domain.
  - Good: `priceFormatting.ts`, `roundTiming.ts`, `sounds.ts`
  - Bad: `utils.ts`, `helpers.ts`
- **Constants:** `camelCase.ts` — name describes the domain.
  - Good: `shorts.ts`, `markets.ts`
- **Types:** `camelCase.ts` in `types/` for shared types. Co-locate module-specific types in the module file.

### Code
- **Functions/hooks:** `camelCase`. Verb-first for actions: `placePosition()`, `formatPrice()`, `resolveRounds()`.
  - Banned names: `process()`, `handle()`, `doThing()`, `run()`, `manage()`
- **Components:** `PascalCase`. Noun that describes the UI element: `MarketCard`, `PriceChart`.
- **Constants:** `UPPER_SNAKE_CASE` for true constants. Defined in `constants/`, never hardcoded inline.
- **Types/Interfaces:** `PascalCase`. No `I` prefix on interfaces. Use descriptive names: `MarketRound`, `OpenPosition`.
- **Booleans:** Prefix with `is`, `has`, `can`, `should`: `isTradingEnabled`, `hasOpenPositions`.
- **No single-letter variables** outside of array methods and loop counters.
- **No abbreviations** unless universally understood in the domain: `ws`, `ms`, `px`, `btc`, `eth`, `tx`.

---

## TypeScript Rules

**All code is strictly typed. No shortcuts.**

- Every function has explicit parameter types and return types.
- No `any`. No `as any`. No `// @ts-ignore`. No `// @ts-expect-error` without a linked issue.
- Use `interface` for object shapes that may be extended. Use `type` for unions, intersections, and aliases.
- Use `Record<K, V>` over `{ [key: string]: V }`.
- Use discriminated unions for state machines (round status, position status, connection status).
- Prefer `readonly` for data that should not be mutated after creation.
- No type assertions (`as Type`) unless you can prove the cast is safe with a comment explaining why.
- Enums are banned. Use `as const` objects or string literal union types.

```typescript
// Bad
type Status = "good" | "bad" | "unknown";

// Good — self-documenting, searchable, exhaustive
type FeedStatus = "connecting" | "live" | "offline";
type PositionStatus = "win" | "loss" | "push";
```

---

## React & Component Rules

### Component Structure
Every component follows this order:
1. Imports
2. Types/interfaces (if component-specific)
3. Constants (if component-specific)
4. Component function
5. (No default exports from components — only page files use default exports)

### Hooks
- Custom hooks extract ALL non-trivial logic from components.
- A component's job is: call hooks, derive display values, return JSX. That's it.
- Hooks must be pure in their contract: same inputs produce same outputs (aside from legitimate side effects like subscriptions).
- Every `useEffect` must have a comment explaining WHAT it reacts to and WHY.
- Every `useEffect` cleanup function must be complete — no leaked intervals, subscriptions, or listeners.
- `useRef` for mutable values that don't trigger re-renders. `useState` for values that do.
- Never read `.current` of a ref inside JSX. It won't re-render when it changes.

### Memoization
- `useMemo` for expensive computations or reference-stable objects passed as props/deps.
- `useCallback` for functions passed as props or used in dependency arrays.
- Do NOT memoize trivially cheap operations. The overhead of memoization is worse than recomputing.
- Every `useMemo`/`useCallback` dependency array must be exhaustive and correct. Lint enforces this.

### State
- Keep state as close to where it's used as possible.
- Lift state only when two or more siblings need it.
- Context is for app-wide state (auth, theme, shared data). Not for passing props two levels down.
- Never store derived state. Compute it from source state in render or `useMemo`.

---

## Financial Precision & Safety

**This is a trading app. Rounding errors lose money.**

- All monetary calculations use integers (cents/basis points) or explicit rounding functions (`roundToTwo`, `roundToFour`). Never rely on floating-point arithmetic for display or settlement.
- Every price, balance, and payout calculation must be traceable: inputs logged, formula documented.
- Settlement logic must be idempotent. Settling the same round twice must produce the same result, not double-pay.
- Balance mutations are atomic: debit and credit happen in the same state update or neither happens.
- Every position has a unique ID. No duplicate processing.
- WebSocket reconnection must never lose pending settlements. Use a queue with deduplication.
- Price feeds being stale or disconnected must halt trading immediately — never allow bets against stale prices.
- All user-facing numbers must be formatted consistently. Use the shared formatting functions in the codebase.

---

## Error Handling

**Every error must be traceable to its source.**

- Use typed error boundaries for component trees that can fail independently.
- WebSocket errors must trigger reconnection with exponential backoff.
- Parse external data defensively: validate every field from WebSocket messages before using it. Malformed messages are silently dropped (logged at DEBUG), never crash the app.
- Error messages in UI must be user-friendly. Error details in logs must be developer-friendly. These are different strings.
- Never `catch` without logging. Never `catch` and re-throw without adding context.
- Functions that can fail should return `null` or a result type — not throw — unless the failure is truly exceptional.

```typescript
// Bad — crashes if WS sends garbage
const price = JSON.parse(event.data).payload.value;

// Good — defensive, traceable
function parsePriceTick(raw: string): PriceTick | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.payload?.value || !Number.isFinite(parsed.payload.value)) {
      return null;
    }
    return { price: parsed.payload.value, timestamp: Date.now() };
  } catch {
    return null;
  }
}
```

---

## Styling Rules (NativeWind / Tailwind)

- Use `className` with Tailwind utilities for all styling. No inline `style` objects unless required for dynamic values (e.g., `width` from `useWindowDimensions`).
- Color tokens are defined in the Tailwind config. Use semantic names: `text-text`, `bg-surface`, `border-border`, `text-danger`, `text-success`. Never hardcode hex colors in `className`.
- Hex colors are acceptable ONLY in SVG props and `style` objects where Tailwind classes don't apply (e.g., `react-native-svg` `fill`, `stroke`).
- Component-specific magic numbers (viewbox dimensions, animation durations) are extracted to named constants at the top of the file.
- Responsive design: use `useWindowDimensions` for layout calculations. Don't assume screen sizes.

---

## WebSocket & Real-Time Data Rules

- One WebSocket connection per data feed. Never open duplicate connections.
- Connection lifecycle must be fully managed: connect, subscribe, heartbeat, reconnect, cleanup.
- Reconnection uses exponential backoff with jitter. Never hammer a server with retries.
- Stale data detection: if no message received within a timeout, mark feed as `offline`.
- Buffer incoming data and flush to React state on a fixed interval (`PRICE_UI_TICK_MS`). Never trigger a React re-render per WebSocket message.
- All message parsing is done in a pure function that returns `T | null`. The WebSocket handler just calls the parser and updates the buffer.
- On unmount, close the socket and cancel all timers. No leaked connections.

---

## Performance Rules

- No O(n^2) operations on arrays that grow with user activity (positions, history, activity feeds).
- Cap all arrays with `.slice()` to prevent unbounded growth: price history, activity feeds, settled positions.
- Heavy computations (chart path building, quote calculations) go in `useMemo` with correct deps.
- Interval timers use the coarsest frequency that provides acceptable UX. Don't tick at 16ms if 200ms works.
- SVG chart rendering should avoid unnecessary re-renders. Memoize path strings when inputs haven't changed.
- Measure before optimizing. If you add a `useMemo`, you should be able to explain what re-render it prevents.

---

## Git & PR Discipline

**Commits:**
- One logical change per commit.
- Commit message format: `<scope>: <imperative verb> <what changed>`
  - Good: `chart: add y-axis price labels`, `hooks: extract useMarketRounds from index`
  - Bad: `fix stuff`, `wip`, `updates`
- Scopes: `app`, `hooks`, `components`, `constants`, `types`, `utils`, `config`, `chart`, `ws`, `settlements`

**Pull Requests:**
- Every PR has a description: what changed, why, how to test.
- PRs should be reviewable in under 20 minutes. If >400 lines, break it up.
- No commented-out code. Delete it. Git remembers.
- No TODO comments without a linked issue.
- No unrelated changes. If you spot a cleanup opportunity, make it a separate PR.

---

## Anti-Patterns — Instant Rejection

| Pattern | Why It's Bad | Do This Instead |
|---|---|---|
| `any` type | Defeats TypeScript entirely | Use proper types or `unknown` + narrowing |
| `as Type` without justification | Masks bugs | Narrow with type guards |
| `// @ts-ignore` | Hides type errors | Fix the type error |
| `utils.ts` / `helpers.ts` | Junk drawer | Name the file after its purpose |
| Bare `catch {}` or `catch { }` | Swallows errors silently | Log or re-throw with context |
| `console.log` for debugging | Noise in production | Use structured logging or remove |
| Copy-pasted code blocks | Maintenance nightmare | Extract a shared function |
| Global mutable state | Untestable, race conditions | Use React state/context |
| Inline magic numbers | Unreadable, fragile | Extract to named constants |
| `useEffect` without cleanup | Memory leaks | Return cleanup function |
| `useEffect` with missing deps | Stale closures, subtle bugs | Exhaustive deps, use refs for stable refs |
| Nested ternaries >2 deep | Unreadable | Extract to a function or early returns |
| Boolean params that change behavior | Confusing API | Use separate functions or union types |
| `setTimeout`/`setInterval` without cleanup | Leaked timers | Clear in useEffect cleanup |
| Floating-point math for money | Rounding errors lose money | Use integer arithmetic + explicit rounding |
| Hardcoded URLs or API keys | Breaks across environments | Use constants or config |
| Components >300 lines | Unreadable, untestable | Extract hooks and sub-components |

---

## AI Agent-Specific Rules

1. **Search before writing.** Before creating any new file, function, hook, or component, search the existing codebase. Duplicates are rejected.

2. **Follow existing patterns.** Look at how similar things are done in the codebase. Match the style exactly. Consistency beats preference.

3. **No placeholder code.** No `// TODO: implement`, no `throw new Error("not implemented")`, no stub functions. Every function works or it doesn't exist.

4. **No demo-quality code.** This is production. No `// This is a simplified version`, no `// For demo purposes`. Ship-quality or nothing.

5. **Don't refactor what you weren't asked to touch.** If you're fixing a bug in `hooks/`, don't reorganize `components/`. Keep scope tight.

6. **Explain non-obvious decisions.** If you chose an approach that isn't the obvious first choice, leave a brief comment explaining why.

7. **Verify types mentally before outputting.** Are all types annotated? All imports used? All effects cleaned up? All arrays capped? All prices rounded?

8. **Financial logic gets extra scrutiny.** Any code that touches balances, payouts, settlement, or position management must be reviewed line-by-line for correctness. Off-by-one errors in trading code are unacceptable.

9. **When in doubt, ask.** Ambiguous requirements get clarified, not guessed. A wrong implementation costs more than a question.

10. **Leave the codebase better than you found it.** If you notice a small adjacent issue (missing type, unclear name), fix it in the same change if the scope is small. Otherwise, note it.

---

## Enforcement

- `tsc --strict` must pass with zero errors.
- ESLint (expo config) must pass with zero warnings.
- No file over 300 lines merges without an exception approved in PR review.
- No `any` types merge without an exception approved in PR review.
- Financial calculation changes require explicit reviewer sign-off on correctness.

---

*Last updated: February 2026*
*This document is enforced, not aspirational. If the code doesn't meet these standards, it doesn't ship.*
