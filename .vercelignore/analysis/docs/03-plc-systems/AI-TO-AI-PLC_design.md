# 🧠 مخطط الذكاء الاصطناعي إلى الذكاء الاصطناعي
# Visual Editor & UI Rendering Blueprint

## نطاق التقرير ومصدر الحقيقة

هذا التقرير يوثق طبقة الواجهة المرئية ومحرر Ladder في الحزمة الموردة `studio.rungs.dev`. التحليل مبني على الحزمة الإنتاجية المنسقة، ولا يعيد بناء واجهة جديدة. أسماء الدوال المختصرة مثل `nj` و`KA` و`VA` هي أسماء ما بعد التحزيم؛ أما عقود البيانات وحقولها وسلوكها فهي مستخرجة من الاستخدام الفعلي داخل الحزمة.

> **الحد الفاصل المعماري:** المحرر لا يرسم مخطط Ladder باستخدام Canvas أو SVG للرسم الهندسي. الرسم الأساسي هو شجرة React تُحوّل إلى عناصر DOM عادية (`div`, `span`, `p`, `button`, `textarea`) وتُرتّب بواسطة CSS Grid وFlexbox و`position: relative/absolute`. توجد عناصر SVG صغيرة للأيقونات العامة فقط، مثل أيقونة التحذير، وليست طبقة رسم للـ ladder.

---

# 1. معمارية الرسم Rendering Technology & Hierarchy

## 1.1 تقنية الرسم الفعلية

الدليل المباشر هو استعمال `Q.jsx("div", ...)` و`Q.jsxs("div", ...)` في مكونات الـ rung والـ circuit والـ wire والـ symbol، إضافة إلى عقود CSS التالية:

```css
.le-canvas                 { overflow: auto; height: 100%; }
.le-rung-tracks-grid       { display: grid; }
.le-rung-main-rail         { display: flex; flex-direction: column; position: relative; }
.le-circuit-root            { display: flex; flex-shrink: 0; }
.le-circuit-content         { display: flex; position: relative; }
.le-circuit-branch-group   { display: flex; position: relative; }
.le-circuit-branch-column  { display: flex; flex-direction: column; }
.le-wire                    { display: flex; flex-direction: column; position: relative; }
.le-instruction-grid        { display: inline-grid; }
```

وعليه فإن النظام **DOM-based**، مع تخطيط مرن يتمدد تلقائياً. لا توجد هندسة رسم تعتمد على قائمة من إحداثيات `x/y` لكل شكل، ولا يوجد SVG path يربط العقد. الخطوط هي عناصر `div` ذات حدود CSS، والتفرعات هي مجموعات DOM متداخلة.

## 1.2 شجرة DOM لجذر اللوحة

المكوّن `cj` هو جذر لوحة المحرر. يثبت `ref` على عنصر يحمل `role="application"`، ويمرر أحداث لوحة المفاتيح والـ context menu، ثم يرسم جميع الـ rungs من `state.rungIds` ويضيف صف الإدراج النهائي.

```text
<div.le-canvas role="application" tabIndex={0|-1}>
  <RungList>
    <Rung key={rungId} />
    <TerminalRungDropZone index={rungIds.length} />
  </RungList>
</div>
```

السلوك البرمجي لجذر اللوحة، بصيغة مطابقة للمنطق المستخرج:

```js
const rungViews = state.rungIds.map((rungId, index) =>
  <nj
    key={rungId}
    rungId={rungId}
    index={index}
    editingComment={editingCommentId === rungId}
    onStartEditComment={() => setEditingCommentId(rungId)}
    onStopEditComment={() => setEditingCommentId(null)}
  />
);

const terminalDropZone = <Une index={state.rungIds.length} />;

<div
  ref={canvasRef}
  className={`le-canvas${simulation.isPaused ? " ld-paused" : ""}`}
  role="application"
  tabIndex={state.selection.selectedIds.length === 0 ? 0 : -1}
  onKeyDown={handleCanvasKeyDown}
>
  <InteractionProvider value={{ copy, cut, paste }}>
    {rungViews}
    {terminalDropZone}
  </InteractionProvider>
</div>
```

## 1.3 شجرة DOM للـ rung الواحد

المكوّن `nj` يحول كائن الـ rung الطبيعي إلى بنية عرض تتكون من gutter، سياق التحديد، main rail، وend rail:

```text
<div.le-rung-container data-ladder-rung-id={rungId}>
  [optional] <div.le-rung-drop-indicator ... />

  <div.le-rung-row>
    <div.le-focus-outline-hidden role="group" aria-label="Rung selector">
      <div.le-rung-context-trigger>
        <div.le-focus-outline-hidden [selected-class]>
          <div.le-rung-number-cell>
            <div.le-rung-number-gutter />
            <p.le-rung-number-text>{index}</p>
            [optional] <div.le-rung-error-wrap>...</div>
          </div>
        </div>
      </div>
      [optional] <button.le-rung-comment-trigger>...</button>
    </div>

    <div.le-rung-tracks-container>
      <div.le-rung-tracks-grid>
        <div.le-rung-main-rail [energized-class]>
          [optional] <div.le-rung-comment-wrap>...</div>
          <Circuit circuitData={rung.circuit} />
        </div>
        <div.le-rung-end-rail [energized-class] />
      </div>
    </div>
  </div>
</div>
```

