# Moon Pantry

A tiny no-dependency Node project used to test `build_fast`.

The app should recommend a late-night snack plan for a fictional moon base. The initial implementation is intentionally incomplete so an agent has a small, testable task to finish.

## Expected Behavior

```bash
npm test
```

The tests should pass once `src/moon-pantry.js` returns a snack plan with:

- a valid `crewSize`
- at least one snack per crew member
- a hydration reminder
- a calm summary string
- a `recommendation`: a tailored summary string that reflects crew size, mood, snack variety, and the dominant snack category
- a `categoryBreakdown`: a map of snack category to count whose values sum to the number of planned snacks

## Printable Shopping List

`createShoppingList(plan)` accepts the object returned by `createSnackPlan` and turns it into a deterministic, printable shopping list. It returns an object with:

- `items`: an array of `{ name, quantity, category }`, grouped by category in the order `drink`, `fruit`, `crunchy`, `savory`, `other` (snack names appear in first-seen order within each category)
- `totalItems`: the sum of all quantities, equal to the number of planned snacks
- `printable`: a multi-line string with a title line referencing the moon crew and crew size, one `- <quantity>x <name>` line per snack, a total-items line, and the hydration reminder

```js
import { createSnackPlan, createShoppingList } from "./src/moon-pantry.js";

const plan = createSnackPlan({ crewSize: 3, mood: "sleepy", pantry: [] });
const result = createShoppingList(plan);

console.log(result.printable);
```

This prints:

```text
Moon crew shopping list for a crew of 3
- 1x stardust trail mix
- 1x moon cheese cubes
- 1x lunar oat bites
Total items: 3
Remember to sip water or warm tea to stay hydrated.
```

