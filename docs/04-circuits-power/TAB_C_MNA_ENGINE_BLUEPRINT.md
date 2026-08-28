# AI-to-AI MNA Engine Blueprint — Tab C Legacy Runtime

> **الغرض:** هذا تقرير استخراج **مقروء فقط** عن محرك Tab C الذي يعمل فعليًا في الملف المؤرشف. لا يحتوي على تعديل للمحرك أو اقتراح لتغيير معادلاته. الغاية منه أن يكون أساسًا هندسيًا لبناء DMM وOscilloscope فوق المخرجات الحقيقية للمحرك.

## 0. حكم النطاق: ما هو محرك Tab C فعلًا؟

| طبقة | الملف الفعلي | الحكم الهندسي |
|---|---|---|
| محرر Tab C المحمّل في iframe | `client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js` | **هذا هو المحرك الرياضي الفعلي**؛ يضم graph، المعادلات، حل DC، transient، AC/Bode، واستخراج النتائج. [1] |
| إقلاع المحرر | `client/public/tab-c-legacy/editor/editor.html` | يحمّل `editor-loader` ثم الحزمة المؤرشفة؛ ليس solver منفصلًا. [2] |
| MNA مكتوب بـTypeScript | `client/src/v3-simulator/lib/mnaSolver.ts` | محرك مختلف خاص بمحاكي v3/Tab B. لا تستبدل به Tab C ولا تفترض أن Tab C يستدعيه. [3] |
| `NodalSolver.ts` / `MeshSolver.ts` | `client/src/v3-simulator/lib/` | طبقة تحليل أكاديمي/تعليمي مستقلة فوق محرك v3، وليست تنفيذ Tab C المؤرشف. [4] |

> **نتيجة مهمة للـAI المستقبلي:** لا توجد ملفات `MeshSolver.ts` أو `NodalSolver.ts` على مسار تنفيذ Tab C. بناء جهاز قياس فوق Tab C يجب أن يستهلك graph/runtime المؤرشف وواجهة النتائج الموضحة في القسم 3، لا أن يدمج نماذج TypeScript الخاصة بـv3.

## 1. تمثيل الدائرة من الرسم إلى النظام الرياضي

### 1.1 استخراج الشبكات من SVG/المخطط

يحوّل `zj()` عناصر الأسلاك المتصلة إلى مجموعات nets. ثم يربط labels المسماة بالشبكة، ويعلّم مجموعة الأرضي، ويصدر خريطة تتضمن مجموعات الأسلاك (`Wj`) والأرضي (`eJ`). [5] بعد ذلك يبني `Pb` عقد graph (`Ma`) وفروعًا (`R` ومشتقاته)، ويضيف مصدرًا تلقائيًا لأي اسم عقدة من الشكل `+12V` أو `-5V` إلى `__GND`. [6]

المسار المفاهيمي هو:

$$
\text{SVG elements + wires}
\xrightarrow{\texttt{zj()}}
\text{electrical nets / labels / ground}
\xrightarrow{\texttt{Bj(...)}}
\text{Graph }(\texttt{Pb})
\xrightarrow{\texttt{qs()}}
\text{sparse equation set }(\texttt{zc}).
$$

### 1.2 متجه المجهولات الحقيقي

لا ينشئ Tab C صراحة كتل MNA التقليدية $[G]$, $[B]$, $[C]$, $[D]$ في مصفوفات مرئية للمستخدم. بدلًا من ذلك ينشئ متغيرات حالة رمزية sparse ثم يقلصها. الأنواع الفعلية هي: [7]

| الرمز الداخلي | المعنى الرياضي | مثال |
|---|---|---|
| `z.ea` | متغير غير مشتق | جهد عقدة $V_n$ أو تيار فرع $I_e$ |
| `z.og` | مشتقة متغير `z.ea` | $\frac{dV_n}{dt}$ أو $\frac{dI_e}{dt}$ |
| `z.Yb` | متغير شحنة فرع | $Q_e$ |
| `z.hi` | مشتقة شحنة | $\frac{dQ_e}{dt}=I_e$ |

