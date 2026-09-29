# وثيقة المعمارية الموحدة — MAE Academy

**الإصدار التشغيلي:** v3-2 synced baseline  
**الغرض:** مرجع هندسي واحد يصف البنية الحالية لمنصة MAE Academy، وحدود ملكية الوحدات، ومسارات المحاكاة، والعقود المرئية والحسابية الواجب احترامها عند التوسعة.

> هذه الوثيقة تصف ما هو موجود ومربوط في الشفرة الحالية. وهي لا تدّعي اكتمال نموذج فيزيائي أو تعليمي لا توجد له مواصفة ومعادلات معتمدة داخل المشروع.

## 1. المبادئ المعمارية غير القابلة للتفاوض

منصة MAE Academy مبنية بواجهة React وTypeScript وVite، مع Tailwind وFramer Motion. تتولى صفحة المسار العامة الغلاف والتنقل، بينما تملك كل أداة حالتها ومنطقها الحسابي. لا يجوز ربط محركات المحاكاة الحساسة بحالة React العامة ما لم يكن الارتباط ضروريًا لعرض نتيجة أو قراءة مدخل مستخدم.

| المبدأ | العقد التنفيذي |
|---|---|
| فصل المحركات | تُحفظ خوارزميات MNA وDES وQMC/Petrick وFSM والإشارات في وحدات TypeScript قابلة للاختبار، مستقلة عن React. |
| تحديث الرسم | تُستخدم `useRef` و`requestAnimationFrame` للمسارات المتحركة والـCanvas؛ يمنع استخدام `setState` داخل حلقة رسوم 60fps. |
| الصياغة الأكاديمية | تُعرض المعادلات والمتغيرات ونتائج التحليل عبر KaTeX، مع بقاء الصيغ والأرقام باتجاه LTR داخل الواجهات RTL. |
| شبكة الدوائر | شبكات دوائر E-Circuits وDigital Logic تعمل بوحدة 25px؛ تبقى الطرفيات والأسلاك والرموز مرتبطة بعقدة هندسية موحدة. |
| متانة الخطأ | أي مدخل غير صالح أو مصفوفة مفردة أو حالة منطقية غير مؤكدة يجب أن تظهر كحالة مفهومة، لا كتعطل للمتصفح. |

## 2. شجرة المشروع التشغيلية

```text
mae-academy-site/
├── client/
│   ├── index.html
│   └── src/
│       ├── App.tsx                         # جذر التوجيه والغلاف العام
│       ├── index.css                        # رموز النمط والثيم العام
│       ├── pages/
│       │   ├── SimulationDetail.tsx         # مالك مسارات /simulations/[suite]/[tool]
│       │   └── …
│       ├── components/
│       │   ├── SimulatorLayout.tsx          # إطار عنوان + تبويبات للمحاكيات العامة
│       │   ├── control/                     # Root Locus, PID, State Space, Frequency Response
│       │   ├── circuit/                     # CircuitStudio وTabs B/C/D
│       │   ├── power/                       # Rectifier, Inverter, AC Controller, Chopper
│       │   ├── signals/                     # واجهات Signals & Systems وCanvas helpers
│       │   ├── digitalLogic/                # غلاف يحمّل المحاكي المعزول
│       │   ├── assembler/                   # Assembler Studio
│       │   ├── plc/                         # Siemens S7-200 Studio
│       │   ├── linearAlgebra/               # Linear Algebra Studio
│       │   └── ui/                          # مكونات واجهة مشتركة ومنها KatexMath
│       ├── DigitalLogicDesign/
│       │   ├── DigitalLogicSimulatorApp.tsx # مضيف التبويبات المحلية وحالة Workspace
│       │   ├── pages/                       # Analyzer, K-Map, Synthesis, Timing, FSM
│       │   ├── utils/                       # QMC, FSM, Timing, Synthesis, Logic AST
│       │   └── lib/                         # DES ورموز البوابات/المكونات
│       ├── lib/
│       │   ├── signals/                     # محركات Signal, Convolution, Fourier, Laplace
│       │   └── emulator/                    # أدوات المحاكاة منخفضة المستوى
│       ├── contexts/                        # Theme وLocale وإعدادات مشتركة
│       ├── data/platform.ts                 # سجل المسارات وبيانات تبويبات المحاكيات
│       └── v3-simulator/                    # محاكيات V3 الموروثة والمعزولة
├── server/                                  # غلاف التشغيل الإنتاجي
├── shared/                                  # أنواع/ثوابت مشتركة
├── package.json
└── todo.md                                  # سجل مهام التنفيذ والتحقق
```