العرض العمودي لتعليق الـ rung محسوب من عدد أسطر النص، وليس من هندسة رسم مستقلة:

```js
commentLineCount = comment ? comment.split("\n").length : 0;
commentPaddingTop = commentIsVisible
  ? `${Math.max(1, editingLineCount ?? commentLineCount) * 20 + 24}px`
  : undefined;
```

عقد CSS الأساسية للـ rung:

```css
.le-rung-container      { position: relative; padding-right: .25rem; }
.le-rung-row            { display: flex; }
.le-rung-tracks-container { width: 100%; overflow: visible; }
.le-rung-tracks-grid    {
  display: grid;
  grid-template-columns: minmax(max-content, 1fr) auto;
  align-items: stretch;
  width: max-content;
  min-width: 100%;
}
.le-rung-main-rail      {
  display: flex;
  flex-direction: column;
  position: relative;
  min-width: 0;
  padding-bottom: .5rem;
  border-left-style: solid;
  border-left-width: 1px;
}
.le-rung-end-rail       {
  position: relative;
  flex-shrink: 0;
  border-left-style: solid;
  border-left-width: 1px;
  padding-right: .25rem;
}
```

## 1.4 شجرة circuit وbranch

كل circuit يُرسم بواسطة `KA`. المكوّن لا يمر على عناصر تعليمات فقط؛ بل يمر على `circuitData.elements`، ويختار الفرع أو instruction بحسب `element.type`.

```text
<div.le-circuit-root role="group" aria-label="Rung circuit">
  <div.le-circuit-trigger>
    <div.le-circuit-content>
      [optional] <div.le-circuit-branch-level-selector />
      [optional] <div.le-circuit-branch-full-selection-marker />
      [optional] <div.le-circuit-branch-side-line-left />

      <Wire anchorId="start" />

      <Payload>
        for each element:
          if element.type === "INSTRUCTION":
            <InstructionCell />
            <Wire anchorId={element.id} />

          if element.type === "BRANCH":
            <div.le-circuit-branch-group>
              <div.le-circuit-branch-column>
                for each child circuit in element.circuits:
                  <BranchLevelBoundary index={childIndex} />
                  <Circuit childCircuit isBranch />
                <BranchLevelBoundary index={circuits.length} />
              </div>
              <BranchFullSelector />
              <BranchRailHandle />
            </div>
            <Wire anchorId={element.id} />
      </Payload>

      [optional] <div.le-circuit-branch-side-line-right />
    </div>
  </div>
  [optional] <CircuitSelectionMarker />
</div>
```

الـ circuit لا يملك رسماً مستقلاً بخطوط SVG. `le-circuit-content` عبارة عن flex container، و`le-circuit-branch-group` يضم عموداً رأسياً من child circuits. التفرع المتداخل ينتج من **استدعاء KA بشكل recursive** لكل circuit ابن.

العقود الهندسية للفرع:

```css
.le-circuit-root          { display: flex; flex-shrink: 0; }
.le-circuit-trigger       { display: flex; flex-grow: 1; flex-shrink: 0; }
.le-circuit-content       {
  display: flex;
  position: relative;
  align-items: flex-start;
  flex-grow: 1;
  flex-shrink: 0;
  isolation: isolate;
}
.le-circuit-branch-group  {
  display: flex;
  position: relative;
  flex-shrink: 0;
}
.le-circuit-branch-column {
  display: flex;
  flex-direction: column;
  gap: .5rem;
  flex-shrink: 0;
}
```

---

# 2. هندسة الأشكال والمكونات Component Shapes & Symbols

## 2.1 عقدة instruction العامة

المكوّن `VA` هو wrapper التفاعل والتحديد، بينما `IA` هو dispatcher المرئي الذي يختار renderer الشكل بحسب `instructionType`.

```js
// contract used by VA and IA
{
  circuitId: String,
  instructionData: {
    type: "instruction",
    id: String,
    instructionType: String,
    parameters: String[],
    errors: Error[]
  },
  index: Number,
  rungData: RungData,
  isEnergized: Boolean,
  leftEnergized: Boolean,
  rightEnergized: Boolean,
  isSelected: Boolean,
  errorSeverity: undefined | "warning" | "error"
}
```

العنصر الخارجي لكل instruction:

```text
<div.le-draggable-instruction.le-focus-outline-hidden [le-opacity-50 أثناء السحب]>
  <div
    role="group"
    aria-label={`Ladder instruction ${instructionType}`}
    data-ladder-instruction-id={instructionId}
    class="le-draggable-instruction ..."
  >
    <div.le-instruction-grid>
      [optional] selection frame/tag cell
      <VisualInstructionShape />
    </div>
  </div>
</div>
```

`VA` يمرر إلى `jO` عقد السحب التالية:

```js
{
  type: "INSTRUCTION",
  circuitId,
  index,
  instructionData,
  rungId,
  selectedIds: [instructionData.id]
}
```

ويسجل على الـ DOM:

```html
<div data-ladder-instruction-id="...">...</div>
```

## 2.2 عقدة `le-instruction-grid`

