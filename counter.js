// Flipper Counter — a rep/set counter.
//
// Counter screen:
//   right   +1 (hold to auto-repeat)
//   left    -1 (hold to auto-repeat)
//   center  reset to 0
//   back    menu (mode / set size / set target / exit)
//
// Every press at or past the target vibrates, so you know you've hit your
// number without looking. The counter line also switches from `/ 30` to
// `Done!`.
//
// Two counting modes (toggled from the menu, in-memory only):
//   - simple count: one buzz on every press at or past the target
//   - rep sets: a single buzz on every Nth press (checkpoint), and a distinct
//     double buzz at the target and every press past it. N is configured via
//     "Set size", which only appears in this mode. Built for things like
//     "rotate ankle 5×, then 5× the other way, until 30": count presses by
//     ear, no screen-watching.
//
// mjs engine rules — keep following these, they can't be seen from the types:
//   - no closures: callbacks get state via subscribe()'s extra arguments,
//     and SDK view objects are used directly instead of being wrapped
//   - native functions read their module context from `this`, so always call
//     them as methods: eventLoop.subscribe(...), notification.success(...)
//   - no arrow functions, no template literals, no destructuring, no `var`,
//     no method shorthand in object literals, no `==`
//   - no implicit number→string conversion: use .toString()

let eventLoop = require("event_loop");
let gui = require("gui");
let widgetView = require("gui/widget");
let submenuView = require("gui/submenu");
let numberInputView = require("gui/number_input");
let notification = require("notification");

let DEFAULT_TARGET = 30;
let DEFAULT_SET_SIZE = 5;
let MAX_TARGET = 999;

// passed into callbacks via subscribe()'s extra arguments
let state = {
    count: 0,
    target: DEFAULT_TARGET,
    setSize: DEFAULT_SET_SIZE,
    setsMode: false,
};

function counterElements(s) {
    let elements = [
        // "tm" anchors y to the top of the text so the tall big-number font
        // can't clip off the top of the screen
        { element: "string", x: 64, y: 2, align: "tm", font: "big_numbers", text: s.count.toString() },
        // the target line sits in a small gap right under the big number —
        // number + target read as one unit in both modes, and the bar (when
        // present) gets its own zone below
        { element: "string", x: 64, y: 22, align: "tm", font: "secondary", text: s.count >= s.target ? "Done!" : "/ " + s.target.toString() },
        { element: "button", button: "left", text: "-1" },
        { element: "button", button: "center", text: "Reset" },
        { element: "button", button: "right", text: "+1" },
    ];

    if (s.setsMode) {
        // per-set progress bar: fills across the current set, and completing
        // a set restarts it empty — the checkpoint buzz already announced the
        // finish, so the next glance is about the next set. only the target
        // (and anything past it) shows a full bar. the last set can be shorter
        // than setSize when the target isn't a multiple, so its denominator
        // scales down
        let pos = s.count;
        let setStart = 0;
        while (pos >= s.setSize) {
            pos -= s.setSize;
            setStart += s.setSize;
        }
        let setLen = s.setSize;
        if (setStart + setLen > s.target) {
            setLen = s.target - setStart;
        }
        let fillW = 0;
        if (s.count >= s.target) {
            fillW = 88;
        } else {
            // fraction of the current set, scaled to the bar's full width
            // (the firmware truncates the fractional width to whole pixels)
            fillW = (pos * 88) / setLen;
        }
        // centered in the space between the target line and the footer
        // buttons
        elements.push({ element: "rect", x: 20, y: 38, w: 88, h: 5, radius: 2, fill: false });
        // the fill shares the outline's geometry so a full bar coincides with
        // it and partial bars keep a rounded cap. a zero-width rect renders as
        // an endless smear on this firmware, and the corner rounding needs a
        // few pixels, so narrow fills step the radius down
        if (fillW >= 2) {
            let fillRadius = fillW >= 6 ? 2 : 1;
            elements.push({ element: "rect", x: 20, y: 38, w: fillW, h: 5, radius: fillRadius, fill: true });
        }
    }

    return elements;
}

// the set-size entry only exists in rep-sets mode, so the chosen-index
// dispatch below must branch on s.setsMode the same way
function menuItems(s) {
    let items = [
        "Mode: " + (s.setsMode ? "rep sets" : "simple count"),
    ];
    if (s.setsMode) {
        items.push("Set size: " + s.setSize.toString());
    }
    items.push("Set target: " + s.target.toString());
    items.push("Exit");
    return items;
}