## 3. خريطة المسارات وملكية الأدوات

المسار المركزي هو `SimulationDetail.tsx`. يختار هذا الملف قائمة التبويبات من `data/platform.ts` ثم يحمّل أداة مخصصة حسب `slug` و`tool`.

| الجناح | المسار | الأدوات المربوطة حاليًا | مالك الحالة |
|---|---|---|---|
| Control Systems | `/simulations/control-systems/*` | Root Locus، PID، Frequency Response، State Space | كل Studio مستقل |
| Circuit Lab | `/simulations/circuit-lab/a..d` | CircuitStudio وTabs B/C/D | محرك الدوائر لكل Tab |
| Power Electronics | `/simulations/power-electronics/a..d` | Rectifier، Inverter، AC Controller، Chopper | كل Studio مستقل |
| Assembler | `/simulations/assembler/a` | Assembler Studio Compact | محاكاة المعالج |
| PLC | `/simulations/plc/a` | Siemens S7-200 Studio | محرك ladder/scan المخصص |
| Signals & Systems | `/simulations/signals-and-systems/a..e` | Operations، Classification، Convolution، Fourier، Laplace | محركات `lib/signals` + Canvas refs |
| Digital Logic Design | `/simulations/digital-logic-design/workspace` | تبويبات محلية داخل المضيف المعزول | `DigitalLogicSimulatorApp` فقط |
| Linear Algebra | `/simulations/linear-algebra/a..e` | Linear Algebra Studio | حالة Studio محلية |
| Communication & Network | `/simulations/communication-and-network/*` | مسار مسجل؛ لا يوجد Studio متخصص بعد | يحتاج مواصفة معادلات معتمدة |
| مختبرات إضافية | `/simulations/circuitlab-1..3/a` | نسخ مستقلة من SimulatorTabC | حالة بحسب `instanceId` |

## 4. عقد واجهة المحاكيات: معيار Control / Power

أي محاكي جديد أو موسّع يجب أن يتبع بنية ثلاثية الألواح عند الحاجة إلى إدخال ورسم ونتيجة متزامنة. لا يُفرض هذا القالب على صفحة تحليل صغيرة لا تحتوي مساحة رسم، لكن يجب الحفاظ على الفصل نفسه حتى لو تم تمثيله كأقسام متجاورة.

| اللوح | المسؤولية | القواعد |
|---|---|---|
| الأيسر — Library / Inputs | اختيار المكونات، المعادلات، sliders، ونماذج الإدخال | عرض ثابت أو شبه ثابت، قابل للتمرير، لا يحتوي رسمًا عالي التردد. |
| المركزي — Workspace | SVG أو Canvas أو مصفوفة تعليمية تفاعلية | يملك pan/zoom أو تفاعل الرسم. تُخزن الإحداثيات المتحركة في refs لا في إعادة تصيير React دورية. |
| الأيمن — Inspector / Results | خصائص العنصر المختار، الحل، الجداول، المنحنيات | سياقي، يعرض قيمًا وصيغًا موثقة، ويعزل أخطاء الإدخال عن مساحة العمل. |

### الثيم والرموز

تُدار حالتا Light/Dark عبر سياق الثيم وفئة `dark`. تكون أسطح العمل الفاتحة بيضاء مع حدود رمادية هادئة؛ وتستعمل الأسطح الداكنة خلفية هندسية عميقة وبطاقات مرتفعة. يستعمل الرسم العلمي لون حد متباينًا مناسبًا للخلفية، وتبقى ألوان الدلالة واضحة: indigo/blue للحالة الفعالة، red للأخطاء، وemerald للنجاح أو snap.

