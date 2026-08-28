## PLC Ladder Reference Notes

Source: `/home/ubuntu/upload/PLCSummary.pdf`

### Addressing and memory
- S7-200 addressing summary shown in the PDF: 14 inputs (`I0.0–I0.7`, `I1.0–I1.5`), 10 outputs (`Q0.0–Q0.7`, `Q1.0–Q1.1`), timer range `T0–T255`, counter range `C0–C255`.
- General-use data in Siemens notation is shown as `AC0–AC3`; 16-bit word as `VW`; 32-bit double-word as `VD`.

### Basic ladder symbol geometry
- Normally open contact is drawn as two parallel vertical lines with the rung line stopping at each side: `---| |---`.
- Normally closed contact uses the same geometry with a diagonal strike through the contact: `---|/|---`.
- Output coil is drawn as a conventional coil/circle at the far right of the rung near the right rail.
- Function blocks use clean rectangles with labeled left input pins and right output pins.

### IL examples shown in the PDF
- NO contact example pairs with `LD I0.x`.
- NC contact example pairs with `LDN I0.x`.
- Coil example pairs with `= Q0.x`.
- MOV example uses `LD EN` then `MOV IN1, IN2`.

### Instruction visual style cues
- Comparison instructions show compact inline compare notation between two input contacts, with IL examples such as `LD x== IN1, IN2`, `LD x>= IN1, IN2`, `LD x> IN1, IN2`, `LD x<= IN1, IN2`, `LD x< IN1, IN2`.
- Logical and arithmetic instructions are represented as narrow function blocks with visible `EN`, `IN1`, `IN2`, and `OUT` pins.
- Arithmetic examples include `ADD-x`, `SUB-x`, `MUL-x`, `DIV-x`, `SQRT`, with IL sequences beginning from `LD EN` then operation line.

### Rendering implications for the SVG canvas
- Continuous left and right vertical power rails must span the entire ladder canvas height.
- Each rung must be drawn as a continuous horizontal conductor from left rail to right rail, with symbols intersecting the wire cleanly instead of sitting inside generic boxes.
- Parallel branches should use orthogonal 90-degree branch-down and branch-return connectors only.
- Address text should use monospace alignment for `I`, `Q`, `VW`, `VD`, `T`, and `C` labels; UI chrome may continue using Tajawal.