let views = {
    counter: widgetView.makeWith({}, counterElements(state)),
    menu: submenuView.makeWith({}, menuItems(state)),
    targetInput: numberInputView.makeWith({
        header: "Set target",
        minValue: 1,
        maxValue: MAX_TARGET,
        defaultValue: DEFAULT_TARGET,
    }),
    sizeInput: numberInputView.makeWith({
        header: "Set size",
        minValue: 1,
        maxValue: MAX_TARGET,
        defaultValue: DEFAULT_SET_SIZE,
    }),
};

// count up / down / reset
eventLoop.subscribe(views.counter.button, function (_sub, e, s, v) {
    if (e.key === "center") {
        // only on press — holding center would otherwise re-blink every repeat
        if (e.type === "press") {
            s.count = 0;
            notification.blink("blue", "short");
            v.counter.setChildren(counterElements(s));
        }
        return;
    }

    // left/right: single presses and auto-repeat while held
    if (e.type !== "press" && e.type !== "repeat") return;

    if (e.key === "right") {
        s.count += 1;
        // target press: checked first so milestone buzzes can't shadow it.
        // rep-sets mode marks it with a distinct double buzz (green then red
        // flash); simple count keeps the single buzz
        if (s.count >= s.target) {
            if (s.setsMode) {
                notification.error();
            } else {
                notification.success();
            }
        } else if (s.setsMode && (s.count % s.setSize) === 0) {
            // checkpoint buzz on every Nth press
            notification.success();
        }
        v.counter.setChildren(counterElements(s));
    } else if (e.key === "left") {
        if (s.count > 0) {
            s.count -= 1;
            v.counter.setChildren(counterElements(s));
        }
    }
}, state, views);

// menu choices — indices line up with menuItems(); set size only exists in
// rep-sets mode, so the indices shift between modes
eventLoop.subscribe(views.menu.chosen, function (_sub, index, s, v) {
    if (index === 0) {
        // mode toggle: rebuild items in place so the label and the
        // (dis)appearing set-size entry show immediately
        s.setsMode = !s.setsMode;
        // rep-sets mode requires at least one full set of target
        if (s.setsMode && s.target < s.setSize) {
            s.target = s.setSize;
        }
        v.menu.setChildren(menuItems(s));
        // the counter screen gains/loses the bar with the mode
        v.counter.setChildren(counterElements(s));
        return;
    }

    if (s.setsMode) {
        if (index === 1) {
            v.sizeInput.set("defaultValue", s.setSize);
            gui.viewDispatcher.switchTo(v.sizeInput);
            return;
        }
        if (index === 2) {
            v.targetInput.set("defaultValue", s.target);
            // rep-sets mode: the target can't be below one full set
            v.targetInput.set("minValue", s.setSize);
            gui.viewDispatcher.switchTo(v.targetInput);
            return;
        }
    } else {
        if (index === 1) {
            v.targetInput.set("defaultValue", s.target);
            // simple mode ignores set size; reset to the full range in case a
            // rep-sets visit raised the keyboard's minimum
            v.targetInput.set("minValue", 1);
            gui.viewDispatcher.switchTo(v.targetInput);
            return;
        }
    }

    eventLoop.stop();
}, state, views);

// set size picked on the number keyboard (rep-sets mode only)
eventLoop.subscribe(views.sizeInput.input, function (_sub, value, s, v) {
    // a set can't be longer than the whole goal. the firmware clamps typing
    // on maxValue but only draws a cross for minValue, so the upper bound is
    // enforced here instead: reject with feedback and stay on the keyboard
    if (value > s.target) {
        notification.error();
        return;
    }
    s.setSize = value;
    // the bar scales with the set size, so redraw before heading back
    v.counter.setChildren(counterElements(s));
    gui.viewDispatcher.switchTo(v.counter);
}, state, views);

// target picked on the number keyboard
eventLoop.subscribe(views.targetInput.input, function (_sub, value, s, v) {
    s.target = value;
    // the widget only re-renders when its children change, so redraw with the
    // new target before switching back
    v.counter.setChildren(counterElements(s));
    gui.viewDispatcher.switchTo(v.counter);
}, state, views);

// back button: counter -> menu, menu -> counter, number inputs -> menu
// (Back on a keyboard cancels — values only apply on OK)
eventLoop.subscribe(gui.viewDispatcher.navigation, function (_sub, _event, s, v) {
    if (gui.viewDispatcher.currentView === v.counter) {
        v.menu.setChildren(menuItems(s));
        gui.viewDispatcher.switchTo(v.menu);
    } else if (gui.viewDispatcher.currentView === v.menu) {
        gui.viewDispatcher.switchTo(v.counter);
    } else {
        gui.viewDispatcher.switchTo(v.menu);
    }
}, state, views);

// run app
gui.viewDispatcher.switchTo(views.counter);
eventLoop.run();
