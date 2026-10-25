import argparse
import json
import os
import sys

os.environ.setdefault("GDK_BACKEND", "x11")

import gi

gi.require_version("Gdk", "3.0")
gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")

from gi.repository import Gdk, GLib, Gtk, WebKit2

INPUT_SETTLE_MS = 50
UNSUPPORTED_RESULT = "Unsupported result type"
GDK_KEY_NAMES = {
    "Tab": "Tab", "Enter": "Return", "Escape": "Escape", "Backspace": "BackSpace", "Delete": "Delete",
    "Insert": "Insert", "Space": "space", "Home": "Home", "End": "End", "PageUp": "Page_Up", "PageDown": "Page_Down",
    "ArrowUp": "Up", "ArrowDown": "Down", "ArrowLeft": "Left", "ArrowRight": "Right",
    **{f"F{number}": f"F{number}" for number in range(1, 13)}
}
MODIFIER_KEYS = {"Shift": "Shift_L", "Control": "Control_L", "Alt": "Alt_L", "Meta": "Super_L"}
MODIFIER_MASKS = {
    "Shift": Gdk.ModifierType.SHIFT_MASK,
    "Control": Gdk.ModifierType.CONTROL_MASK,
    "Alt": Gdk.ModifierType.MOD1_MASK,
    "Meta": Gdk.ModifierType.SUPER_MASK
}


def emit(kind, value):
    sys.stdout.write(f"{kind}\t{json.dumps(value)}\n")
    sys.stdout.flush()


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--init-errors", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--prefix", required=True)
    parser.add_argument("--width", type=int, required=True)
    parser.add_argument("--height", type=int, required=True)
    parser.add_argument("--snap-margin", type=int, required=True)
    parser.add_argument("--color-scheme", choices=("light", "dark"))
    parser.add_argument("--reduced-motion", action="store_true")
    parser.add_argument("--headed", action="store_true")
    parser.add_argument("--keep-storage", action="store_true")
    parser.add_argument("--wait-for-timeout-ms", type=int, required=True)
    parser.add_argument("--wait-for-poll-ms", type=int, required=True)
    parser.add_argument("--load-settle-ms", type=int, required=True)
    parser.add_argument("--js-settle-ms", type=int, required=True)
    parser.add_argument("--timeout-ms", type=int, required=True)
    return parser.parse_args()


def describe(value):
    if value.is_string():
        return value.to_string()
    if value.is_undefined():
        return "undefined"
    return value.to_json(0) or value.to_string()


def keyval_for(key):
    if key in GDK_KEY_NAMES:
        return Gdk.keyval_from_name(GDK_KEY_NAMES[key])
    return Gdk.unicode_to_keyval(ord(key))


def apply_media(args):
    settings = Gtk.Settings.get_default()
    if args.color_scheme:
        settings.set_property("gtk-theme-name", "Adwaita")
        settings.set_property("gtk-application-prefer-dark-theme", args.color_scheme == "dark")
    if args.reduced_motion:
        settings.set_property("gtk-enable-animations", False)


