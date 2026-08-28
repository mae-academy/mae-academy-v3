# PLC Ladder Backend Contract — August 27, 2026

The supplied blueprint requires a pure backend boundary between the normalized editor state and a compiler AST. The execution path is deterministic: parse source into `LDProgram`/`LDRung`/`LDCircuit`/`LDBranch`/`LDInstruction`, perform semantic validation, produce generated JavaScript, then execute against a `Map` of variables and a frozen runtime-function table. Branches must receive the same incoming rung power and OR their independent leg results; all rung elements execute left-to-right.

Each startup performs a prescan before normal scans. Prescan sets instruction-safe initial state, including one-shot storage, timer accumulators/status, and counter edge latches. Normal scans advance in whole microsecond scan periods, retain hidden timer/counter/one-shot state inside structured values, and return a trace plus structured diagnostics. Program tags must remain partitioned by parameter versus local usage on read-back despite unified execution variables.

The first implementation is backend-only. The later Ladder editor must remain DOM/CSS Grid/Flexbox based, with nested circuit branches, rather than using canvas or SVG drawing for rung construction.
