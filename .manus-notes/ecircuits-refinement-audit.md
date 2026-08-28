# E-Circuits Refinement Audit — August 27, 2026

- `dc-rail` currently has `pos` and `neg` catalog terminals. Its one-terminal replacement must stamp its positive node against the solver reference (`0` / `-1`) rather than create a phantom negative net.
- The live solver, static MNA adapter, documented Tab D compiler, normalized topology graph, and mesh overlay each contain source-terminal assumptions that must be made rail-specific.
- Component clicks currently begin selection/drag only. Terminal hit testing must remain first, while switch and relay clicks latch a manual state and push-button pointer holds set `pressed` until release/cancel.
- Documented Op-Amp input leads are at `y=±100/6`; its polarity labels should sit immediately outside the triangle boundary, not within the triangle. The catalog gain default is currently `1e5`.
- Tab D renders exact raw symbol terminal positions plus a visual lead to each snapped 25 px endpoint. The audit must preserve that architecture and cover dependent sources, transistor families, relays, and transformer variants.
- The shared Properties Panel still renders a `DC MNA` status block, component icons in its headers, and a transform/movement section. The refinement removes these from the sidebar while preserving canvas drag and toolbar transforms.