لذلك يكون متجه الحالة الموسع، بصورة تجريدية،

$$
\mathbf{x}_{\mathrm{TabC}} =
\begin{bmatrix}
\mathbf{v}_{\text{nodes}}\\
\mathbf{i}_{\text{edges}}\\
\mathbf{q}_{\text{capacitors}}\\
\dot{\mathbf{v}}\\
\dot{\mathbf{i}}\\
\dot{\mathbf{q}}
\end{bmatrix},
$$

ثم يختار solver subset غير مشتق للحل الجبري في خطوة التشغيل، ويعيد المشتقات من العلاقة الزمنية. هذا هو المكافئ العام لـMNA/DAE، وليس بالضرورة المتجه المدرسي الأصغر $[\mathbf V;\mathbf I_V]$.

### 1.3 المعادلة والسجل sparse

الكائن `aa` يمثل معادلة affine واحدة:

$$
\sum_j a_j x_j = b,
$$

حيث تحفظ معاملات الطرف الأيسر في `Ba` والحد الأيمن في `lb`. العلم `Th` يعني قيدًا ثابتًا، و`Sh` يعني طرفًا أيسرًا مُثبتًا. [8]

الكائن `zc` يجمع المعادلات، ثم يحذف المتغيرات الثابتة والعلاقات ذات المتغير الواحد/الاثنين، ويعيد كتابة المعادلات المتبقية قبل بناء نظام sparse. [9] هذا التحويل يؤدي وظيفة الاختزال التي قد توصف في نص MNA تقليدي على أنها اختزال كتل أو حذف supernodes، لكنه لا يحتفظ بمتغيرات منفصلة مسماة `G/B/C/D`.

بعد الاختزال تبني `ra.xp()` مصفوفة sparse وRHS:

$$
\mathbf{A}\mathbf{x}=\mathbf{z},
$$

ثم تنفذ `ab.Hq()` factorization عبر `rx()` وحلًا عبر `eu(...)`، مع cache لعامل التحليل عند ثبات خطوة الزمن. [10]

## 2. Matrix assembly والختم الرياضي

### 2.1 علاقات العقد

لعقدة غير أرضي يولد `Ma.Pd()` قانون KCL بجمع تيارات الفروع الخارجة والداخلة. لعقدة الأرضي يضع القيد:

$$
V_{\mathrm{GND}}=0.
$$

المسارات تحفظ اتجاه الفرع من `od` إلى `pd` عند إدراجه في graph. لا يجوز للـDMM تفسير إشارة `I_e` من الاسم الظاهر للمكوّن وحده؛ يجب استعمال اتجاه terminal/edge المسجل. [6] [11]

### 2.2 أختام primitive edges المؤكدة من المصدر

