# flipper-counter

A Flipper Zero app (JavaScript) for counting reps, but it's just a clicker.

## How it works

The main screen shows the current count in large digits, with the target underneath:

```
          12
         / 30
 [ -1 ] [ Reset ] [ +1 ]
```

| Button  | Action                                    |
|---------|-------------------------------------------|
| Right   | +1 (hold to auto-repeat)                  |
| Left    | -1 (hold to auto-repeat)                  |
| Center  | Reset to 0                                |
| Back    | Menu (Set target / Exit)                  |
| OK      | Confirm in menus                          |

Every press at or past the target (30, 31, 32, ...) vibrates with a green LED blink, so you know you've hit your number without looking. The counter line also switches from `/ 30` to `Done!`.

The target defaults to 30 and can be changed via the menu's number keyboard (1-999). It is not persisted across app restarts.

## Development

```shell
bun start # Upload to the Flipper (over USB) and run it
```

Uploads `/ext/apps/Scripts/counter.js`.

## Code layout

- `counter.js` — the whole app, plain JavaScript. Written to match the firmware's bundled `gui.js` example style exactly.

## mjs engine rules

The Flipper's JS engine (mjs) is a strict ES subset; violating these rules crashes or breaks the app in ways invisible to any type checker:

- **No closures** — a function's scope dies when it returns. Callbacks get state via `subscribe()`'s extra arguments, and SDK view objects are used directly instead of being wrapped.
- **Native functions read their context from `this`** — always call them as methods (`eventLoop.subscribe(...)`, `notification.success(...)`), never detached. A detached call crashes the firmware.
- **Syntax subset** — no arrow functions, template literals, destructuring, `var`, method shorthand in object literals, or `==`.
- **No implicit number→string conversion** — use `.toString()`.