العناصر الأساسية لها شبكة داخلية ثابتة من صفين وثلاثة أعمدة:

```css
.le-instruction-grid {
  display: inline-grid;
  grid-template-rows: 1.25rem 1.25rem;
  grid-template-columns: min-content minmax(min-content, 1.25rem) min-content;
}
```

المعنى الهندسي:

```text
row 1:  [Tag/parameter label spans columns 1..3]
row 2:  [left wire] [symbol center] [right wire]
```

عقد الإطار عند تحديد instruction:

```css
.le-instruction-frame-tag-cell   { grid-area: 1 / 1 / auto / 4; }
.le-instruction-frame-symbol-cell {
  grid-area: 2 / 1 / auto / 4;
  position: relative;
}
.le-instruction-frame-fill       { width: 100%; height: 100%; position: absolute; inset: -1px 0; }
```

## 2.3 XIC وXIO وONS

الـ basic symbol يُرسم كمجموعة DOM من خمسة أجزاء: wire start، shape، wire end، مع الشكل الداخلي المناسب.

```text
<div.le-basic-symbol-wire-start>
  <div.le-basic-symbol-wire-line-wrap-start>
    <div.le-basic-symbol-wire-line [left energized] />
  </div>
</div>

<div.le-basic-symbol-shape>
  <ContactShape type="XIC|XIO" />
  // أو ONS:
  <div.le-ons-shape><span>[ONS]</span></div>
</div>

<div.le-basic-symbol-wire-end>
  <div.le-basic-symbol-wire-line-wrap-end>
    <div.le-basic-symbol-wire-line [right energized] />
  </div>
</div>
```

العقد الدقيقة للـ contact:

```text
<ContactShape>
  <div.le-contact-shape-side.le-contact-shape-side-left />
  <div.le-contact-shape-center>
    // XIC: <div.le-contact-shape-center-empty />
    // XIO: <span.le-contact-shape-slash>/</span>
  </div>
  <div.le-contact-shape-side.le-contact-shape-side-right />
</ContactShape>
```

```css
.le-basic-symbol-shape { grid-area: 2 / 2; height: 1.25rem; padding-block: .125rem; display: flex; position: relative; }
.le-contact-shape-side { width: .25rem; border-block: 1px solid; }
.le-contact-shape-side-left { border-right: 1px solid; }
.le-contact-shape-side-right { border-left: 1px solid; }
.le-contact-shape-center { width: .75rem; display: flex; justify-content: center; align-items: center; }
.le-contact-shape-center-empty { width: .75rem; }
.le-contact-shape-slash { font-size: .875rem; line-height: 1.5rem; margin-top: -.125rem; user-select: none; }
```

الـ tag المرئي ليس جزءاً من contact geometry نفسها؛ يعرضه `xj` في instruction grid:

```text
<div.le-basic-tag-name-display>
  <p.le-basic-tag-name-text>{instructionData.parameters[0] ?? ""}</p>
</div>
```

ويظهر عادة في صف الشبكة العلوي فوق contact/coil.

## 2.4 OTE وOTL وOTU

الـ coils تستخدم نفس إطار basic symbol لكن center مختلف:

```text
<div.le-basic-symbol-shape>
  <div.le-basic-symbol-coil-gap />
  <CoilShape label="" | "L" | "U" />
  <div.le-basic-symbol-coil-gap />
</div>
```

```text
<CoilShape>
  <div.le-coil-shape-side.le-coil-shape-side-left />
  <div.le-coil-shape-center>
    <span.le-coil-shape-label>{label}</span>
  </div>
  <div.le-coil-shape-side.le-coil-shape-side-right />
</CoilShape>
```

الخريطة المستخرجة:

```js
const coilLabels = {
  OTL: "L",
  OTU: "U"
};
```

```css
.le-coil-shape-side { width: .5rem; border: 1px solid; }
.le-coil-shape-side-left {
  border-right-width: 0;
  border-top-left-radius: 9999px;
  border-bottom-left-radius: 9999px;
}
.le-coil-shape-side-right {
  border-left-width: 0;
  border-top-right-radius: 9999px;
  border-bottom-right-radius: 9999px;
}
.le-coil-shape-center { width: .5rem; display: flex; justify-content: center; align-items: center; }
.le-coil-shape-label { font-size: .875rem; line-height: 1.25rem; user-select: none; }
```

## 2.5 NOP وAFI

يُعاملان كـ basic symbol خاص، ويظهر النص `[NOP]` أو `[AFI]` في center مع نفس wire start/end. لا يستخدمان block table.

## 2.6 البلوكات الكبيرة Timer/Counter/Math/Compare

الـ block instructions لا تُبنى من contact geometry؛ تُبنى من `fA` عبر descriptors للصفوف. dispatcher `IA` يفرّق بين families:

```js
switch (instructionData.instructionType) {
  case "XIC": case "XIO": case "ONS" case "OTE" case "OTL" case "OTU":
    return <aA ... />; // basic symbol

  case "TON": case "TOF": case "RTO":
    return <PA type={d} rows={timerRows} statusBitsOn={...} ... />;

  case "CTU": case "CTD":
    return <xA type={d} rows={counterRows} statusBitsOn={...} ... />;

  case "RES": return <MA ... />;
  case "OSR": case "OSF": return <kA ... />;
  case "MOVE": return <EA ... />;
  case "NOP": case "AFI": return <vA ... />;
  case "ADD": case "SUB": case "MUL": case "DIV": case "MOD":
  case "ABS": case "SQRT": case "NEG":
  case "AND": case "OR": case "XOR": case "NOT":
  case "MVM": case "CLR": case "BTD":
    return <wA ... />;
  case "EQ": case "NE": case "GT": case "GE": case "LT": case "LE":
    return <gA ... />;
  case "LIMIT": return <bA ... />;
  default: return <AA ... />;
}
```

العقود الوصفية للبلوكات تستعمل `kind`, `label`, `paramIndex`, وحقول runtime الاختيارية:

```js
{
  kind: "operand-with-value",
  label: "Source A",
  paramIndex: 0,
  valueType: "string"
}

{
  kind: "operand",
  label: "Counter",
  paramIndex: 0,
  valueType: "string",
  status: "CU" | "CD"
}

{
  kind: "value",
  label: "Preset" | "Accum",
  basedOnParamIndex: 0,
  memberKey: "PRE" | "ACC",
  status: "DN" | undefined
}
```

أمثلة العروض:

```js
const binaryMathRows = [
  { kind: "operand-with-value", label: "Source A", paramIndex: 0, valueType: "string" },
  { kind: "operand-with-value", label: "Source B", paramIndex: 1, valueType: "string" }
];

const moveRows = [
  { kind: "operand-with-value", label: "Source", paramIndex: 0, valueType: "string" },
  { kind: "operand-with-value", label: "Dest", paramIndex: 1, valueType: "string" }
];

const counterRows = [
  { kind: "operand", label: "Counter", paramIndex: 0, valueType: "string", status: "CU" | "CD" },
  { kind: "value", label: "Preset", basedOnParamIndex: 0, memberKey: "PRE", status: "DN" },
  { kind: "value", label: "Accum", basedOnParamIndex: 0, memberKey: "ACC" }
];
```

CSS block contract:

```css
.le-block-instruction-wrap { display: inline-grid; grid-template-columns: auto auto; }
.le-block-instruction-title {
  display: flex; align-items: center; justify-content: flex-start;
  height: 1.25rem; padding-inline: .5rem; border: 1px solid;
}
.le-block-instruction-subtitle,
.le-block-instruction-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: .75rem; min-height: 1.25rem; padding-inline: .5rem;
  border-inline: 1px solid;
}
.le-block-instruction-row-last { border-bottom: 1px solid; }
.le-block-instruction-value-wrap { display: flex; flex-direction: column; align-items: flex-end; }
.le-block-instruction-value,
.le-block-instruction-runtime-value,
.le-block-instruction-text {
  font-size: .875rem; line-height: 1.25rem;
}
```

الـ tag فوق البلوك يُستمد من `instructionData.parameters[paramIndex]` داخل row descriptor. قيم runtime تُقرأ فقط عند تشغيل المحاكاة، عبر `getTag`, وتُحوّل إلى `statusBitsOn`؛ لذلك الرسم المرئي يعكس AST parameters والحالة التشغيلية معاً.

---

# 3. التوصيل والتفرعات Routing & Branching Logic

## 3.1 التوصيل المتسلسل

التوالي لا يعتمد على إحداثيات مطلقة. لكل instruction يتم إدراج `VA` ثم `PO` مباشرة بعدها. `PO` هو wire anchor بين العناصر:

```js
<InstructionCell ... />
<PO
  full={isLastElement}
  circuitId={circuit.id}
  index={elementIndex}
  anchorId={element.id}
  rungId={rung.id}
  energized={runtimeDecoration?.wireAfter ?? false}
/>
```

الـ wire DOM:

```text
<div.le-wire[data-ladder-wire-circuit-id={circuitId} data-ladder-wire-index={index} ]>
  [optional] <div.le-wire-drop-indicator ... />
  <div.le-wire-line [energized] />
</div>
```

```css
.le-wire {
  display: flex;
  flex-direction: column;
  justify-content: center;
  position: relative;
  height: 3.75rem;
}
.le-wire-width-fixed { width: 1.5rem; flex-shrink: 0; }
.le-wire-width-full { flex-grow: 1; flex-basis: 2rem; }
.le-wire-min-width-default { min-width: 1.5rem; }
.le-wire-min-width-wide { min-width: 2rem; }
.le-wire-line { width: 100%; height: 0; border-top: 1px solid; }
```

النتيجة: طول السلك يحدده flex sizing، والـ wire الأخير قد يتمدد (`full`) لملء المساحة قبل end rail.

## 3.2 التوصيل داخل basic symbol

كل basic symbol يحمل سلكاً داخلياً قبل الشكل وبعده. هذان السلكان لا يحددان الإحداثيات؛ هما خليتان في `le-instruction-grid`:

```text
grid column 1: wire start
              shape center
              wire end: grid column 3
```

الطاقة المرئية منفصلة إلى ثلاث إشارات props:

```js
{
  isEnergized,  // حالة الشكل نفسه
  leftEnergized, // الخط قبل الشكل
  rightEnergized // الخط بعد الشكل
}
```

