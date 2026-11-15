// Flipper Counter — a rep/set counter.
//
// Counter screen:
//   right   +1 (hold to auto-repeat)
//   left    -1 (hold to auto-repeat)
//   center  reset to 0
//   back    menu (set target / exit)
//
// Every press at or past the target (30, 31, 32, ...) vibrates with a green
// LED blink, so you know you've hit your number without looking.
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
let MAX_TARGET = 999;

// passed into callbacks via subscribe()'s extra arguments
let state = {
    count: 0,
    target: DEFAULT_TARGET,
};

function counterElements(s) {
    return [
        // "tm" anchors y to the top of the text so the tall big-number font
        // can't clip off the top of the screen
        { element: "string", x: 64, y: 2, align: "tm", font: "big_numbers", text: s.count.toString() },
        { element: "string", x: 64, y: 30, align: "tm", font: "secondary", text: s.count >= s.target ? "Done!" : "/ " + s.target.toString() },
        { element: "button", button: "left", text: "-1" },
        { element: "button", button: "center", text: "Reset" },
        { element: "button", button: "right", text: "+1" },
    ];
}

function menuItems(s) {
    return [
        "Set target: " + s.target.toString(),
        "Exit",
    ];
}

let views = {
    counter: widgetView.makeWith({}, counterElements(state)),
    menu: submenuView.makeWith({ header: "Counter" }, menuItems(state)),
    target: numberInputView.makeWith({
        header: "Set target",
        minValue: 1,
        maxValue: MAX_TARGET,
        defaultValue: DEFAULT_TARGET,
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
        // vibration cue on the target number and everything past it
        if (s.count >= s.target)
            notification.success();
        v.counter.setChildren(counterElements(s));
    } else if (e.key === "left") {
        if (s.count > 0) {
            s.count -= 1;
            v.counter.setChildren(counterElements(s));
        }
    }
}, state, views);

// menu choices: 0 = set target, 1 = exit
eventLoop.subscribe(views.menu.chosen, function (_sub, index, s, v) {
    if (index === 0) {
        v.target.set("defaultValue", s.target);
        gui.viewDispatcher.switchTo(v.target);
    } else {
        eventLoop.stop();
    }
}, state, views);

// target picked on the number keyboard
eventLoop.subscribe(views.target.input, function (_sub, value, s, v) {
    s.target = value;
    // the widget only re-renders when its children change, so redraw with the
    // new target before switching back
    v.counter.setChildren(counterElements(s));
    gui.viewDispatcher.switchTo(v.counter);
}, state, views);

// back button: from the counter open the menu, from menu/target input go back
// to the counter
eventLoop.subscribe(gui.viewDispatcher.navigation, function (_sub, _event, s, v) {
    if (gui.viewDispatcher.currentView === v.counter) {
        v.menu.setChildren(menuItems(s));
        gui.viewDispatcher.switchTo(v.menu);
    } else {
        gui.viewDispatcher.switchTo(v.counter);
    }
}, state, views);

// run app
gui.viewDispatcher.switchTo(views.counter);
eventLoop.run();
