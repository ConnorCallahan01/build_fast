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