وتتحول إلى classes:

```js
borderClass = isEnergized ? "ld-border-energized" : selected ? "ld-border-on-selected" : "ld-border-rail";
leftWireClass = leftEnergized ? "ld-wire-energized" : selected ? "ld-wire-on-selected" : "ld-wire";
rightWireClass = rightEnergized ? "ld-wire-energized" : selected ? "ld-wire-on-selected" : "ld-wire";
```

## 3.3 التوازي والتفرع

عند `element.type === "BRANCH"`، يقرأ renderer `element.circuits` ويرسم كل child circuit داخل `le-circuit-branch-column`. بين كل مستويين يظهر boundary/drop zone، وبعد العمود يظهر rail selector وrail handle.

```js
<div className="le-circuit-branch-group">
  <div className="le-circuit-branch-column">
    {branch.circuits.map((childCircuit, index) => (
      <Fragment key={childCircuit.id}>
        <GA
          branchId={branch.id}
          rungId={rung.id}
          index={index}
          levelIds={branch.circuits.map(c => c.id)}
        />
        <KA
          branchContinuation={index < branch.circuits.length - 1}
          branchLevelIndex={index}
          branchTrailingEnergized={branch.circuits.some(UA)}
          circuitData={childCircuit}
          isBranch={true}
          parentBranchId={branch.id}
        />
      </Fragment>
    ))}
    <GA index={branch.circuits.length} ... />
  </div>
  <WA branchId={branch.id} rungData={rung} />
  <Xne branchId={branch.id} />
</div>
<PO anchorId={branch.id} energized={decoration?.wireAfter ?? false} />
```

حساب طاقة نهاية circuit:

```js
function circuitTrailingPower(circuit) {
  const last = circuit.elements[circuit.elements.length - 1];
  return last ? last.wireAfter : circuit.inputPower;
}
```

خطوط الجانب الرأسي للفرع ليست SVG. هي `div` ذات `border-left` وposition absolute داخل `le-circuit-content`:

```css
.le-circuit-branch-side-line {
  position: absolute;
  top: 1.875em;
  bottom: calc(-1.875em - .5rem);
  width: 0;
  border-left: 1px solid;
}
.le-circuit-branch-side-line-left  { left: 0; }
.le-circuit-branch-side-line-right { right: 0; }
```

إذن الترتيب الهندسي هو **layout flow مرن مع خطوط عمودية موضوعة نسبياً داخل حدود الـ content**. لا يتم حساب تقاطع shapes يدوياً؛ ارتفاع العمود والـ gap يحددان المجال الذي تمتد خلاله خطوط الـ branch.

## 3.4 branch-level boundary

كل boundary بين مستويين هو عنصر DOM بعقد إسقاط مستقلة:

```text
<div.le-circuit-branch-level-boundary>
  [optional] <div.le-wire-drop-indicator ... />
</div>
```

```css
.le-circuit-branch-level-boundary {
  position: relative;
  width: 2rem;
  height: .75rem;
  margin-top: -.625rem;
  margin-bottom: -.625rem;
  margin-left: -1rem;
}
```

الـ negative margins تجعل مؤشر boundary يتراكب بصرياً مع الفراغ بين مستويات الفرع دون إدخال فراغ إضافي في layout.

---

# 4. الإحداثيات والقياس Geometry Model

## 4.1 ما هو مرن وما هو مطلق

| الطبقة | النموذج الفعلي |
|---|---|
| ترتيب rungs | Flex/Block داخل canvas |
| عرض main/end rail | CSS Grid columns مع `minmax(max-content, 1fr)` |
| ترتيب عناصر circuit | Flex row |
| ترتيب مستويات الفرع | Flex column مع `gap` |
| wire بين العناصر | Flex item بعرض fixed أو full |
| wire line نفسه | `div` بعرض 100% وحد علوي |
| خطوط branch الجانبية | `position:absolute` نسبية إلى content، بلا إحداثيات عالمية |
| collision/drop geometry | مستطيلات DOM الحية و`getBoundingClientRect` داخل نظام DnD |
| أيقونات التحذير | SVG صغير فقط |

النظام يستخدم absolute positioning محلياً لخطوط branch وبعض overlays، لكنه **لا يستخدم absolute coordinates للرسم الكامل**.

## 4.2 شكل الـ droppable

`vO` يحول descriptor منطقي إلى droppable مسجل في مدير السحب. الـ descriptor يحتوي النوع والهوية والبيانات:

```js
{
  kind: "wire" | "branch-level-boundary" | "rung",
  circuitId?,
  branchId?,
  side?,
  rungId?,
  index?,
  anchorId?,
  levelIds?,
  subtreeIds?
}
```

يُحسب id المرئي للـ drop zone هكذا:

```js
function dropId(data) {
  switch (data.kind) {
    case "wire":
      return `wire-${data.circuitId}-${data.anchorId}`;
    case "branch-level-boundary":
      return `branch-level-boundary-${data.branchId}-${data.levelIds[data.index] ?? "end"}`;
    case "rung":
      return `rung-drop-${data.anchorId}`;
  }
}
```

كل عنصر droppable يضيف:

