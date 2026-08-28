## PLC Summary audit notes

Source: `/home/ubuntu/upload/PLCSummary.pdf`, pages 3–7.

### Shared simulator-title constraint from user

- The PLC page title must return to the same centered simulation heading pattern used by the other simulation detail pages.
- No dedicated framed title box should be introduced for the PLC page header.

### Ladder basics from the reference

- **NO contact**: two vertical blades with the horizontal wire stopping at the outside edges of the blades.
- **NC contact**: same NO geometry plus a diagonal slash passing between the two blades.
- **Coil**: round/parenthesis-style output coil, with the address shown above the coil.

### Siemens function-block pin conventions from the reference

- **MOV-x** block: left pin labels `EN`; right pin label `OUT`; block instruction line is `MOV IN1, IN2` in IL, so the visual block must still expose the source/destination semantics cleanly.
- **Compare blocks** (`==x`, `>=x`, `>x`, `<=x`, `<x`): not boxed like arithmetic/logic blocks; they are inline comparison symbols placed between two small terminals labeled `IN1` and `IN2`.
- **Logic blocks**:
  - `xAND-x`: left pins `EN`, `IN1`, `IN2`; right pin `OUT`.
  - `xOR-x`: left pins `EN`, `IN1`, `IN2`; right pin `OUT`.
  - `xXOR-x`: left pins `EN`, `IN1`, `IN2`; right pin `OUT`.
  - `xNOT-x`: left pins `EN`, `IN`; right pin `OUT`.
- **Arithmetic blocks**:
  - `ADD-x`, `SUB-x`, `MUL-x`, `DIV-x`: left pins `EN`, `IN1`, `IN2`; right pin `OUT`.
  - `SQRT`: left pins `EN`, `IN`; right pin `OUT`.
- **Timers**:
  - `TON`: top internal label `Txx`, title `TON`; left pin `IN`; bottom-left pin `PT`; right pin present; enable behavior is represented by the input contact logic, not by an extra rendered `EN` pin on the Siemens block.
  - `TOFF`: same visible pin structure as TON: `IN`, `PT`, right output pin.
  - `TMR`: left pins `IN`, `PT`, `Reset`; right output pin.
- **Counters**:
  - `CTU`: left pins `CU`, `R`, `PV`; right output pin.
  - `CTD`: left pins `CD`, `R`, `PV`; right output pin.
  - `CTUD`: left pins `CU`, `CD`, `R`, `PV`; right output pin.

### Accuracy constraints for implementation

- The rendering correction must affect only the SVG/UI layer and must not change `plcEngine.ts` execution logic.
- Timer/counter/function-block pin counts and labels must match the reference exactly in the visual renderer.
