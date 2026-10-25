# webview-preview — guide for AI agents

You changed UI code and want to know whether it really works in the engine the app ships on. This guide is how to get
a trustworthy answer with `webview-preview`, quickly, and the traps that cost hours if you do not know them.

Read the [README](./README.md) for install and options. Everything here assumes the project has a
`webview-preview.config.mjs` (base URL, dev server) so a run is just a route and steps.

## The loop

1. Decide what "works" means as **numbers or text**: an element exists, a width stays 418, a gap is 16, a label
   reads "Fabric". Screenshots are for what numbers cannot say (colours, clipping, overlap).
2. Run the steps that reach the state, then `print:` the facts and `snap:` once.
3. Read the output: one line per `print:`, `js failed:` / `print failed:` on stderr, snapshot paths at the end, exit
   code 1 if a run failed.
4. Open the PNG only after the numbers make sense. Crop it to the area you care about before looking.
5. Change, run again, compare the same numbers.

When you report back, say which engine you checked and what you could **not** check (see the limits below).

## Writing steps

**Wrap every multi-statement `js:` in a block.** In WebKitGTK, `const` / `let` at the top level stay alive for the
whole page; the second step that declares the same name fails with `Can't create duplicate variable`. Chrome does
not complain, so the bug only shows on Linux. Always:

```
"js:{ const button = document.querySelector('[data-test=save]'); button.click() }"
```

**`print:` takes an expression.** For several statements use an arrow function that returns:

```
"print:(() => { const rect = document.querySelector('form').getBoundingClientRect(); return rect.width + 'x' + rect.height })()"
```

**Wait for things, not for time.** `waitfor:<selector>` returns as soon as the element is visible *and* has stopped
moving and fading; `waitfor:!<selector>` when a spinner or skeleton is gone. A fixed `wait:5000` is slow when the app
is fast and flaky when it is slow — keep `wait:` for catching the middle of an animation on purpose (`jsnow:` +
`wait:<ms>` + `snap:`). `js:` waits 700 ms after the code, `jsnow:` does not.

**Select by meaning, not by position.** In steps, `text=Save` finds an element by its exact text, and every
selector step picks the visible element on top, skipping copies hidden in closed menus or behind dialogs. Inside your
own `js:` / `print:` code you have to do that yourself: closed menus, inactive tabs and lists rendered for later often
stay in the DOM (hidden by opacity), so `document.querySelector('[role=option]')` can return an invisible one. Prefer
text and visibility:

```js
[...document.querySelectorAll('[role=option]')].find(option => option.textContent.trim() === 'Fabric')
element.getClientRects().length > 0
```

**CSS modules hash class names.** Match the stable part: `[class*=dropdown__menu]`.

**Typing into React inputs** needs the native setter and an `input` event:

```js
{ const input = document.querySelector('input[name=email]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'a@b.c');
  input.dispatchEvent(new Event('input', { bubbles: true })) }
```

If the project's config has macros (`macros` in `webview-preview.config.mjs` — signing in, opening a dialog), use them
(`macro:signIn`): they are already correct. A flow you repeat more than twice belongs there too.

## Errors in the page

After the steps the tool prints the page's `console.error` calls, uncaught exceptions and unhandled rejections
(`console.error: …`, `uncaught: …`, `unhandled rejection: …`). Read them before you look at a snapshot: a blank or
half-rendered picture almost always has its cause there. Mention any you did not cause — they may be bugs the user
should know about. Add `--fail-on-error` when the run must fail on them.

## Measuring

Start with `measure:<selector>` — one line with position, size, box, visibility, font, colours and text:

```
measure [role=dialog]: 1 match · x 370 y 133 w 460 h 420 · margin 0 padding 0 border 1 · visible display flex opacity 1 · font 16px/400 color rgb(255, 255, 255) bg rgb(17, 17, 17) · text "New project Fill in the fields — you can "
```

`waitfor:` first, so you measure the final state and not a frame of the opening animation. For anything else, write
it out with `print:`. Positions and sizes from `getBoundingClientRect()` are CSS pixels and do not depend on the
screenshot scale.