| primitive الفعلي | المعادلة التي يختمها المصدر | الملاحظة |
|---|---|---|
| Resistor `F` | $V_p-V_n-RI_e=0$ | مكافئ $I_e=(V_p-V_n)/R$. [12] |
| Independent current `ea` | $I_e=I_s$ | قيمة المصدر في RHS. [13] |
| Independent voltage `W` | $V_p-V_n=V_s$ | قيد جهد مثالي. [14] |
| Capacitor `xa` | $V_p-V_n-\frac{Q_e}{C}=0$, و$I_e-\dot Q_e=0$ | المتغير الديناميكي هو الشحنة $Q_e$. [15] |
| Inductor `qa` | $V_p-V_n-L\dot I_e=0$ | عند $L=0$ يصبح قيد قصر مثالي. [16] |
| VCCS `sb` | $I_e-g_m(V_{c+}-V_{c-})=0$ | مصدر تيار متحكم بالجهد. [17] |
| VCVS `Z` | $V_p-V_n-A(V_{c+}-V_{c-})=0$ | مصدر جهد متحكم بالجهد. [18] |
| CCCS `nb` | $I_e-\beta I_c=0$ | يستعمل تيار branch control. [19] |
| CCVS `Ob` | $V_p-V_n-R_mI_c=0$ | يستعمل تيار branch control. [20] |
| Ideal switch `Na` | قيد topological يختار حالة الاتصال | يعتمد أيضًا على درجة اتصال العقد لتجنب معادلة عائمة. [21] |
| Resistive switch `ca` | $R_{on}=10^{-15}\,\Omega$, $R_{off}=10^{15}\,\Omega$ | تقريـب عددي للحالتين، لا قصر/فتح لانهائيان حرفيًا. [22] |
| Custom current function `Ua` | $\sum a_jx_j=I_{\mathrm{expr}}$ | معاملات دالة المستخدم تُسجل sparse. [23] |
| Custom voltage function `Ca` | $\sum a_jx_j=V_{\mathrm{expr}}$ | يدعم حدودًا تشمل العقد وفروع التيار. [24] |

### 2.3 ما يقابل $[G]$, $[B]$, $[C]$, $[D]$

في دوائر RLC الخطية يمكن إسقاط هذا النظام على صيغة MNA المعتادة:

$$
\underbrace{\begin{bmatrix}
\mathbf G & \mathbf B\\
\mathbf C & \mathbf D
\end{bmatrix}}_{\mathbf A}
\begin{bmatrix}\mathbf V\\\mathbf I_v\end{bmatrix}
=\begin{bmatrix}\mathbf z_V\\\mathbf z_I\end{bmatrix}.
$$

لكن في Tab C لا توجد مصفوفات منفصلة بهذه الأسماء. المعاملات تتولد من `aa` ثم تختزلها `zc` ثم تحولها `ra.xp()` إلى sparse matrix. لذلك:

| الكتلة النظرية | أصلها في Tab C |
|---|---|
| $\mathbf G$ | معاملات KCL/الفروع المقاومية ومصادر التيار المتحكم بها في `aa.Ba` |
| $\mathbf B,\mathbf C$ | معاملات قيود مصادر الجهد، الفروع ذات التيار المجهول، والـdependent sources |
| $\mathbf D$ | لا يفترض الصفر؛ ينشأ ضمن معادلات الفروع والقيود قبل الاختزال |
| $\mathbf z$ | `aa.lb` ثم `ra.Sg` |

> لا تبنِ DMM/oscilloscope على افتراض أن `G`, `B`, `C`, `D` متاحة كحقول runtime. الواجهة الصحيحة هي graph/نتيجة `Od.sH()`.

## 3. Solver algorithm والاستقرار العددي

### 3.1 DC operating point وغير الخطي

`ya.Vk()` ينشئ system، يفككه/يحله LU، يحدّث الحالة ثم يطلب المعادلات التي تحتاج relinearization. الحد الأقصى الظاهر للحل هو $51$ محاولة ($0\ldots50$). [25]

$$
\mathbf A(\mathbf x^{(k)})\Delta\mathbf x^{(k)}
=\mathbf z(\mathbf x^{(k)}),
\qquad
\mathbf x^{(k+1)}\leftarrow\text{updated graph state}.
$$

من المهم هندسيًا أن المصدر لا يطبق residual certificate صريحًا من شكل $\|A x-z\|_\infty$ في مسار Tab C. إشارات النجاح الفعلية هي `a.vd` (تقارب) و`a.cg` (عدد دورات relinearization). [25] لا تدّعِ أن المحرك يتحقق من determinant أو KVL/KCL residual إلا إذا أضفت طبقة مستقلة لذلك.

### 3.2 Diodes, Op-Amps, Relays, semiconductors