| فئة بصرية | Light | Dark |
|---|---|---|
| سطح مساحة العمل | أبيض أو رمادي فاتح | سطح داكن مرتفع |
| خطوط الشبكة | شفافية سوداء منخفضة | شفافية بيضاء منخفضة |
| رمز/مسار علمي | `#3b4449` | `#E5E7EB` |
| خطأ أو إدخال غير صالح | red | red واضح التباين |
| نتيجة صحيحة أو snap | emerald | emerald واضح التباين |

## 5. عقود المحركات الرئيسية

### 5.1 E-Circuits وPower Electronics

محرك الدوائر يعتمد **Modified Nodal Analysis** بصيغة $[A][x]=[z]$. تلتزم الأسلاك بمسار Manhattan أحادي الانعطاف. يجب أن تكون طرفيات المكونات على شبكة $25\,\mathrm{px}$ كي لا تظهر فجوات بين طرف الرمز ونهاية السلك. تظل الإشارات المستمرة والنتائج المحسوبة منفصلة عن المعالجة المرئية.

تستخدم أدوات القدرة نماذج تبديل لاخطية ومخططات موجات لعرض $V_{out}$ و$I_{out}$ والقيم المشتقة مثل $V_{DC}$ و$V_{RMS}$ و$\Delta V$. ينبغي أن تبقى قضبان DC على شكل T وبألون هندسية محايدة، لا أن تتحول إلى تزويق لوني.

### 5.2 Digital Logic Design

يملك Digital Logic شجرة مستقلة بالكامل عن `v3-simulator`. يستمر Schematic Workspace مركبًا عندما ينتقل المتعلم محليًا بين تبويبات المختبر كي لا تضيع الدائرة أو حالة DES.

| التبويب | العقد الحسابي |
|---|---|
| Schematic Workspace | DES بأربع حالات `0/1/Z/X`، تأخير انتشار، وdelta cycles. |
| Logic Analyzer | Lexer → Shunting-Yard → AST → evaluator/KaTeX؛ يدعم `A′` والأقواس والمعاينات الأكاديمية. |
| K-Map Minimizer | QMC وPetrick، Gray Code، مجموعات ملتفة، وخلايا `0/1/X`. |
| Universal Synthesis | اشتقاق SOP→NAND وPOS→NOR وخطوات De Morgan ورسم بوابات قرائي. |
| Timing Waveforms | ticks منفصلة، تأخير انتشار، وWaveformTrack SVG؛ لا تستخدم React state لكل إطار. |
| State Machine Explorer | Moore/Mealy، Binary/Gray/One-Hot، إثارة D/T/JK/SR، K-Map، وVerilog مولد. |

### 5.3 Signals & Systems

تمت مزامنة حزمة Signals & Systems مع baseline v3-2. محركاتها تحت `client/src/lib/signals/` والواجهات المرئية تحت `client/src/components/signals/`.

| التبويب | محرك أو مبدأ أساسي |
|---|---|
| Operations & Properties | AST إشارة، MathLive، وعمليات الإزاحة/التحجيم والطاقة/الدورية. |
| System Classification | إثباتات تصنيف النظام وCanvas مساعد. |
| Convolution Engine | التفاف مستمر/متقطع، طبقات Canvas، وتحريك من refs. |
| 3D Fourier Analysis | تحويلات Fourier ورسم الطيف/البناء التوافقي/Waterfall. |
| 3D Laplace & S-Plane | أقطاب وأصفار وROC ورسم مستويي $s$ و$z$. |

> إشارة ديراك $\delta(t)$ رمز تحليلي: لا يجوز نمذجتها كنبضة رقمية عالية ضيقة فقط. تظهر كسهم في الرسم وتفعّل خاصية العيّنة عند استخدام محرك الإشارة الرمزي.

### 5.4 Control، Assembler، PLC، والجبر الخطي

تحتوي المنصة على Studios مخصصة لجذور المعادلة، ضبط PID، فضاء الحالة، واستجابة التردد؛ إضافة إلى Assembler Studio وSiemens S7-200 وLinear Algebra Studio. تُوسّع كل منها داخل مجلده ولا تُنقل حساباته إلى `SimulationDetail.tsx` أو مكوّن واجهة عام.

