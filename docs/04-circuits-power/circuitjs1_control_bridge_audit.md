# CircuitJS1 External-Control Bridge Audit

## Current integration boundary

Circuit Lab currently embeds `https://www.falstad.com/circuit/circuitjs.html` in an iframe. Because the iframe is hosted on a different origin, the browser's same-origin policy prevents the MAE React host from reading its document, relocating the native menu/toolbar, querying simulator state, or calling native buttons.

## Upstream bridge review

The CircuitJS1 source checkout contains no `postMessage`, `onmessage`, or browser message-listener bridge for host commands. Its browser-facing functions in the reviewed source concern local application functions such as audio, browser download, clipboard, and Electron support; they do not expose a stable external command API. Therefore no supported path exists to fire the native File/Edit/Draw/Scopes/Options/Tools/Circuits menus, toolbar items, Reset, Run/Stop, or sliders from the cross-origin parent.

## Consequence

Moving the native controls out of the iframe while retaining one synchronized simulator requires both of the following:

1. A same-origin copy of the **complete compiled** CircuitJS1 web distribution, including its generated GWT module and relative assets.
2. A small compatibility adapter that either exposes supported command dispatch from the native document or changes the native document layout. This changes the presentation shell of the original application even if the solver and component logic remain untouched.

Without explicit approval for that controlled native-shell adaptation, the only faithful integration is the current unaltered iframe, where all controls remain inside the native application.