المحرر المرئي يعرض Diodes وOp-Amps وBJT/MOSFET/JFET وRelays وcustom parts. لكن **لا يوجد** في المصدر المتاح ختم عالمي منفصل باسم Shockley diode أو transistor compact model أو ideal op-amp. تُبنى هذه العناصر كـsubcircuits/expressions ثم تدخل primitive graph أعلاه، وتعود المعادلات المتغيرة عبر `update()` لإعادة linearization. [5] [25]

لذلك فإن البيان الصحيح للـAI هو:

1. لا تفبرك معادلة $I_D=I_S(e^{V_D/nV_T}-1)$ أو نموذج BJT/MOSFET محددًا؛ لم يظهر هذا كنموذج عالمي صريح في المصدر المستخرج.
2. للحصول على stamp **لمثيل محدد** من diode/op-amp/relay، حمّل JSON لذلك المخطط، ابنِ graph، ثم افحص معادلاته ونتيجة `Od.sH()`؛ فهذا هو موضع توسع الـsubcircuit الفعلي.
3. المفتاح موجود على مستويين مؤكدين: قيد ideal (`Na`) أو مقاومة حالية شديدة (`ca`). [21] [22]

## 4. التحليل العابر والـAC

### 4.1 Transient: الفرق الخلفي وليس Trapezoidal ظاهرًا

تستبدل `rb.Vo()` متغيرات المشتقة بعلاقة backward difference المأخوذة من المصدر:

$$
\dot x_{k+1}\approx\frac{x_{k+1}-x_k}{\Delta t}.
$$

هذا يظهر صراحة عند وضع معامل المشتقة من فرق الحالة الحالية والسابقة مقسومًا على `a.ga` (خطوة الزمن). [26] لذلك أساس التعويض المكافئ هو **Backward Euler من الدرجة الأولى**، وليس trapezoidal rule؛ لا تظهر أوزان $\frac12$ أو حالة $x_{k-1}$ اللازمة لـtrapezoidal في مسار `rb` المستخرج.

للمكثف:

$$
I_C^{k+1}=C\frac{V_C^{k+1}-V_C^{k}}{\Delta t},
\qquad G_{C,eq}=\frac{C}{\Delta t},
$$

وللمحث:

$$
V_L^{k+1}=L\frac{I_L^{k+1}-I_L^{k}}{\Delta t},
\qquad R_{L,eq}=\frac{L}{\Delta t}.
$$

### 4.2 التحكم بالخطوة والاسترجاع

`rb` يحفظ snapshot من graph/state (`Ng()`)، ويحاول الخطوة، ثم يعيد الحالة بـ`In()` عند فشل التقارب. إذا كانت الخطوة أكبر من حد تكيفي، يخفضها تقريبًا بالنصف ويعيد المحاولة؛ يحتفظ بسجل خطوات مستقبلية في `ah`/`Po`. [26]

نظام الأحداث الرقمية منفصل في `tc.Pa.fe`: queue مرتبة زمنيًا من كائنات `Ka(time,node,value,...)`. [27] لذلك يجمع المحرك analog time stepping وdigital events بدل loop browser frame-based.

### 4.3 AC/Bode

`La` يبني نظامًا مركبًا بحجم مضاعف فعليًا للجزء الحقيقي/التخيلي، ثم ينفذ LU لكل تردد في sweep. [28] لا تستخدم نتيجة Bode كعينات scope زمنية؛ outputها تردد/phasor.

## 5. Observability: الأساس الصحيح للـDMM وOscilloscope

### 5.1 مسارات القراءة المتاحة

| قراءة مطلوبة | موضع الحقيقة في runtime | الواجهة المؤرشفة العملية |
|---|---|---|
| جهد net | `Pb.Ja(node)` / `Ma.Ja()` | `Od.sH().Yn[net].iS` [29] |
| جهد terminal net | نفس جهد net المسند للـterminal | `Od.sH().Di[terminal].fS` عند وجود node [29] |
| تيار branch/terminal | `Pb.bd(edgeName)` | `Od.sH().Di[terminal].iR` [29] |
| زمن transient | `Pb.getTime()` | نقاط الرسم `[time,value]` التي يبنيها مسار transient [30] |
| نجاح/تقارب | `Pb.vd`, `Pb.cg` | `Od.sH().Iq.PR`, `Od.sH().Iq.QR` [29] |

