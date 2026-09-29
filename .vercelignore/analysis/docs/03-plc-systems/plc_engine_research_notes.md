## External reference notes for PLC execution-engine architecture

This file records externally sourced material gathered on 2026-08-17 for the requested execution-engine specification.

| Source | URL | Relevant verified scope |
|---|---|---|
| Siemens S7-200 System Manual entry | https://support.industry.siemens.com/cs/document/1109582/s7-200-system-manual?dti | Official Siemens support entry for the original S7-200 System Manual. The dynamic page did not expose its manual text in the browser session, so it is cited as the authoritative document locator rather than as a quoted source. |
| Siemens S7-200 SMART System Manual | https://assets.new.siemens.com/siemens/assets/api/uuid:aa045b50-b9f4-4e46-a4c4-ca882c5f00ec/version:1573484388/s7-200-smart-system-manual-en-us.pdf | Official Siemens PDF locating contemporary S7-200-family documentation; search indexing explicitly identifies byte, word, and double-word operations. It is a family-adjacent reference, not a claim that every original S7-200 detail is identical. |
| Local PLC Summary supplied with the project | `/home/ubuntu/upload/PLCSummary.pdf` | Confirms the project instruction vocabulary, I/Q/T/C addressing bounds used in the lab, `IN1`/`IN2` register semantics for function blocks, and the EN input-contact convention. |

### Initial external-fact constraints used for the blueprint

The final architecture will distinguish three levels of authority. The original S7-200 manual entry is the primary product-specific source. The supplied PLC Summary defines the instructional subset and its visual/compiler vocabulary. The S7-200 SMART manual is retained only for general PLC-family concepts where the original-specific manual text is unavailable in the browser session. All execution recommendations beyond explicit manual text will be marked as simulator design choices rather than claimed Siemens behavior.

### Local-current-engine audit

The existing `client/src/lib/plcEngine.ts` is intentionally a small illustrative engine rather than the requested exhaustive model. It stores Boolean I/Q/M values in independent records and numeric AC/VW/VD values in separate maps, so it cannot support byte/word/double-word aliasing. It treats parallel branches as a flat OR of serial contact arrays; it has no nested branch AST, no typed byte store, no input/output image separation, no ENO, no set/reset coils, no edge contacts, and simplified timer/counter logic. The architectural blueprint will specify a replacement-compatible design without editing this project file.

### Explicit instructional semantics in the supplied PLC Summary

The supplied reference defines the supported lab envelope as 14 inputs (`I0.0`–`I1.5`), 10 outputs (`Q0.0`–`Q1.1`), 256 timers (`T0`–`T255`), and 256 counters (`C0`–`C255`). It identifies `AC0`–`AC3` as Siemens general-use registers, `VW` as 16-bit word memory, and `VD` as 32-bit double-word memory. Its instruction tables state that the `x` suffix for MOV, comparison, logical, and arithmetic families varies across I/W/D widths, and that the `EN` contact is loaded before the relevant function instruction. It also specifies the lab instruction signatures: `MOV IN1, IN2`; comparisons with `IN1` and `IN2`; logic and arithmetic blocks with `EN`, `IN1`, `IN2`, and `OUT`; `TON`/`TOFF` with `IN` and `PT`; `TMR` with `IN`, `PT`, and `Reset`; and `CTU`, `CTD`, `CTUD` with their shown count/reset/preset pins.

The reference shows `TMR` as retentive and counter instructions as separate condition loads (`LD CU`, `LD CD`, `LD R`) prior to execution. It does **not** prescribe a simulator-level error-register policy, nested-AST schema, output-image commit model, or host-clock policy. Those elements are therefore documented in the final blueprint as explicit deterministic design decisions.

### Secondary corroboration

The searchable S7-200 quick-reference mirror at `http://newengineeringpractice.blogspot.com/2012/01/siemens-s7-200-plc-quick-reference.html` lists the classical forms `TON Txxx, PT`, `TOF Txxx, PT`, `TONR Txxx, PT`, `CTU Cxxx, PV`, `CTD Cxxx, PV`, and `CTUD Cxxx, PV`; it also lists diagnostic special-memory categories for overflow/illegal value and division-by-zero. This is a non-authoritative mirror and will only be used to motivate the simulator's explicit fault-register policy, not to assert product conformance where the Siemens manual must govern.