```html
data-ladder-drop-id="<computed-id>"
```

وعند غياب عنصر DOM الأصلي أثناء clone/drag preview، يبحث النظام عن بديل داخل:

```js
document.querySelector(
  `[data-dnd-placeholder] [data-ladder-drop-id="${dropId}"]`
)
```

---

# 5. السحب والإفلات Drag, Drop & Interaction

## 5.1 أنواع المصادر ومناطق الإسقاط

القبول محدد صراحة عبر `Pne`:

```js
const acceptedDropTypes = {
  wire: [
    "INSTRUCTION",
    "BRANCH_LEVEL",
    "BRANCH_RAIL",
    "TOOL_INSTRUCTION",
    "TOOL_BRANCH"
  ],
  "branch-level-boundary": ["BRANCH_LEVEL", "TOOL_BRANCH_LEVEL"],
  rung: ["RUNG", "TOOL_RUNG"]
};
```

مصادر الأدوات لا تدخل مباشرة إلى AST؛ تتحول إلى actions `addInstruction`, `addBranch`, `addBranchLevel`, أو `addRung`.

## 5.2 تحديد منطقة الإسقاط الصالحة

منطقة الإسقاط لا تُحدد من index بصري فقط. `vO` يبني droppable، ثم `Lne` يفحص موضع المؤشر الحالي مقابل shape المستخرج من عنصر DOM.

المسافة للـ wire:

```js
function distanceToDropTarget(data, rect, pointer) {
  switch (data.kind) {
    case "wire":
      return Math.hypot(
        pointer.x - clamp(pointer.x, rect.left, rect.right),
        pointer.y - (rect.top + rect.height / 2)
      );

    case "branch-level-boundary":
      return Math.hypot(
        pointer.x - (rect.left + rect.width / 2),
        pointer.y - (rect.top + rect.height / 2)
      );

    case "rung":
      return Math.hypot(
        pointer.x - (rect.left + 48),
        pointer.y - (rect.top + 6)
      );
  }
}
```

حد القبول:

```js
const threshold = data.kind === "rung" ? 72 : 48;
if (distance > threshold) return null;
return {
  id: droppable.id,
  value: 1 / (1 + distance),
  type: "Collision",
  priority: "Normal"
};
```

بالنسبة لبعض حالات overlap، يوجد detector إضافي يعتمد على تقاطع الأشكال ومسافة المركز:

```js
pointerIntersection:
  if (droppable.shape.containsPoint(pointer))
    score = 1 / distance(droppable.shape.center, pointer);

shapeIntersection:
  overlap = draggedShape.intersectionArea(droppable.shape);
  score = overlap / (draggedArea + droppableArea - overlap) / centerDistance;
```

## 5.3 تحويل الإسقاط إلى عملية محرر

بعد اجتياز accept/collision، `hO` يرسل العملية إلى mapper حسب نوع الـ target:

```js
function operationForDrop(source, target, session) {
  switch (target.kind) {
    case "wire":
      return wireDropOperation(source, target, session);
    case "branch-level-boundary":
      return branchLevelDropOperation(source, target, session);
    case "rung":
      return rungDropOperation(source, target, session);
  }
}
```

العمليات الأساسية:

```js
// instruction onto wire
{
  type: "moveInstruction" | "moveInstructions" | "addInstruction",
  instructionId?, instructionIds?, instructionType?,
  fromRungId?, toRungId,
  toCircuitId, toIndex,
  copy?
}

// branch level onto boundary
{
  type: "moveBranchLevel" | "reparentBranchLevel" | "addBranchLevel",
  levelId?, branchId?,
  fromRungId?, toRungId,
  toCircuitId?, toBranchId?,
  toIndex,
  copy?
}

// branch rail
{
  type: "moveBranchRail",
  branchId,
  side: "left" | "right",
  target,
  rungId
}

// rung
{
  type: "moveRung" | "addRung",
  fromIndex?, toIndex? | index,
  copy?
}
```

قاعدة إدراج instruction من الأداة:

```js
{
  type: "addInstruction",
  instructionType: tool.instructionType,
  circuitId: target.circuitId,
  rungId: target.rungId,
  index: target.index + 1
}
```

قاعدة النقل داخل نفس circuit تمنع العملية إذا كان الهدف هو نفس الموضع أو الموضع المجاور غير المؤثر:

```js
sameCircuit = source.circuitId === target.circuitId;
noOp = !copy && sameCircuit &&
       (source.index === target.index || source.index === target.index + 1);
return noOp ? null : operation;
```

وقاعدة منع cycle عند نقل branch level:

```js
if (!copy && source.rungId === target.rungId &&
    source.subtreeIds.has(target.circuitId)) {
  return null;
}
```

## 5.4 preview أثناء السحب

الـ circuit payload عند clone يحصل على class:

```css
.le-circuit-level-payload[data-dnd-placeholder="clone"] { opacity: .5; }
```

توجد أيضاً DnD overlay عامة داخل `data-dnd-overlay`، وتستخدم transform يعتمد على initial pointer وbounding rectangle:

```js
transform = {
  x: current.x + (initialPointer.x - initialRect.left) + 12,
  y: current.y + (initialPointer.y - initialRect.top) + 12
};
```

