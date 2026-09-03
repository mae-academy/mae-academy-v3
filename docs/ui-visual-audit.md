# MAE Academy — UI / Visual Audit (واجهات المحاكيات)

**النطاق:** `client/src/components/**` (محاكيات ومساحات العمل).
**الهدف:** رصد الشوائب البصرية/بقايا أسلوب "Sci-Fi / AI" في واجهات المحاكيات، والتحقق من مطابقة المحاكيات لمرجع صفحة **Control Systems**.
**النوع:** رصد وتوثيق فقط — **لم يُعدَّل أي سطر برمجي** في هذه الجلسة.

> ملاحظة منهجية: معظم ملفات الـ JSX مكتوبة على أسطر طويلة جداً (Single-line). رقم السطر المذكور هو السطر الذي يبدأ عنده العنصر المشخَّص؛ وقد يحتوي السطر نفسه على أكثر من عنصر. الفحص موجَّه للتسميات المزخرفة المصغّرة والحالة/الحقول والشرائط، ويستثني ما هو وظيفي بحت (رسائل أخطاء التحليل، تسميات حقول الإدخال الحقيقية، عناوين الأقسام ذات القيمة).

---

## 1) مطابقة المحاكيات لمرجع Control Systems (الهيدر/شريط الأدوات)

المرجع المعتمد (كما في `SimulatorLayout` / `SimulationPageHeader`):
- عنوان المادة الثابت في المنتصف + كبسولة زر الرجوع `/simulations` + تبويب نشط بتدرّج `bg-gradient-to-r from-blue-600 to-pink-500` (نص أبيض).

| المحاكي (المسار) | العنوان الثابت | زر الرجوع | تدرّج التبويب النشط | الحالة |
| --- | --- | --- | --- | --- |
| `/simulations/control-systems/*` | ✅ | ✅ | ✅ | مطابق (مرجع) |
| `/simulations/circuit-lab/*` | ✅ | ✅ | ✅ | مطابق |
| `/simulations/power-electronics/*` | ✅ | ✅ | ✅ | مطابق |
| `/simulations/assembler/*` | ✅ | ✅ | ✅ | مطابق |
| `/simulations/plc/*` | ✅ | ✅ | ✅ | مطابق |
| `/simulations/signals-and-systems/*` (a–e) | ✅ | ✅ | ✅ | مطابق (أُزيل `compact` سابقاً) |
| `/simulations/digital-logic-design/*` | ✅ | ✅ | ✅ | مطابق (شريط داخلي عبر `SimulationPageHeader`) |
| `/simulations/linear-algebra/*` | ✅ | ✅ | ✅ | مطابق |
| `/simulations/communication-and-network/*` | ✅ | ✅ | ✅ | مطابق (مساحة عامة) |

**خلاصة القسم:** لا يوجد محاكي يخرج عن إطار الهيدر الموحّد؛ كلها تمر عبر `SimulationDetail → SimulatorLayout → SimulationPageHeader`. لا بقايا لتبويب نشط بلون بنفسجي سادة بعد إزالة `compact`.

---

## 2) جدول الشوائب البصرية (Violet / Rose mono Micro-eyebrows، شرائط الحالة، تسميات زائدة)