### 5.2 شكل النتيجة الفعلي المقترح للاستهلاك

المفاتيح الآتية هي أسماء minified حقيقية، ولذلك يجب عزلها داخل adapter واضح بدل نشرها في الواجهة:

```ts
interface TabCRawOperatingPoint {
  loaded: true;
  Iq: {
    success: boolean | string;
    PR: boolean;       // relinearization converged
    QR: number;        // relinearization iterations
    mR: number;        // solve elapsed time tracked by timeout helper
  };
  Yn: Record<string, {
    iS: number;        // solved net voltage
    wl: string;        // canonical net name
    Wh: string[];      // aliases
    HR: string;        // "V(net)"
    GR: string[];      // voltage expressions for aliases
  }>;
  Di: Record<string, {
    iR: number;        // solved branch current for terminal edge
    jR: string;        // "I(edge)"
    As: string;        // edge identifier
    lR: string;        // component instance name
    bs: string;        // terminal identifier
    node?: string;
    fS?: number;       // terminal net voltage
    gS?: string;       // "V(node)"
  }>;
}
```

> هذه الواجهة مستنتجة حرفيًا من `Od.sH()`؛ لا تعدّها API عامة مستقرة للحزمة الأصلية. ضعها وراء adapter versioned مع guard لغياب الحقول. [29]

### 5.3 مخطط DMM آمن فوق المحرك

1. ابنِ أو حمّل JSON، ثم استدعِ التشغيل/operating point الأصلي، وليس حسابًا من SVG وحده.
2. اربط طرف RED وBLACK بـcanonical nets من `Yn`.
3. احسب القياس التفاضلي:

$$
V_{\mathrm{DMM}}=V_{\mathrm{red}}-V_{\mathrm{black}}.
$$

4. لتيار branch استخدم `Di[terminal].iR` مع عرض اتجاه terminal (`bs`) بوضوح؛ لا تفترض أن الإشارة تعني دائمًا red-to-black.
5. إذا كانت `Iq.PR=false` أو `Iq.success\ne true`، أظهر **No converged operating point** بدل رقم قياس موثوق.

### 5.4 مخطط Oscilloscope

خلال transient يبني المحرر نقاطًا من الشكل:

$$
(t_k,\;\mathrm{eval}(\text{selected expression},\;\text{graph at }t_k)).
$$

المسار يضيف النقاط إلى arrays محلية ويحتفظ فقط بسلسلة زمنية للرسم المختار. [30] لبناء scope حقيقي، اشترك في selected expressions مثل $V(n)$ أو $I(edge)$، واجمع السلسلة في adapter مع policy للحجم/decimation. لا تستخرج trace من SVG أو من CSS grid.

## 6. ما يفعله كل مكوّن مرئي — بيان كامل دون اختراع

| فئة المكتبة | الحقيقة الرياضية المصدرية |
|---|---|
| Resistor / Capacitor / Inductor | تتحول إلى primitive stamps المؤكدة في القسم 2.2. |
| DC/AC/Pulse/PWL/CSV/function sources | القيم الزمنية/التعبيرات تقيم داخل parameters/expressions؛ المصدر في النهاية يختم current أو voltage primitive أو custom function equation. [23] [24] |
| VCVS/VCCS/CCVS/CCCS | لها primitive stamps صريحة في القسم 2.2. |
| Diodes, BJTs, MOSFETs, JFETs, Op-Amps, Relays, Transformers, custom devices | ليس لها stamp عالمي مسمى منفصل في المصدر المتاح؛ يتم توسيعها إلى subcircuit/primitives، وقد تعيد `update()` معادلاتها بين iterations. يجب introspection لمثيل JSON المحدد للحصول على stampsه الفعلية. |
| Switches | primitive ideal أو resistive switch مؤكد. |
| Digital primitives/gates | تعالج ضمن event queue الرقمية `tc.Pa.fe` ومع D2A/A2D adapters؛ ليست مصفوفة MNA analog بحد ذاتها. [27] |
| Probes / graph outputs / plots | عناصر observability؛ تطلب expressions وتخزن points، ولا تضيف stamp فيزيائيًا بحد ذاتها. [30] |
| Labels / wires / ground / node names / text | عناصر topology/metadata. `zj()` يدمج wires إلى nets و`ground` يحدد المرجع. [5] |