هذا transform خاص بالـ drag preview، وليس إحداثيات رسم ثابتة للـ ladder.

---

# 6. التحديد Selection & Keyboard Interaction

## 6.1 نموذج التحديد

النموذج المحفوظ في state هو:

```js
{
  selectedIds: String[],
  selectedType: null | "RUNG" | "CIRCUIT" | "BRANCH" | "INSTRUCTION",
  anchorId: null | String
}
```

كل طبقة تعرض selected state عبر مقارنة id والنوع، ولا يتم نسخ الشكل أو رسمه في Canvas منفصل.

## 6.2 instruction selection

`VA` ينشئ selection state محلياً من:

```js
isSelected = state.selection.selectedIds.includes(instructionData.id);
selectedType = state.selection.selectedType === "INSTRUCTION";
```

Mouse selection:

```js
selectionMode = event.shiftKey
  ? "range"
  : event.metaKey || event.ctrlKey
    ? "toggle"
    : "replace";

if (!(selectionMode === "replace" && isSelected && selectedIds.length <= 1)) {
  actions.select(instructionId, "INSTRUCTION", selectionMode);
}
```

عند تحديد عنصر واحد:

```text
<div.le-instruction-frame-symbol-cell>
  <div.le-instruction-frame-symbol-fill.ld-bg-selected />
</div>
```

أما حالة focus فتستخدم:

```text
<div
  tabIndex={isSelected ? 0 : -1}
  data-ladder-instruction-focus-host
  class="le-focus-outline-hidden le-instruction-grid"
>
```

## 6.3 circuit/branch/rung selection

العقود المرئية:

```html
<div role="group" aria-label="Rung selector">...</div>
<div role="group" aria-label="Rung circuit">...</div>
<div role="button" aria-label="Full branch selector" data-ladder-branch-id="...">...</div>
<div role="button" aria-label="Branch level N selector" data-ladder-branch-level-id="...">...</div>
```

الفرع الكامل يستخدم selected marker منفصلاً:

```text
<div.le-circuit-branch-full-selection-marker ... />
```

ومستوى الفرع يستخدم:

```text
<div.le-circuit-branch-selection-marker.ld-bg-selected />
```

الـ branch selection يدعم نفس replace/toggle، بينما rung/circuit يدعمان range عند `Shift` بحسب موضع العنصر في القائمة.

## 6.4 keyboard focus

التحديد يضع focus تلقائياً على host المناسب إذا لم يكن focus داخل اللوحة. `R_` يستقبل contract مثل:

```js
{
  focusRef,
  focusKey,
  instructionId?,
  isEditing,
  isSelected,
  selectedIds
}
```

اختصارات اللوحة المستخرجة من `cj`:

```js
Meta/Ctrl + Z       => undo()
Meta/Ctrl + Shift+Z => redo()
Ctrl + Y            => redo()
Meta/Ctrl + A       => selectAll()
Meta/Ctrl + C       => copy()
Meta/Ctrl + X       => cut()
Meta/Ctrl + V       => paste()
Delete/Backspace    => deleteSelection()
Escape              => clearSelection()
```

ولا تُفعّل الاختصارات إذا كان الحدث قادماً من input أو textarea أو contenteditable أو role textbox.

## 6.5 double click وinline edit

عند instruction محدد، الضغط على `Enter` أو كتابة حرف أبجدي يفعّل وضع تحرير mnemonic، بشرط ألا يكون المستخدم داخل input آخر. وضع التحرير يستبدل الشكل بمكوّن `le-symbol-mnemonic-edit`، ثم:

```js
onCommit(newMnemonic) {
  closeEditor();
  focusInstructionHost();
  actions.replaceInstructionType(instructionId, newMnemonic, rungId);
}
```

أما tag/operand edit في البلوكات فيعتمد على rows و`paramIndex`، بحيث ترتبط خانة النص مباشرة بـ `instructionData.parameters[paramIndex]`.

---

# 7. تحويل AST/Normalized Graph إلى رسم تفاعلي

## 7.1 مسار التحويل

الواجهة لا ترسم compiler AST الخام مباشرة. المحرر يحتفظ بتمثيل normalized graph يحتوي rungs مرتبة، وكل rung يملك circuit، وكل circuit يملك elements يمكن أن تكون instructions أو branches.

