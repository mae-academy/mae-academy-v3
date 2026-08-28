# CircuitJS1 Native Iframe Integration Guide

## Current MAE integration

Circuit Lab tool **A** mounts the original full-page CircuitJS1 application in an iframe. The wrapper forwards only the published startup parameters and does not access the GWT DOM, solver, menus, scopes, sidebars, context menus, or component library. Consequently, the embedded simulator retains its native identity and behavior.

```tsx
<iframe
  title="CircuitJS1 native circuit simulator"
  src="https://www.falstad.com/circuit/circuitjs.html?startCircuit=lrc.txt"
  className="h-screen min-h-[720px] w-full border-0"
  allow="clipboard-read; clipboard-write; fullscreen"
/>
```

The React wrapper forwards these query parameters from Circuit Lab: `cct`, `ctz`, `startCircuit`, `startCircuitLink`, `euroResistors`, `usResistors`, `whiteBackground`, `conventionalCurrent`, `running`, `hideSidebar`, `hideMenu`, `editable`, `positiveColor`, `negativeColor`, and `hideInfoBox`.

For example, open a packaged starter circuit through:

```text
/simulations/circuit-lab/a?startCircuit=lrc.txt
```

## Self-hosting the unmodified distribution

The CircuitJS1 source repository uses GWT and identifies `war/` as the deployment output. The source checkout does not include a current compiled `war/circuitjs1/` module, so compile the upstream project first using its documented Eclipse/GWT workflow. Then copy the complete, **unmodified** output into the React public tree, preserving relative paths:

```text
client/public/circuitjs/
├── circuitjs.html
├── iframe.html
├── lz-string.min.js
├── font/
└── circuitjs1/
    ├── circuitjs1.nocache.js
    ├── *.cache.js
    ├── circuits/
    ├── setuplist.txt
    ├── style.css
    └── gwt/
```

After staging, change only `NATIVE_CIRCUITJS_URL` in `CircuitStudio.tsx` to:

```ts
const NATIVE_CIRCUITJS_URL = "/circuitjs/circuitjs.html";
```

Do not rename or flatten the generated directories, because the native entry page resolves GWT modules, CSS, fonts, and circuit examples by relative URL.

## GPL-2.0 distribution note

CircuitJS1 is GPL-2.0. If you distribute a self-hosted copy, retain the upstream copyright and license texts and satisfy the corresponding-source obligations of the GPL. This note is implementation guidance, not legal advice; have qualified counsel review your distribution model before release.

## References

1. [CircuitJS1 README](https://github.com/sharpie7/circuitjs1#readme)
2. [CircuitJS1 GPL-2.0 text](https://raw.githubusercontent.com/sharpie7/circuitjs1/master/COPYING.txt)
