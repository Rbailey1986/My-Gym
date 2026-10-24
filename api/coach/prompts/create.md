# Task: build a weekly training plan

Design a complete plan from `coachProfile` (their intake answers) and, if present, `history` (what they have already been lifting).

## Constraints

- Schedule exactly `coachProfile.daysPerWeek` training days. Use `preferredDays` when given (0 = Sunday … 6 = Saturday).
- Fit `coachProfile.sessionMin` minutes: roughly 2–3 minutes per straight set including rest; supersets (`sg`) buy time back when the session is tight.
- Only exercises from `library`. Respect `equipment`, `limitations`, and `dislikes` — a plan someone will not do is a plan that failed.
- If a `bodyweight.goal` is set and `bodyweight.by` names a target date, use the weigh-in trend to calculate the needed pace and adjust the plan accordingly. See the goal-driven coaching section below.
- If `history.workingWeights` is present, any starting `weight` you set must be at or below what they have already handled for that exercise. For anything they have not trained, omit `weight` entirely — the app's first session sets the baseline.
- 1–7 routines, each 3–12 exercises, compound work before accessories.

## Goal-driven coaching

When `bodyweight.goal` and `bodyweight.by` are set, the plan should help reach that weight by that date.

**Calculating the pace:**
- `current` is the last weigh-in (most recent entry in `bodyweight.series`).
- `remaining` is `goal - current`.
- `needed per week` is `remaining / weeks until target date`.
- `actual rate per week` (in the client logs) comes from the last 28 days of weigh-ins (a linear regression, not just the last two days).

**During a weight loss** (goal is lower than current):
- If pace is **on track** (trend heads for the goal): maintain or slightly reduce volume. Keep heavy compound lifts; they preserve muscle.
- If pace is **ahead of target** (losing faster than needed): add a rest day, increase calories slightly, or dial back additional cardio.
- If pace is **behind** (losing slower than needed): add a day or increase weekly volume. Light cardio or HIIT on existing days.
- Never drop compound work. Progress on big lifts is the signal to keep —  if your squat or deadlift is climbing while you're losing, you're losing fat and gaining/keeping muscle, which is the goal.

**During a weight gain** (goal is higher than current):
- Apply the same logic in reverse: if the pace is behind, increase volume and calories. If ahead, dial it back slightly.

**Cite the evidence:** Mention the current weight, the target, the needed weekly pace, and the recent trend if it exists. If no trend yet, say so and pick conservative starting points based on the goal, not the missing data.

## Output

```
{
  "coach_contract": 1,
  "opengym_plan": 1,
  "name": "<short plan name>",
  "summary": "<2-4 sentences: the shape of the plan and why it fits what they asked for>",
  "basedOn": "<what you used — e.g. 'your last 12 weeks' or 'no history yet'>",
  "week": { "1": "r1", "3": "r2", "5": "r3" },
  "routines": [
    {
      "id": "r1",
      "name": "<routine name>",
      "emoji": "<one icon: figureStrength, arm, abs, legs, pullup, dumbbell, barbell, kettlebell, plate, machine, figureRun, bike, swim, boxing, timer, stretch, moon, heart, flame or bolt>",
      "prog": "linear",
      "why": "<1-2 sentences: what this day is for>",
      "ex": [
        {
          "id": "<library id>",
          "sets": 3,
          "mode": "reps",
          "reps": 8,
          "prog": "linear",
          "inc": 2.5,
          "repsMin": 8,
          "sg": "a",
          "why": "<1-2 sentences naming why this exercise, here, at this prescription>"
        }
      ]
    }
  ],
  "customEx": []
}
```

- `week` keys are weekday numbers as strings, values are `routines[].id` from this same answer.
- `mode` is `reps` (use `reps`), `time` (use `sec`), or `cardio` (use `min` and `speed`).
- `prog` on a routine is its default; on an exercise it overrides. `inc` is the load step in `meta.unit`; `repsMin` only matters for `double`.
- `sg`: give two exercises the same short string to superset them. They must be adjacent in the list.
- `customEx` stays empty unless the library genuinely lacks something the plan needs; then add `{ "id": "cx1", "n": "<name>", "bp": "<body part>", "desc": "<how to do it>" }` and reference `cx1` from a routine.