## 7. قواعد تنفيذ للـAI الذي سيبني الأجهزة

1. **لا تعدّل الحزمة المؤرشفة.** أنشئ bridge adapter خارجها.
2. **لا تستخدم `mnaSolver.ts` لنتيجة Tab C.** هو محرك v3 منفصل.
3. **لا تنسب Trapezoidal أو Newton-Raphson diode equation إلى Tab C من دون فحص subcircuit.** المتاح يؤكد iterative relinearization وbackward difference فقط.
4. **اقرأ الجهد/التيار من `Od.sH()` أو من graph بعد حل أصلي ناجح.**
5. **احترم canonical net aliases** في `Yn`; الطرفان المرئيان قد ينتميان لنفس net.
6. **اربط قنوات scope بتعابير أصلية** $V(\cdot)$ و$I(\cdot)$، واحفظ timestamps التي يصدرها transient solver.

## References

[1]: [Tab C compiled runtime — graph, sparse equations, solvers, and export helpers](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js)

[2]: [Tab C editor bootstrap](client/public/tab-c-legacy/editor/editor.html)

[3]: [Separate v3 TypeScript MNA solver](client/src/v3-simulator/lib/mnaSolver.ts)

[4]: [Separate v3 nodal analysis presentation layer](client/src/v3-simulator/lib/NodalSolver.ts)

[5]: [Tab C visual-net extraction and JSON hook](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L935-L939)

[6]: [Tab C graph construction and equation assembly](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L289-L310)

[7]: [Tab C equation-source variable taxonomy](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L336-L337)

[8]: [Affine equation representation](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L269-L271)

[9]: [Equation-set reduction and substitution](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L272-L289)

[10]: [Sparse matrix construction, LU factorization, and solve](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L311-L313)

[11]: [Node KCL and ground constraint](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L314-L315)

[12]: [Resistor edge stamp](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L216-L217)

[13]: [Current-source edge stamp](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L209-L210)

[14]: [Voltage-source edge stamp](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L224-L225)

[15]: [Capacitor charge-state and current-derivative equations](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L204-L206)

[16]: [Inductor current-derivative equation](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L213-L214)

[17]: [VCCS edge stamp](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L221-L222)

[18]: [VCVS edge stamp](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L222-L224)

[19]: [CCCS edge stamp](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L206-L207)

[20]: [CCVS edge stamp](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L207-L209)

[21]: [Ideal-switch constraint stamp](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L217-L219)

[22]: [Resistive-switch parameters and stamp](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L219-L221)

[23]: [Custom-current function stamp](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L210-L212)

[24]: [Custom-voltage function stamp](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L211-L213)

[25]: [Operating-point iteration and LU solve](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L316-L328)

[26]: [Transient solver, backward-difference derivative update, rollback, and adaptive step control](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L339-L346)

[27]: [Digital event queue and state transitions](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L176-L201)

[28]: [Complex AC/Bode LU solver](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L225-L231)

[29]: [Machine-readable operating-point voltage/current extraction](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L1661-L1663)

[30]: [Transient sample collection and plot output](client/public/tab-c-legacy/assets/editor/editor-compiled-1784151610.js#L954-L963)
