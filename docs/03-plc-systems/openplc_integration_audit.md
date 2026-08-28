## OpenPLC Editor integration audit

Date reviewed: 2026-08-17.

| Topic | Finding | Implementation consequence |
|---|---|---|
| Repository identity | `Autonomy-Logic/openplc-editor` describes itself as an IDE for authoring programs for the OpenPLC Runtime. | MAE Academy will borrow only high-level editor/runtime separation concepts, not upstream implementation code. |
| Development shape | The repository is an actively maintained desktop/editor project with a large `src` tree and a TypeScript-heavy language mix. | It is not a drop-in library for a React static site; the MAE engine remains a browser-local TypeScript module. |
| Testing philosophy | Its README exposes separate unit and end-to-end test commands. | The MAE rewrite adopts an equivalent separation: pure engine tests before visual canvas checks. |
| License | GitHub identifies the repository as GPL-3.0. | Direct source extraction/translation into this project would create GPL compliance obligations. This task must therefore use an independent clean-room implementation informed by observable architecture and IEC/S7-200 requirements, not copied or translated source. |

### Allowed design influences

The clean-room design may use high-level, non-expressive ideas common to PLC editors: an immutable graphical program model, explicitly connected nodes, compiler/export separation, deterministic scan evaluation, and testable runtime boundaries. It will not copy file layouts, source text, class/function names, or implementation algorithms from OpenPLC Editor.

### Architectural influence recorded from public module boundaries

The repository's public `src` tree separates `frontend`, `backend`, `main`, `middleware`, `types`, test directories, and an architecture directory. MAE will adopt only the generic boundary principle: the ladder canvas owns interaction state; an engine module owns normalized program data and scan state; and a narrow bridge adapts engine trace data to SVG styling. The MAE implementation remains a single browser-local TypeScript domain and will not reproduce OpenPLC's module names, desktop process model, or compiler source.

### Sources

- Repository landing page: https://github.com/Autonomy-Logic/openplc-editor
- README: https://raw.githubusercontent.com/Autonomy-Logic/openplc-editor/development/README.md