**Compare two states in one run** — before and after an action:

```
"print:document.querySelector('form').getBoundingClientRect().width"
"js:document.querySelector('[data-test=add-cover]').click()"
"print:document.querySelector('form').getBoundingClientRect().width"
```

**Frame by frame.** To see whether something animates smoothly, jumps, or flickers, record every animation frame into
`window` and print the log afterwards. Keep only the frames where the value changed:

```
"jsnow:{ window.__log = []; const start = performance.now(); const tick = () => { const height = Math.round(document.querySelector('[role=dialog]').getBoundingClientRect().height); window.__log.push(Math.round(performance.now() - start) + ':' + height); if (performance.now() - start < 1500) requestAnimationFrame(tick) }; requestAnimationFrame(tick) }"
"jsnow:document.querySelector('[data-test=toggle]').click()"
"wait:1600"
"print:window.__log.filter((entry, index, all) => index === 0 || entry.split(':')[1] !== all[index - 1].split(':')[1]).join(' ')"
```

`0:420 225:433 233:444 … 391:512` is a smooth grow; `0:420 16:512` is a jump; a value that goes up, down and up again
is a flicker. The same trick with a `MutationObserver` catches state that exists for only one render (for example a
label that is "up" for a single frame).

**Counting pixels.** When the question is "is there a 1 px line" or "is the ring clipped", read pixel rows of the
snapshot (Python + Pillow, or any image library) instead of squinting:

```python
from PIL import Image
image = Image.open("webkitgtk-dialog.png").convert("RGB")
scale = image.width // 1200                      # window width you used
for y in range(320 * scale, 340 * scale):
    print(y, image.getpixel((415 * scale, y)))
```

## Getting past login and the backend

The screen you need is often behind a login, or empty because the backend is not running. **Never change the app's
code to skip a check** (no `if (PREVIEW) skipAuth`, no commented-out guards): such switches end up in releases. All of
it goes into the preview config: `init`, `mock`, `tauri`, `globals`, `macros`. The app's code stays as it is.

1. **Find out what stands in the way.** Run with `--log-requests` and print the list:

   ```
   npx webview-preview /target-route --log-requests wait:2000 "print:location.href" "print:__webviewPreviewRequests.join('\n')"
   ```

   - `location.href` is not your route → a guard redirected you; the app wants a session.
   - The list shows which backend calls the screen makes.

2. **Read the code that decides** — only to learn what it expects, not to change it:
   - route guards and redirects (`Navigate`, `redirect`, `beforeEach`, `useEffect` that calls `navigate`);
   - where the session comes from (`localStorage.getItem(...)`, cookies, a context filled after a request like
     `GET /api/me`);
   - the API layer (`api/*.ts`, an `axios` instance, interceptors that add a token or react to `401`).

3. **Give it what it expects:**
   - session in storage → `init`: `localStorage.setItem('<key>', '<value in the exact format the code parses>')`;
   - session from a request → `mock` that request (`"GET /api/me": { json: { … } }`) and anything else the screen
     loads; take field names from the types / interfaces in the code;
   - desktop bridge → `tauri: { commands: { … } }` for Tauri, `globals` with `anyApi({ … })` for Electron's
     preload API or Wails bindings; the request list shows `invoke <command> -> null` / `call <path> -> default`
     for every call that still needs an answer;
   - session only in memory (no storage, no request) → steps through the real login form, saved as a macro.

4. **Check that it worked:** print `location.href` (you stayed on the route) and the request list (every request
   the screen needs is `-> mock …`, none fails), then snap.

Put the result in the project's `webview-preview.config.mjs` (or `preview/mocks.json`) so the next run — yours or a
person's — gets there in one command. Mention in your report which requests you mocked and with what data; mocked
data can hide a real bug in how the app handles the real server.

## Keyboard, mouse and focus

Use the real input steps, not `js:` clicks, whenever the question is about what a person experiences:

