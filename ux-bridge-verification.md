# E-Circuits UX bridge verification

## 2026-08-24 — initial runtime checks

The live E-Circuits iframe now reports one scrollable library region only: `#toolbox` is `overflow-y: auto` with content taller than its viewport, while the library panel and sidebar host are `overflow: hidden`. The Properties Inspector remains an independent scrollable region. The SVG host computed transform is `none`, confirming that the bridge no longer adds a CSS translation layer above the archived SVG engine.

The native resistor palette control was selected and a workspace placement click was issued as the next validation step. The component graph and inspector state are being checked separately after this placement action.

The initial browser-level placement attempt did not yet create a native SVG label or populate the inspector. The archived parameter dialog remained closed, so the next step is limited to diagnosing the legacy palette-to-canvas event path; no solver or archived bundle change is planned.

The palette button retains the original `SimResistor` mousedown binding and is enabled. The failed placement click was above the actual viewport-relative SVG: the iframe begins at 466 px and the workspace begins 89 px inside it. The next test therefore uses a point within the measured SVG bounds rather than the outer toolbar region.

After the corrected interaction, the extracted library wrapper retained its 472 px height, but the native `#toolbox` switched to `display: none` and therefore had a zero rectangle. This is an editor-native visibility transition rather than nested scrolling; the next correction will restore the extracted palette as a visible flex child while preserving its single internal scroll region.

The source of the collapse is an inline native `display: none` on the reparented popup toolbox. A bridge-level `display: block !important` override was added strictly for the extracted presentation, and the bridge asset query versions were advanced so that the browser receives the current CSS and JavaScript on reload.

After a full iframe reload, the library remained visible and scrollable. A fresh resistor selection and a canvas click within the visible SVG were issued. The next step is inspecting the native event/mode state because the visible graph did not yet expose a new resistor label after that click.

After returning explicitly to Build mode, the native resistor was created, confirming that the legacy placement path remains active. Its rendered position was visibly displaced from the click point, so the remaining pointer fix is now narrowed to calibrated coordinate translation against the native SVG CTM; it does not require a solver or engine replacement.

The CTM-only bridge was loaded for a repeat test. The archived SVG still constructed an empty placement group with a large legacy world translation, indicating that the remaining mismatch is inside the editor's historical placement mode rather than a React/CSS transform. The bridge's custom rotation prototype also attaches duplicate palette event hooks; its duplicate click replay is being removed from the input path before retesting the native mode.

The event probe confirms that the root SVG is available for a passive coordinate capture. The native world group begins with a large historical translation, so the next controlled placement records exactly which client/page values the archived handler receives before any further bridge adjustment.

With the same CTM-local point supplied to both client and page fields, the native editor placed `R1 (10 Ω)` in the expected interior region of the dot grid rather than off-canvas. This confirms that no additional CSS pan, zoom, or scale correction is required. The remaining live check is a direct click on R1 and confirmation that Box 2B renders its editable legacy fields.

The bridge-level continuous solve loop was detached from placement mode, restoring the archived `Simulate` command and keeping the native Build palette stable. A fresh `R1 (100 Ω)` is now present; its native text box was measured to target a precise user click for the remaining Box 2B handoff check.

The native R1 selection path was verified inside the same-origin iframe: the original parameter dialog exposed `R1` and `100`, the docked inspector rendered `Resistor` with Name and Value fields, and a temporary edit to `220` propagated to the native field before the test restored `100`. The final live view shows R1 on the SVG with its fields in Box 2B. Scroll inspection confirms the library wrapper is not scrollable, `#toolbox` is the only scrollable library region, and Box 2B remains independently scrollable when its contents exceed its height.