| المسار الدقيق للملف | السطر | الشائبة / المحور | الخطورة | الوصف وخطة التصحيح |
| --- | --- | --- | --- | --- |
| `client/src/components/signals/SignalOperationsLab.tsx` | 47 | نص بنفسجي Monospace مصغّر `Tab A / Piecewise signal engine` فوق عنوان القسم | تجميلي | بقايا تسمية تحريرية تكرّر هوية الأداة الموجودة أصلاً في شريط التبويبات العلوي. **تصحيح:** حذف الـ micro-eyebrow والإبقاء على العنوان الوصفي؛ التحقق من عدم بقاء فراغ/هامش علوي. |
| `client/src/components/signals/SignalOperationsLab.tsx` | 52 | `Academic analysis` (بنفسجي مصغّر) فوق لوحة Energy/Power | تجميلي | تسمية مزخرفة؛ يُفضَّل إزالتها أو دمجها كوصف داخل العنوان. |
| `client/src/components/signals/SystemClassificationLab.tsx` | 43 | `Tab B / Visual proof laboratory` (بنفسجي مصغّر) | تجميلي | بقايا تسمية "Tab X"; تكرّر اسم الأداة في شريط التبويبات. حذفها. |
| `client/src/components/signals/ConvolutionLab.tsx` | 37 | `Tab C / Direct numerical experiment` (بنفسجي مصغّر) | تجميلي | تسمية صريحة مذكورة في المطلوب؛ حذفها مع الإبقاء على "Convolution Engine". |
| `client/src/components/signals/FourierAnalysisLab.tsx` | 29 | `Tab D / Time–frequency laboratory` (بنفسجي مصغّر) | تجميلي | تسمية "Tab D"; حذفها (المحاكي يبدأ الآن بلوحة "Harmonic Workspace"). |
| `client/src/components/signals/FourierAnalysisLab.tsx` | 30 | `Professor's derivation` (بنفسجي مصغّر) | تجميلي | تسمية لوحة؛ يُفضَّل دمجها داخل العنوان أو إزالتها. |
| `client/src/components/signals/LaplaceZPlaneLab.tsx` | 30 | `Tab E / Complex-domain laboratory` (بنفسجي مصغّر) | تجميلي | تسمية "Tab E"; حذفها. |
| `client/src/components/signals/LaplaceZPlaneLab.tsx` | 32 | `Root trace` (بنفسجي مصغّر) | تجميلي | تسمية لوحة "Solved poles & zeros"; إزالة أو دمج. |
| `client/src/components/signals/LaplaceZPlaneLab.tsx` | 33 | `Transform bridge` (كهرماني مصغّر) | تجميلي | تسمية مزخرفة؛ إزالة. |
| `client/src/components/signals/LaplaceZPlaneLab.tsx` | 34 | `Interactive Plotly surface` (بنفسجي مصغّر) | تجميلي | تسمية لوحة 3D؛ إزالة. |
| `client/src/components/circuit/CircuitStudio.tsx` | 171 | `ZONE C / NET CONSTRUCTION FIELD` (بنفسجي Monospace Uppercase) | تجميلي | شريط تسمية "Zone" بصبغة Sci-Fi؛ إزالة أو تخفيف ليتوافق مع Atelier. |
| `client/src/components/linearAlgebra/LinearAlgebraStudio.tsx` | 66 | تسمية قسم بنفسجية مصغّرة + شارات `Zone A/B/C` و`LEARNING FIELD` | تجميلي | شارات منطقة بنكهة "سفينة فضائية"؛ يُفضَّل استبدالها بترويسات قسم نظيفة. |
| `client/src/components/plc/SiemensS7200Studio.tsx` | 116 | شريط علوي `Rack 00 / CPU 01 / reference 0V` (Monospace أحمر صغير) | متوسط | شريط حالة مزخرف أعلى لوحة CPU؛ تقييم إبقائه كعنصر وظيفي (رقم الرف) مقابل إزالته أو جعله محايد اللون. |
| `client/src/components/plc/SiemensS7200Studio.tsx` | 82 | `Runtime configuration` (بنفسجي مصغّر) | تجميلي | تسمية لوحة؛ دمج/إزالة. |
| `client/src/components/assembler/AssemblerStudioCompact.tsx` | 17 | نصوص band بنكهة Monospace (`8086 instruction flow / station A` ونحوها) | تجميلي | شريط تدفّق تعليمي بلون Mono ملوّن؛ مراجعة ليتوافق مع Atelier. |
| `client/src/components/signals/SignalOperationsLab.tsx` | (تعريف) | دالة `SignalStationRail` ما تزال موجودة **غير مستخدمة** بعد إزالة استخدامها | متوسط | كود يتيم (Dead code) يحوي نسخة مطابقة لصندوق الرail المحذوف. **تصحيح:** حذف تعريف الدالة بالكامل. |

---

## 3) شوائب حمراء/بنفسجية صغيرة — تمييز وظيفي عن مزخرف

| المسار | السطر | النص | النوع |
| --- | --- | --- | --- |
| `signals/ConvolutionLab.tsx` | 38 | `Signal B` (أحمر) + رسالة الخطأ `xParsed.error` | **وظيفي** (تسمية إدخال/خطأ تحليل) — ليس عيباً |
| `signals/SystemClassificationLab.tsx` | 44 | حالة `Semantic model ready` (أحمر/أخضر) | **وظيفي** (مؤشر حالة حقيقي) |
| `signals/LaplaceZPlaneLab.tsx` | 38 (على الخط) | مؤشر `Roots solved / Check polynomial` | **وظيفي** |
| `components/ui/field.tsx`, `form.tsx` | متعددة | مكتبة shadcn (`Field`, `FormField`…) | **ليست عيباً** — أسماء رمزية داخلية وليست نصاً ظاهراً |

> التسميات الوظيفية (أخطاء تحليل، تسميات إدخال، مؤشرات حالة فعلية) **خارج** نطاق الشائبة ولا ينبغي حذفها؛ الشائبة محصورة في التسميات المزخرفة Uppercase/Monospace الملوّنة التي تكرّر معلومات زائدة أو تحمل طابعاً خيالياً.

---

## 4) بنود حُلّت مسبقاً (تأكيد — لا تعديل مطلوب)

- **`PowerStationRail` والشرائط** `STATION …` / `SOLVER STATE` / `SPECTRAL MODEL / READY` والرسوم المصغّرة المرفقة: **أُزيلت** من `FourierAnalysisLab`, `LaplaceZPlaneLab`, `SignalOperationsLab`, `RectifierStudio`, `InverterStudio`, `ChopperStudio`، وحُذف ملف `components/power/PowerStationRail.tsx`.
- فحص شامل الآن لـ `STATION / SOLVER STATE / PowerStationRail` في `components/**` لم يُرصد أي ذكر متبقٍ (النصان لا يظهران إلا في تعليقات أو مراجع غير واجهة).

---

## 5) ملاحظات هيكلية للخطوة القادمة (غير عيب واجهة مباشر)
- `SimulatorLayout.tsx` (سطر 38) يحوي فرع `station` البطل غير المستخدم (Hero variant بشريط بنفسجي) — لا يستدعيه أي مسار حالياً؛ يُوصى بإزالته كتنظيف معماري في مرحلة التعديل.
- التحقق من قاعدة "DC rails غير زرقاء" ومن نقاء المحركات/60fps يقع ضمن **الفحص الشامل** (`docs/comprehensive-system-audit.md`) وليس هذا التقرير البصري.

---
*انتهى التقرير — رصد فقط، دون تعديل أي كود.*