## 6. الأداء والتفاعل

| الحالة | آلية التنفيذ المطلوبة |
|---|---|
| تحريك Canvas/SVG مستمر | `requestAnimationFrame` + refs قابلة للتغيير. |
| slider بصري خفيف | تحديث فوري أو rAF. |
| حل ثقيل (MNA، root locus، تحويل واسع) | debounce قصير قبل الحساب؛ لا ينفذ داخل render. |
| تغير صيغة Boolean | debounce 300ms مع الاحتفاظ بآخر AST صالح. |
| مخطط حالة قابل للسحب | أحداث pointer تحفظ موضع العقدة فقط عند تغيرها؛ لا حلقة `setState` مرئية. |
| جدول أو قائمة React | مفاتيح دلالية فريدة؛ لا يُستخدم label مكرر كمفتاح. |

## 7. التعريب واتجاه الصيغ

السياق `LocaleContext` يملك اللغة واتجاه الواجهة. عند العربية يستخدم الغلاف `dir="rtl"` للأقسام النصية. كل مساحة رياضية أو شفرة أو جدول bit يُلف باتجاه LTR، لأن عكس اتجاه $Q_1Q_0$ أو $x[n]$ أو أرقام Verilog يفسد المعنى الهندسي أو المنطقي.

## 8. الاختبارات والتحقق قبل النشر

توجد اختبارات Vitest لمحركات Digital Logic والإشارات والواجهات الأساسية. قبل أي checkpoint يجب تنفيذ المصفوفة التالية:

| التحقق | الغرض |
|---|---|
| `pnpm vitest run` | كشف انحدار المحركات والحالات التفاعلية الموثقة. |
| `pnpm check` | تدقيق TypeScript دون إخراج ملفات. |
| `pnpm build` | بناء Vite والإنتاج وفحص الاستيرادات غير المستخدمة فعليًا. |
| لقطات المسارات | التحقق البصري من صفحة المحاكي ومساراته الرئيسة، خصوصًا Canvas/SVG وKaTeX. |
| سجلات المتصفح الحديثة | التمييز بين أخطاء HMR القديمة وخطأ حديث قابل لإعادة الإنتاج. |

## 9. حدود التوسع الآمن

1. لا يستبدل مجلد `DigitalLogicDesign/` بمحاكٍ موروث أو مستورد. التبويبات ومحرك DES فيه ملكيان له وحده.
2. تُستورد حزم v3-2 كطبقات مستقلة؛ لا تُنسخ ملفات `SimulationDetail.tsx` بالكامل عندما تحتوي تغييرات محلية لمسار Digital Logic.
3. لا يُبنى محرك اتصال/تضمين أو نموذج فيزيائي جديد من وصف تسويقي فقط. يلزم تحديد الصيغة الأكاديمية، حدود الإشارات، convention الطور، وعناصر التقييم قبل كتابة solver.
4. لا تُعرض UUIDs أو raw LaTeX أو أسماء nodes الداخلية في الواجهة التعليمية.
5. لا تحفظ الأصول الثقيلة داخل `client/src` أو `client/public`؛ تستخدم مسارات الأصول المعتمدة للمشروع عند الحاجة.

## 10. الحالة الحالية وخطوة العمل التالية

المنصة تحتوي مسارات وأدوات متخصصة لجميع الأجنحة الأساسية باستثناء أن **Communication & Network** ما زال مسارًا مسجلًا يحتاج نطاق محرك محدد ليصبح Studio مخصصًا. الخطوة الآمنة التالية هي اختيار وحدة اتصال أولى ذات معادلة صريحة—مثل AM أو FSK أو مخطط SNR—ثم إنشاء محرك TypeScript مستقل واختباراته قبل ربطه بواجهة الألواح الثلاثة.

---

**مالك الوثيقة:** MAE Academy Engineering Platform  
**نوع الوثيقة:** مرجع معماري حي؛ يُحدّث فقط مع checkpoint وظيفي موثق.