def main():
    args = parse_args()
    apply_media(args)
    payload = json.loads(sys.stdin.read())
    steps = payload["steps"]
    init_scripts = payload["init"]
    os.makedirs(args.out, exist_ok=True)

    window = Gtk.Window(title="webview-preview") if args.headed else Gtk.OffscreenWindow()
    window.set_default_size(args.width, args.height)
    window.set_size_request(args.width, args.height)
    manager = WebKit2.UserContentManager()
    for source in init_scripts:
        manager.add_script(WebKit2.UserScript.new(
            source,
            WebKit2.UserContentInjectedFrames.TOP_FRAME,
            WebKit2.UserScriptInjectionTime.START,
            None,
            None
        ))
    view = WebKit2.WebView(user_content_manager=manager, is_ephemeral=not args.keep_storage)
    window.add(view)
    window.show_all()

    display = Gdk.Display.get_default()
    seat = display.get_default_seat()
    keymap = Gdk.Keymap.get_for_display(display)
    state = {"index": 0, "failed": False, "started": False}

    def finish(failed=False):
        state["failed"] = state["failed"] or failed
        Gtk.main_quit()
        return False

    def step_failed(message):
        state["failed"] = True
        emit("error", message)

    def deliver(event):
        if args.headed:
            Gtk.main_do_event(event)
        else:
            window.event(event)

    def focus_window():
        event = Gdk.Event.new(Gdk.EventType.FOCUS_CHANGE)
        event.focus_change.window = window.get_window()
        event.focus_change.send_event = 1
        event.focus_change.in_ = 1
        event.set_device(seat.get_keyboard())
        display.error_trap_push()
        deliver(event)
        display.error_trap_pop_ignored()
        view.grab_focus()

    def key_event(kind, keyval, mask):
        found, entries = keymap.get_entries_for_keyval(keyval)
        event = Gdk.Event.new(kind)
        event.key.window = window.get_window()
        event.key.send_event = 1
        event.key.time = Gtk.get_current_event_time()
        event.key.keyval = keyval
        event.key.state = mask
        if found and entries:
            event.key.hardware_keycode = entries[0].keycode
        event.set_device(seat.get_keyboard())
        deliver(event)

    def press(keyval, modifiers=()):
        mask = Gdk.ModifierType(0)
        for modifier in modifiers:
            key_event(Gdk.EventType.KEY_PRESS, Gdk.keyval_from_name(MODIFIER_KEYS[modifier]), mask)
            mask |= MODIFIER_MASKS[modifier]
        key_event(Gdk.EventType.KEY_PRESS, keyval, mask)
        key_event(Gdk.EventType.KEY_RELEASE, keyval, mask)
        for modifier in reversed(modifiers):
            key_event(Gdk.EventType.KEY_RELEASE, Gdk.keyval_from_name(MODIFIER_KEYS[modifier]), mask)
            mask &= ~MODIFIER_MASKS[modifier]

    def mouse(kind, x, y):
        event = Gdk.Event.new(kind)
        fields = event.motion if kind == Gdk.EventType.MOTION_NOTIFY else event.button
        if kind != Gdk.EventType.MOTION_NOTIFY:
            fields.button = 1
        fields.window = view.get_window()
        fields.send_event = 1
        fields.x = x
        fields.y = y
        fields.time = Gtk.get_current_event_time()
        event.set_device(seat.get_pointer())
        view.event(event)

    def full_pixbuf():
        if args.headed:
            return Gdk.pixbuf_get_from_window(
                view.get_window(), 0, 0, view.get_allocated_width(), view.get_allocated_height()
            )
        return window.get_pixbuf()

    def save(name, pixbuf):
        path = os.path.join(args.out, f"{args.prefix}{name}.png")
        pixbuf.savev(path, "png", [], [])
        emit("saved", path)

    def evaluate(code, on_value, on_error):
        def on_result(webview, result):
            try:
                on_value(describe(webview.evaluate_javascript_finish(result)))
            except Exception as error:
                on_error(str(error))

        view.evaluate_javascript(code, -1, None, None, None, on_result)

    def with_rect(step, use):
        selector = step.get("selector") or step["value"]

        def on_value(text):
            rect = json.loads(text) if text and text != "null" else None
            if not rect:
                step_failed(f"{step['kind']}:{step['value']} failed: no element matches {selector}")
                return next_step()
            if rect["width"] <= 0 or rect["height"] <= 0:
                step_failed(f"{step['kind']}:{step['value']} failed: {selector} has no size (hidden?)")
                return next_step()
            use(rect)

        evaluate(step["rect"], on_value, lambda error: (step_failed(f"{step['kind']}:{step['value']} failed: {error}"), next_step()))

    def snap_element(step, rect):
        pixbuf = full_pixbuf()
        width, height = view.get_allocated_width(), view.get_allocated_height()
        scale = pixbuf.get_width() / width
        margin = args.snap_margin
        left = max(0, int(rect["x"] - margin))
        top = max(0, int(rect["y"] - margin))
        right = min(width, int(rect["x"] + rect["width"] + margin + 0.999))
        bottom = min(height, int(rect["y"] + rect["height"] + margin + 0.999))
        if right <= left or bottom <= top:
            step_failed(f"snap:{step['value']} failed: element is outside the window")
            return next_step()
        cropped = pixbuf.new_subpixbuf(
            int(left * scale), int(top * scale), int((right - left) * scale), int((bottom - top) * scale)
        ).copy()
        save(step["value"], cropped)
        next_step()

    def point_at(step, rect):
        x = rect["x"] + rect["width"] / 2
        y = rect["y"] + rect["height"] / 2
        mouse(Gdk.EventType.MOTION_NOTIFY, x, y)
        if step["kind"] == "click":
            mouse(Gdk.EventType.BUTTON_PRESS, x, y)
            mouse(Gdk.EventType.BUTTON_RELEASE, x, y)
        GLib.timeout_add(INPUT_SETTLE_MS, run_step)

    def wait_for(step, started):
        def on_value(text):
            if text == "true":
                return next_step()
            if (GLib.get_monotonic_time() - started) / 1000 >= args.wait_for_timeout_ms:
                step_failed(f"waitfor:{step['value']} timed out after {args.wait_for_timeout_ms} ms")
                return next_step()
            GLib.timeout_add(args.wait_for_poll_ms, lambda: (wait_for(step, started), False)[1])

        evaluate(step["check"], on_value, lambda error: (step_failed(f"waitfor:{step['value']} failed: {error}"), next_step()))

    def film(step):
        frames = []
        started = GLib.get_monotonic_time() / 1000
        interval = step["durationMs"] / (step["frames"] - 1)

        def store_rect(frame, text):
            frame["rect"] = json.loads(text) if text and text != "null" else None

        def finish_film():
            width, height = view.get_allocated_width(), view.get_allocated_height()
            for index, frame in enumerate(frames):
                path = os.path.join(args.out, f"{args.prefix}{step['value']}.frame-{index}.png")
                frame.pop("pixbuf").savev(path, "png", [], [])
                frame["file"] = path
            emit("film", {
                "name": step["value"],
                "file": os.path.join(args.out, f"{args.prefix}{step['value']}.png"),
                "scale": full_pixbuf().get_width() / width,
                "viewport": {"width": width, "height": height},
                "frames": frames
            })
            next_step()

        def capture():
            now = GLib.get_monotonic_time() / 1000
            frame = {"pixbuf": full_pixbuf(), "time": round(now - started), "rect": None}
            frames.append(frame)
            if step.get("rect"):
                evaluate(step["rect"], lambda text: store_rect(frame, text), lambda _: None)
            if len(frames) < step["frames"]:
                due = started + len(frames) * interval
                GLib.timeout_add(max(0, int(due - GLib.get_monotonic_time() / 1000)), capture)
            else:
                evaluate("0", lambda _: finish_film(), lambda _: finish_film())
            return False

        capture()

    def next_step():
        GLib.idle_add(run_step)

    def run_step():
        if state["index"] >= len(steps):
            return finish()
        step = steps[state["index"]]
        state["index"] += 1
        kind, value = step["kind"], step["value"]

        if kind == "snap":
            if step.get("selector"):
                with_rect(step, lambda rect: snap_element(step, rect))
            else:
                save(value, full_pixbuf())
                next_step()
        elif kind == "film":
            film(step)
        elif kind in ("js", "jsnow"):
            evaluate(value, lambda _: None, lambda error: None if UNSUPPORTED_RESULT in error else emit("error", f"js failed: {error}"))
            if kind == "js":
                GLib.timeout_add(args.js_settle_ms, run_step)
            else:
                next_step()
        elif kind == "wait":
            GLib.timeout_add(int(value), run_step)
        elif kind == "waitfor":
            wait_for(step, GLib.get_monotonic_time())
        elif kind == "resize":
            width, height = (int(part) for part in value.split("x"))
            window.set_size_request(width, height)
            window.resize(width, height)
            GLib.timeout_add(INPUT_SETTLE_MS, run_step)
        elif kind == "print":
            evaluate(
                value,
                lambda text: (emit("print", text), next_step()),
                lambda error: (emit("error", f"print failed: {error}"), next_step())
            )
        elif kind in ("hover", "click"):
            with_rect(step, lambda rect: point_at(step, rect))
        elif kind == "key":
            press(keyval_for(step["key"]), step["modifiers"])
            GLib.timeout_add(INPUT_SETTLE_MS, run_step)
        elif kind == "type":
            for character in value:
                press(Gdk.unicode_to_keyval(ord(character)))
            GLib.timeout_add(INPUT_SETTLE_MS, run_step)
        return False

    def start_steps():
        focus_window()
        if not init_scripts:
            return run_step()
        evaluate(
            args.init_errors,
            lambda text: (emit("init-errors", text), next_step()),
            lambda error: (emit("error", f"init check failed: {error}"), next_step())
        )
        return False

    def on_load_changed(_view, event):
        if event == WebKit2.LoadEvent.FINISHED and not state["started"]:
            state["started"] = True
            GLib.timeout_add(args.load_settle_ms, start_steps)

    def on_load_failed(_view, _event, uri, error):
        emit("error", f"failed to load {uri}: {error.message}")
        return finish(failed=True)

    def on_timeout():
        emit("error", f"timed out after {args.timeout_ms} ms")
        return finish(failed=True)

    view.connect("load-changed", on_load_changed)
    view.connect("load-failed", on_load_failed)
    view.load_uri(args.url)
    GLib.timeout_add(args.timeout_ms, on_timeout)
    Gtk.main()

    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(1 if state["failed"] else 0)


if __name__ == "__main__":
    main()