# Circuit Lab Tab C — Legacy Iframe Boundary

The supplied legacy archive was inspected statically and is hosted only as an iframe document. No legacy stylesheet or JavaScript is imported into React.

| Item | Isolated location | Treatment |
|---|---|---|
| Legacy entry document | `client/public/tab-c-legacy/editor/editor.html` | Renamed from the archive's extensionless `editor` entry and served as a static document. |
| Legacy styles | `client/public/tab-c-legacy/assets/css/` and `assets/editor/` | Loaded only by `editor.html`, with its local paths rewritten relatively. |
| Legacy JavaScript | `client/public/tab-c-legacy/assets/js/` and `assets/editor/` | Loaded only by the iframe document. React does not import or execute either file. |
| Legacy images | `client/public/tab-c-legacy/assets/images/` | Preserved under the static asset boundary. |
| Analytics bootstrap | Removed from the staged entry document | Prevents the embedded document from invoking the archive's unavailable analytics endpoint. |

The React shell mounts the legacy document at `/tab-c-legacy/editor/editor.html` in `SimulatorTabC.tsx`. The iframe permits the legacy simulator's scripts and same-origin browser APIs while forbidding popup and top-level-navigation capabilities. Its own document boundary prevents global CSS selectors, script globals, and DOM changes from leaking into Tabs A or B.

## Static-entry verification

The staged editor URL resolves and renders its native CircuitLab startup screen using the packaged stylesheet. The first static check showed that the legacy document remains on its own `Starting…` splash, which is expected to be investigated independently of the React shell. No console error was emitted by the top-level isolated document during this initial check; the React application itself remains unaffected because none of the legacy files is imported into its module graph.

After the editor's own loader delay, the legacy toolbar, component library, canvas, and mode controls mounted successfully. The same editor also mounts through `/simulations/circuit-lab/c` beneath the MAE Tab C wrapper, confirming that the three-tab route does not alter Tabs A or B. A legacy-only account-status request receives the React application's HTML fallback and therefore reports a JSON parse message inside the iframe; this is a compatibility concern inside the legacy boundary, not a React runtime error.

The legacy loader's optional account-identification bootstrap was removed from the staged copy because the archive does not include a matching account endpoint. The editor still reaches its working canvas; any remaining account-status notice is confined to the legacy UI and will be treated as a legacy compatibility indication rather than being surfaced in the MAE React shell.

The final staged entry adds an iframe-local response for the legacy `/accounts/_userinfo/` request with the expected signed-out JSON shape. Reloading Tab C then mounted the same legacy toolbar and canvas without the account-status parse notice. This compatibility response is limited to the iframe document and does not use, modify, or expose React application state.

## Existing-tab regression check

After Tab C was integrated, `/simulations/circuit-lab/a` still rendered its original topology controls, import/export actions, component library, grid workspace, and analysis panels. `/simulations/circuit-lab/b` still rendered its verified ElectroLab workspace with the existing component catalog, local canvas controls, solver guidance, and measurement controls. Both routes shared the new three-tab switcher but retained their distinct components and state boundaries.

```text
client/public/tab-c-legacy/
├── editor/
│   └── editor.html
└── assets/
    ├── css/
    │   └── public-1784151610.css
    ├── editor/
    │   ├── SimGuiStyle-1784151610.css
    │   ├── editor-compiled-1784151610.js
    │   └── editor-loader-1784151610.js
    ├── images/
    │   ├── ajax_preloader.gif
    │   ├── gridcell_200.png
    │   ├── topbar_logo_40_2x.png
    │   └── topbar_logo_60_2x.png
    └── js/
        ├── editorutil-1784151638.js
        └── google_analytics.js
```