```js
function renderEditor(state) {
  return state.rungIds
    .map((rungId, index) => renderRung(state.rungs[rungId], index))
    .concat(renderTerminalRungDropZone(state.rungIds.length));
}

function renderRung(rung, index) {
  return {
    type: "DOM_RUNG",
    id: rung.id,
    children: [
      renderRungSelector(rung, index),
      renderRail(rung.circuit)
    ]
  };
}

function renderCircuit(circuit, context) {
  const children = [renderWire({ anchorId: "start", ...context })];

  for (let index = 0; index < circuit.elements.length; index++) {
    const element = circuit.elements[index];

    if (element.type === "INSTRUCTION") {
      children.push(renderInstruction(element, context));
      children.push(renderWire({
        anchorId: element.id,
        index,
        energized: context.decoration?.elements[index]?.wireAfter
      }));
    }

    if (element.type === "BRANCH") {
      children.push(renderBranch(element, context));
      children.push(renderWire({
        anchorId: element.id,
        index,
        energized: context.decoration?.elements[index]?.wireAfter
      }));
    }
  }

  return <div className="le-circuit-root">...</div>;
}

function renderBranch(branch, context) {
  return (
    <div className="le-circuit-branch-group">
      <div className="le-circuit-branch-column">
        {branch.circuits.map((child, index) => (
          <Fragment key={child.id}>
            <BranchLevelBoundary branch={branch} index={index} />
            {renderCircuit(child, {
              ...context,
              isBranch: true,
              parentBranchId: branch.id,
              branchLevelIndex: index
            })}
          </Fragment>
        ))}
        <BranchLevelBoundary branch={branch} index={branch.circuits.length} />
      </div>
      <BranchRailHandle branchId={branch.id} />
      <BranchFullSelector branchId={branch.id} />
    </div>
  );
}
```

## 7.2 قاعدة التحديث

عندما تتغير normalized state، لا تُحرّك DOM nodes يدوياً ولا تُحدّث إحداثيات الرسم. React يعيد تقييم المكونات مع memoized children، ويُعاد بناء الجزء الذي تغيرت مدخلاته. من أمثلة مدخلات إعادة البناء:

```js
instructionData,
isSelected,
isEnergized,
leftEnergized,
rightEnergized,
errorSeverity,
circuitData.elements,
branch.circuits,
state.selection.selectedIds
```

الطاقة التشغيلية تأتي من decoration state المحفوظة في simulation context، وتحوّل فقط إلى classes مثل:

```js
"ld-wire-energized"
"ld-border-energized"
"ld-text-energized"
```

## 7.3 Visual Contract لإضافة شكل جديد

أي instruction جديد يجب أن يلتزم بالعقد التالي كي يندمج مع المحرر الحالي:

```js
{
  instructionType: String,
  instructionData: {
    id: String,
    instructionType: String,
    parameters: String[]
  },
  isSelected: Boolean,
  isEnergized: Boolean,
  leftEnergized: Boolean,
  rightEnergized: Boolean,
  rungId: String,
  errorSeverity?: "warning" | "error"
}
```

ولكي يكون قابلاً للتفاعل يجب أن يوفر:

```js
{
  domRoot: HTMLElement,
  dataLadderInstructionId: instructionData.id,
  selection: {
    mouseDown: replace | toggle | range,
    contextMenu: same selection path,
    keyboardFocus: tabIndex and focusRef
  },
  dragSource: {
    type: "INSTRUCTION",
    circuitId,
    index,
    rungId,
    selectedIds
  },
  visualPorts: {
    left: rendered by left wire cell,
    right: rendered by right wire cell
  }
}
```

ولأي branch جديد يجب أن توجد:

```js
{
  type: "BRANCH",
  id: String,
  circuits: Circuit[],
  branchLevelBoundaryDropZones: circuits.length + 1,
  branchRailHandle: { branchId, side: "left" | "right" },
  subtreeIds: Set<String>
}
```

---

# 8. الخلاصة التنفيذية الصارمة

```text
Normalized ladder graph
  -> rungIds map
  -> nj renders each Rung
  -> main rail + end rail
  -> KA recursively renders Circuit
  -> element.type dispatch:
       INSTRUCTION -> VA -> IA -> basic symbol or block renderer
       BRANCH      -> branch group -> child circuits recursively
  -> PO inserts wire DOM between every payload element
  -> vO registers wire/boundary/rung DOM as droppable targets
  -> DnD collision uses live DOM rectangles and pointer distance
  -> hO maps valid target/source pair to editor action
  -> selection state controls classes, focus hosts, and markers
  -> simulation decoration controls energized classes
```

> **النتيجة الحاسمة:** محرر السلم هو نظام DOM/React/CSS مرن، وليس محرّك Canvas/SVG. الشكل الهندسي ينتج من تداخل Grid للعقدة، Flex للتوالي، Flex column للتفرعات، و`border-left`/`border-top` لعناصر الخطوط. الـ AST/normalized graph هو مصدر ترتيب العقد؛ الـ CSS هو الذي يمنحها أبعادها النهائية؛ وطبقة DnD تستعمل مستطيلات DOM الحية لتحديد مناطق الإسقاط، ثم تعيد النتيجة إلى actions تعدّل graph state.

## الأدلة الأساسية داخل الحزمة

```text
index.pretty.js: 27652-27715  vO / droppable contract
index.pretty.js: 27446-27640  accepted types, drop ids, collision thresholds, action mapping
index.pretty.js: 28906-28976  PO / wire DOM contract
index.pretty.js: 29480-29868  contact and coil DOM shape contracts
index.pretty.js: 32151-32352  basic instruction wrapper
index.pretty.js: 32877-33259  IA mnemonic-to-renderer dispatch
index.pretty.js: 33813-34343  branch-level and recursive circuit rendering
index.pretty.js: 34691-35037  rung DOM hierarchy
index.pretty.js: 35070-35311  canvas root and keyboard/clipboard handling
index-CllXfj6M.css: ladder class contracts for canvas, rails, wires, symbols, blocks, and branches
```