| Question | Steps |
|---|---|
| Does Tab go in the right order, does a focus trap hold? | `click:` the first field, then `key:Tab` / `key:Shift+Tab`, `print:document.activeElement…` after each |
| Does Tab go through the right elements, in order, and stay inside a dialog? | `focusorder` (after opening the dialog); every stop should say `in dialog`, and it should loop back |
| Is the focus ring visible and not clipped? | `key:Tab` until the element is focused, then `snap:ring@<selector>` (8 px margin included) |
| Does the hover state look right? | `hover:<selector>`, `wait:300` for the transition, `snap:x@<selector>` |
| Does typing work (validation, masks, Cyrillic…)? | `click:<input>`, `type:<text>`, `print:` the value / error text |
| Does Escape / Enter / arrows do the right thing? | `key:Escape`, `key:Enter`, `key:ArrowDown` |

- Input steps go through the engine's real input path: focus moves, `:hover` / `:focus-visible` apply and paint,
  default actions happen (Enter submits, Space toggles a checkbox). Both engines produce the same DOM events.
- `js:element.click()` and `dispatchEvent(new KeyboardEvent(…))` only run handlers — no focus move, no hover, no
  default action. Use them to reach a state quickly, not to test input.
- Input steps do not wait afterwards. Add `wait:<ms>` before a snapshot when something animates.
- A missing or hidden element in `click:` / `hover:` / `snap@` makes the run fail (exit code 1) — check the selector.

## Comparing before and after

To prove a change touched only what it should, take a baseline before editing and compare after:

```
npx webview-preview /screen <steps> snap:screen "snap:panel@[data-test=panel]" --update-baseline   # before the change
# … edit …
npx webview-preview /screen <steps> snap:screen "snap:panel@[data-test=panel]" --compare           # after
```

`same` everywhere you did not mean to change anything is strong evidence; a red area in `*.diff.png` outside your
change is a regression to explain. Use a separate `--baseline` folder for such throw-away checks so you do not
overwrite the project's committed baselines. Run `webview-preview clean` when you are done with the snapshots.

## Still out of reach — and a few traps

**Fractional scroll.** `scrollTop = 55.5` is rounded; real wheel and touchpad scrolling can stop between pixels. A
1 px glitch the user sees after scrolling may not reproduce here — reason about it and say it was not reproduced.

**State from earlier runs is gone.** Every run starts with empty storage (`--keep-storage` turns that off in
WebKitGTK). The app opens in its default state — the default tab, no saved session — so reach the state you need with
steps or `init`; do not rely on what an earlier run clicked.

**Windows' WebView2 itself.** `msedge` is the same engine, not the same embedding; window chrome, scrollbars of the
host and DPI handling of a native window can differ.

## Reading snapshots

- WebKitGTK renders off-screen at 1×: PNG pixels = CSS pixels. With `--headed` a HiDPI screen gives 2× (a 1200×650
  window → 2400×1300 PNG). Playwright engines follow `--scale`.
- Prefer `snap:name@selector` to cropping by hand; it includes an 8 px margin for rings and shadows.
- Enlarge with nearest-neighbour scaling before judging 1–2 px details.
- To compare two moments, use `--compare`, or paste crops side by side into one image.

## Checklist before saying "done"

- The numbers you defined in step 1 match, in the engine the user runs (`webkitgtk` for Tauri on Linux, `msedge` for
  Windows).
- No `js failed` / `print failed` / selector errors you did not expect; exit code 0.
- What you measured by eye is pinned with `assert:` — `assert:document.activeElement.matches('[role=dialog] button')`,
  `assert:getComputedStyle(document.querySelector('.card')).borderRadius === '12px'` — so a later run proves it in one
  line. `assert:` shows only the final value; for `a === b` print `a` first if it fails.
- Keyboard and hover behaviour checked with `key:` / `hover:` where the change touches them.
- You looked at one snapshot of the final state.
- You listed what could not be checked: fractional scroll, the other platform's engine, real backend data.
