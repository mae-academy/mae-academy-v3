/**
 * MAE Academy content architecture: Luminous Technical Atelier.
 * Complete language registry for every visible route, label, CTA, collection card, and SVG annotation.
 */
import type { CardType, Locale } from "@/data/platform";

type CollectionCard = { title: string; description: string; code: string; badge?: string };
type BlueprintLabel = { label: string; sublabel: string };

export type LocaleContent = {
  navigation: Record<string, string>;
  controls: {
    home: string;
    language: string;
    languageOptions: string;
    themeToLight: string;
    themeToDark: string;
    platformNavigation: string;
    navigationItem: string;
    previousSlide: string;
    nextSlide: string;
    explore: string;
    station: string;
  };
  languageNames: Record<Locale, string>;
  footer: { description: string; research: string; courses: string; library?: string; simulations: string };
  home: {
    headlinePrimary: string;
    headlineSecondary: string;
    description: string;
    ctaPrimary: string;
    ctaSecondary: string;
    stats: Array<{ value: string; label: string }>;
    fieldTitle: string;
    gateways: Array<{ title: string; description: string; action: string }>;
    platformsTitle: string;
    platformsSubtitle: string;
    platformSimulations: {
      badge: string;
      title: string;
      description: string;
      cta: string;
      modules: Array<{ title: string; desc: string }>;
    };
    platformCourses: {
      badge: string;
      title: string;
      description: string;
      cta: string;
      topics: string[];
    };
    platformResearch: {
      badge: string;
      title: string;
      description: string;
      cta: string;
      pillars: Array<{ title: string; desc: string }>;
    };
    methodEyebrow: string;
    methodTitle: string;
    methodDescription: string;
    methodSteps: Array<{ number: string; title: string; description: string }>;
    founderEyebrow: string;
    founderTitle: string;
    founderDescription: string;
    founderAction: string;
  };
  collections: Record<CardType, { eyebrow: string; title: string; description: string; cards: CollectionCard[] }>;
  about: {
    eyebrow: string;
    title: string;
    intro: string;
    founderEyebrow: string;
    founderName: string;
    founderFullName: string;
    paragraphOne: string;
    paragraphTwo: string;
    principles: Array<{ label: string; value: string }>;
  };
  blueprints: {
    visual: Record<"hero" | "research" | "courses" | "simulations" | "orbital", BlueprintLabel>;
    stations: Record<CardType, BlueprintLabel[]>;
    avatar: { aria: string; archive: string; reference: string };
  };
  notFound: { title: string; description: string; action: string };
};

const blueprintPaths = {
  visual: {
    en: [
      ["MAE / SYSTEM 01", "Multi-axis learning model"], ["R / RESEARCH CELL", "Evidence architecture"], ["C / COURSE PATH", "Progressive system"], ["S / SIMULATION LOOP", "Variables in motion"], ["MAE / FIELD NOTES", "Founder instrument panel"],
    ],
    ar: [
      ["MAE / النظام 01", "نموذج تعلّم متعدد المحاور"], ["R / خلية بحث", "هندسة الأدلة"], ["C / مسار تعلّم", "نظام متدرّج"], ["S / حلقة محاكاة", "متغيرات متحركة"], ["MAE / ملاحظات ميدانية", "لوحة المؤسس"],
    ],
    es: [
      ["MAE / SISTEMA 01", "Modelo de aprendizaje multieje"], ["R / CÉLULA DE INVESTIGACIÓN", "Arquitectura de evidencia"], ["C / RUTA DE CURSO", "Sistema progresivo"], ["S / BUCLE DE SIMULACIÓN", "Variables en movimiento"], ["MAE / NOTAS DE CAMPO", "Panel del fundador"],
    ],
  },
};

const en: LocaleContent = {
  navigation: { "00": "Home", "01": "Academic Research", "02": "Academic Library", "03": "Practical Simulations", "04": "About" },
  controls: { home: "MAE Academy home", language: "Language", languageOptions: "Language options", themeToLight: "Switch to light theme", themeToDark: "Switch to dark theme", platformNavigation: "Platform navigation", navigationItem: "Navigation item", previousSlide: "Previous navigation item", nextSlide: "Next navigation item", explore: "Explore", station: "Station" },
  languageNames: { en: "English", ar: "Arabic", es: "Spanish" },
  footer: { description: "A global platform for rigorous engineering learning and applied systems thinking.", research: "Research", courses: "Courses", library: "Library", simulations: "Simulations" },
  home: {
    headlinePrimary: "Welcome to MAE Academy", headlineSecondary: "Model-Analyze-Engineering", description: "Interactive labs for control systems, power electronics, and signal analysis — build intuition by running the model, not just reading about it.", ctaPrimary: "Launch a Simulation", ctaSecondary: "Explore Library",
    stats: [{ value: "12+", label: "Interactive Simulations" }, { value: "40+", label: "Course Modules" }, { value: "100%", label: "Client-Side Engine" }],
    fieldTitle: "Choose a station. Follow the signal.",
    gateways: [
      { title: "Academic Research", description: "Trace a question through evidence maps, systems logic, and emerging engineering directions.", action: "Enter Research Field" },
      { title: "Academic Library", description: "Open textbooks, technical manuals, and foundational references across engineering disciplines.", action: "Open Academic Library" },
      { title: "Practical Simulations", description: "Tune a PID loop, probe a circuit, or drive a pneumatic system — and read the response live.", action: "Launch Simulation" },
    ],
    platformsTitle: "Core Engineering Platforms",
    platformsSubtitle: "Three interconnected learning layers bridging rigorous mathematical theory with interactive, real-time hardware intuition.",
    platformSimulations: {
      badge: "Interactive Workbench",
      title: "Practical Simulations & Virtual Lab Benches",
      description: "Run real-time dynamic models right in the browser with instantaneous response feedback. Designed to eliminate the barrier between abstract mathematical proofs and applied hardware behavior.",
      cta: "Launch Interactive Lab",
      modules: [
        { title: "Control Systems", desc: "PID tuning, Root Locus, state-space step response." },
        { title: "Power Electronics", desc: "DC-DC Buck/Boost converters, PWM modulation, inverter stages." },
        { title: "Signals & Systems", desc: "Fourier synthesis, Nyquist sampling, Bode frequency response." },
        { title: "Pneumatics & PLCs", desc: "Electro-pneumatic sequencing and ladder logic emulation." },
      ],
    },
    platformCourses: {
      badge: "Structured Curriculum",
      title: "Rigorous Engineering Courses",
      description: "Concept-first lecture series and structured study tracks covering foundational and advanced engineering topics with mathematical rigor and intuitive visual breakdowns.",
      cta: "Browse Course Catalog",
      topics: [
        "Classical Control Theory",
        "Modern State-Space Analysis",
        "Microcontroller Architectures",
        "Signal Processing",
      ],
    },
    platformResearch: {
      badge: "Deep Modeling",
      title: "Mathematical Research & System Identification",
      description: "Open-source research documentation, formal derivations, transfer function formulations, and algorithmic proofs behind our simulations.",
      cta: "Explore Research Notes",
      pillars: [
        { title: "System Identification", desc: "Non-linear state estimation and grey-box parameter extraction." },
        { title: "Numerical Solvers", desc: "Runge-Kutta 4th-order (RK4) integration for real-time physics." },
        { title: "Algorithmic Derivations", desc: "Open-source proofs, LaTeX writeups, and reproducible benchmarks." },
      ],
    },
    methodEyebrow: "MAE / WORKING METHOD", methodTitle: "A disciplined path from question to action.", methodDescription: "The MAE structure is deliberately transferable. Whether a future page holds a study, a simulation, or a course module, it enters the system through the same calibrated logic.",
    methodSteps: [{ number: "01", title: "Observe the system", description: "Locate the forces, gaps, patterns, and questions that deserve a more exact frame." }, { number: "02", title: "Make the model", description: "Translate complexity into a working representation that can be tested, challenged, and refined." }, { number: "03", title: "Test the response", description: "Move from insight to applied choices with evidence, iteration, and practical attention." }],
    founderEyebrow: "Founder Note", founderTitle: "Engineering education becomes powerful when it remains close to the real system.", founderDescription: "Meet the founder and the MAE premise behind the platform: Model. Analyze. Engineering.", founderAction: "Enter the founder archive",
  },
  collections: {
    research: {
      eyebrow: "01 / Academic Research", title: "Turn evidence into engineering direction.", description: "An open-access engineering paper catalog and discovery engine. Search, read, and download live research.", cards: [
        { title: "Systems as Evidence", description: "Frame complex engineering questions into traceable, testable research paths.", code: "R.01" }, { title: "Applied Mechanics", description: "Explore the relationship between materials, force, and real-world constraints.", code: "R.02" }, { title: "Smart Infrastructure", description: "Research the sensing, feedback, and resilience patterns shaping civic systems.", code: "R.03" }, { title: "Energy Transitions", description: "Map emerging technical choices across clean generation and distribution.", code: "R.04" }, { title: "Computational Design", description: "Study procedural models that turn constraints into new possibilities.", code: "R.05" }, { title: "Engineering Ethics", description: "Test the social, environmental, and human assumptions inside every system.", code: "R.06" },
      ]
    },
    courses: {
      eyebrow: "02 / Academic Courses", title: "Progress through the logic of making.", description: "A modular course field that connects theory, analytical rigor, and the decision-making habits of practicing engineers.", cards: [
        { title: "Model Thinking", description: "Build a disciplined mental model before moving to calculation or code.", code: "C.01" }, { title: "Analysis Studio", description: "Learn practical tools for interpreting technical systems and their behavior.", code: "C.02" }, { title: "Engineering Foundations", description: "Strengthen the quantitative and conceptual base behind confident design choices.", code: "C.03" }, { title: "Data for Engineers", description: "Translate measurements into insight, decisions, and transparent arguments.", code: "C.04" }, { title: "Design Under Constraints", description: "Work through material, spatial, financial, and operational trade-offs.", code: "C.05" }, { title: "Leadership in Systems", description: "Develop a clear point of view for guiding teams through complex technical work.", code: "C.06" },
      ]
    },
    simulations: {
      eyebrow: "03 / Practical Simulations", title: "Test the variable. Read the response.", description: "Practical simulation spaces turn abstract relationships into visual, repeatable experiments designed for applied learning.", cards: [
        { title: "Bridge Load Lab", description: "Evaluate force paths and structural response across changing conditions.", code: "S.01" }, { title: "Grid Balance", description: "Test energy demand, generation capacity, and resilient system behavior.", code: "S.02" }, { title: "City Flow", description: "Model movement, density, and interventions across a connected urban network.", code: "S.03" }, { title: "Material Stress", description: "Examine how materials react when load, heat, and time interact.", code: "S.04" }, { title: "Water Logic", description: "Trace a water system from collection through treatment, use, and recovery.", code: "S.05" }, { title: "Control Room", description: "Practice decisions in a live-feeling multi-variable engineering scenario.", code: "S.06" },
      ]
    },
  },
  about: { eyebrow: "04 / About MAE", title: "Model. Analyze. Engineering.", intro: "MAE Academy is a global academic platform that turns engineering curiosity into structured models, analytical clarity, and applied practice.", founderEyebrow: "FOUNDER / 001", founderName: "Mohammad AbuElyan", founderFullName: "Mohammed Jihad Jamal Abu Elyan", paragraphOne: "MAE also carries the founder’s initials. It is an invitation to treat engineering education as a living discipline: one where learners build a model, interrogate its assumptions, and test it against conditions that matter.", paragraphTwo: "As founder and engineering educator, Mohammad AbuElyan shapes MAE Academy around rigorous inquiry, practical experimentation, and an internationally accessible learning culture.", principles: [{ label: "MODEL", value: "Structure" }, { label: "ANALYZE", value: "Insight" }, { label: "ENGINEER", value: "Action" }] },
  blueprints: { visual: { hero: { label: blueprintPaths.visual.en[0][0], sublabel: blueprintPaths.visual.en[0][1] }, research: { label: blueprintPaths.visual.en[1][0], sublabel: blueprintPaths.visual.en[1][1] }, courses: { label: blueprintPaths.visual.en[2][0], sublabel: blueprintPaths.visual.en[2][1] }, simulations: { label: blueprintPaths.visual.en[3][0], sublabel: blueprintPaths.visual.en[3][1] }, orbital: { label: blueprintPaths.visual.en[4][0], sublabel: blueprintPaths.visual.en[4][1] } }, stations: { research: [{ label: "EVIDENCE MAP", sublabel: "Systems as evidence" }, { label: "FORCE TRACE", sublabel: "Applied mechanics" }, { label: "CIVIC NETWORK", sublabel: "Smart infrastructure" }, { label: "ENERGY VECTOR", sublabel: "Energy transitions" }, { label: "PROCEDURAL FIELD", sublabel: "Computational design" }, { label: "ETHICS MATRIX", sublabel: "Engineering ethics" }], courses: [{ label: "MODEL LADDER", sublabel: "Model thinking" }, { label: "ANALYSIS PATH", sublabel: "Analysis studio" }, { label: "FOUNDATION SET", sublabel: "Engineering foundations" }, { label: "DATA SIGNAL", sublabel: "Data for engineers" }, { label: "CONSTRAINT LOOP", sublabel: "Design under constraints" }, { label: "LEADERSHIP AXIS", sublabel: "Leadership in systems" }], simulations: [{ label: "LOAD TEST", sublabel: "Bridge load lab" }, { label: "GRID BALANCE", sublabel: "Energy balance" }, { label: "FLOW NETWORK", sublabel: "City flow" }, { label: "STRESS FIELD", sublabel: "Material stress" }, { label: "WATER LOGIC", sublabel: "Water system" }, { label: "CONTROL LOOP", sublabel: "Control room" }] }, avatar: { aria: "Illustrated placeholder for Leo wearing a hard hat and glasses", archive: "LEO / FIELD ARCHIVE", reference: "REF. 001" } },
  notFound: { title: "Page not found", description: "The page you are looking for does not exist or has moved.", action: "Go home" },
};

const ar: LocaleContent = {
  navigation: { "00": "الرئيسية", "01": "البحث الأكاديمي", "02": "المكتبة الأكاديمية", "03": "المحاكاة العملية", "04": "عن الأكاديمية" },
  controls: { home: "الصفحة الرئيسية لأكاديمية MAE", language: "اللغة", languageOptions: "خيارات اللغة", themeToLight: "التحويل إلى الوضع الفاتح", themeToDark: "التحويل إلى الوضع الداكن", platformNavigation: "تنقل المنصة", navigationItem: "عنصر التنقل", previousSlide: "عنصر التنقل السابق", nextSlide: "عنصر التنقل التالي", explore: "استكشف", station: "محطة" },
  languageNames: { en: "الإنجليزية", ar: "العربية", es: "الإسبانية" },
  footer: { description: "نمذجة. تحليل. هندسة. منصة عالمية لتعلّم الهندسة بعمق والتفكير في الأنظمة التطبيقية.", research: "البحث", courses: "الدورات", library: "المكتبة", simulations: "المحاكاة" },
  home: {
    headlinePrimary: "أهلاً بك في أكاديمية MAE", headlineSecondary: "نمذجة - تحليل - هندسة", description: "معامل تفاعلية لأنظمة التحكم، الإلكترونيات القدرية، وتحليل الإشارات — ابنِ فهمك بتشغيل النموذج، لا بقراءته فقط.", ctaPrimary: "ابدأ محاكاة", ctaSecondary: "تصفح المكتبة",
    stats: [{ value: "12+", label: "محاكاة تفاعلية" }, { value: "40+", label: "وحدة دراسية" }, { value: "100%", label: "محرك يعمل بالكامل على المتصفح" }],
    fieldTitle: "اختر محطتك. اتبع الإشارة.",
    gateways: [
      { title: "البحث الأكاديمي", description: "تتبّع سؤالاً عبر خرائط الأدلة، والمنطق الهندسي للأنظمة، والاتجاهات الهندسية الناشئة.", action: "ادخل مجال البحث" },
      { title: "المكتبة الأكاديمية", description: "كتب ومراجع هندسية مفتوحة ومناهج تقنية عبر مختلف تخصصات الهندسة والعلوم.", action: "افتح المكتبة الأكاديمية" },
      { title: "المحاكاة التطبيقية", description: "اضبط حلقة PID، افحص دارة كهربائية، أو شغّل نظاماً هوائياً — واقرأ الاستجابة لحظياً.", action: "ابدأ المحاكاة" },
    ],
    platformsTitle: "منصات الهندسة الأساسية",
    platformsSubtitle: "ثلاث طبقات تعليمية متكاملة تربط النظرية الرياضية الصارمة مع الحس الهندسي التفاعلي في الزمن الحقيقي.",
    platformSimulations: {
      badge: "منصة عمل تفاعلية",
      title: "المحاكاة التطبيقية ومنصات المختبر الافتراضية",
      description: "شغّل نماذج ديناميكية في الزمن الحقيقي مباشرة في المتصفح مع استجابة فورية. صُممت لإزالة الفجوة بين البراهين الرياضية المجردة وسلوك العتاد التطبيقي.",
      cta: "افتح المختبر التفاعلي",
      modules: [
        { title: "أنظمة التحكم", desc: "ضبط PID، المحل الهندسي للجذور، واستجابة فضاء الحالة للخطوة." },
        { title: "إلكترونيات القدرة", desc: "محولات Buck/Boost المستمرة، تضمين PWM، ومراحل العواكس." },
        { title: "الإشارات والأنظمة", desc: "تركيب فورييه، أخذ العينات لنايكويست، واستجابة تردد بود." },
        { title: "النيوماتيك وPLC", desc: "التسلسل الكهرو-هوائي ومحاكاة منطق السلم." },
      ],
    },
    platformCourses: {
      badge: "منهج منظم",
      title: "مقررات هندسية دقيقة",
      description: "سلسلة محاضرات تركز على المفاهيم ومسارات دراسية منظمة تغطي موضوعات هندسية تأسيسية ومتقدمة بصرامة رياضية وتوضيحات بصرية بديهية.",
      cta: "تصفح دليل المقررات",
      topics: [
        "نظرية التحكم الكلاسيكية",
        "تحليل فضاء الحالة الحديث",
        "معماريات المتحكمات الدقيقة",
        "معالجة الإشارات",
      ],
    },
    platformResearch: {
      badge: "نمذجة عميقة",
      title: "البحث الرياضي وتحديد الأنظمة",
      description: "توثيق بحثي مفتوح المصدر واشتقاقات رسمية وصياغات دوال الانتقال وبراهين خوارزمية خلف محاكياتنا.",
      cta: "استكشف مذكرات البحث",
      pillars: [
        { title: "تحديد الأنظمة", desc: "تقدير الحالة اللاخطية واستخراج المعاملات بنماذج الصندوق الرمادي." },
        { title: "المحللات العددية", desc: "تكامل رنج-كوتا من الرتبة الرابعة (RK4) لمحاكاة فيزيائية بالزمن الحقيقي." },
        { title: "الاشتقاقات الخوارزمية", desc: "براهين مفتوحة المصدر وصياغات LaTeX ومقارنات معيارية قابلة للتكرار." },
      ],
    },
    methodEyebrow: "MAE / منهج العمل", methodTitle: "مسار منضبط من السؤال إلى الفعل.", methodDescription: "بنية MAE قابلة للنقل عمدًا. سواء احتوت الصفحة المستقبلية على دراسة أو محاكاة أو وحدة دراسية، فإنها تدخل النظام من خلال المنطق المنضبط نفسه.",
    methodSteps: [{ number: "01", title: "راقب النظام", description: "حدّد القوى والفجوات والأنماط والأسئلة التي تستحق إطارًا أكثر دقة." }, { number: "02", title: "ابنِ النموذج", description: "حوّل التعقيد إلى تمثيل عملي قابل للاختبار والتحدي والتحسين." }, { number: "03", title: "اختبر الاستجابة", description: "انتقل من الرؤية إلى الخيارات التطبيقية عبر الأدلة والتكرار والاهتمام العملي." }],
    founderEyebrow: "ملاحظة المؤسس", founderTitle: "يصبح التعليم الهندسي قويًا عندما يبقى قريبًا من النظام الحقيقي.", founderDescription: "تعرّف إلى المؤسس وفكرة MAE التي تقود المنصة: نمذجة. تحليل. هندسة.", founderAction: "ادخل أرشيف المؤسس",
  },
  collections: {
    research: {
      eyebrow: "01 / البحث الأكاديمي", title: "حوّل الأدلة إلى اتجاه هندسي.", description: "فهرس مفتوح الوصول للأوراق البحثية الهندسية ومحرك استكشاف. ابحث واقرأ وحمّل أحدث الأبحاث.", cards: [
        { title: "الأنظمة بوصفها أدلة", description: "صُغ الأسئلة الهندسية المعقدة في مسارات بحث قابلة للتتبع والاختبار.", code: "R.01" }, { title: "الميكانيكا التطبيقية", description: "استكشف العلاقة بين المواد والقوة والقيود الواقعية.", code: "R.02" }, { title: "البنية التحتية الذكية", description: "ابحث في أنماط الاستشعار والتغذية الراجعة والمرونة التي تشكل الأنظمة المدنية.", code: "R.03" }, { title: "تحولات الطاقة", description: "ارسم خريطة الخيارات التقنية الناشئة عبر التوليد النظيف والتوزيع.", code: "R.04" }, { title: "التصميم الحاسوبي", description: "ادرس النماذج الإجرائية التي تحوّل القيود إلى إمكانات جديدة.", code: "R.05" }, { title: "أخلاقيات الهندسة", description: "اختبر الافتراضات الاجتماعية والبيئية والإنسانية داخل كل نظام.", code: "R.06" },
      ]
    },
    courses: {
      eyebrow: "02 / الدورات الأكاديمية", title: "تقدّم عبر منطق الصنع.", description: "مجال دورات مرن يربط النظرية والصرامة التحليلية وعادات اتخاذ القرار لدى المهندسين الممارسين.", cards: [
        { title: "التفكير بالنماذج", description: "ابنِ نموذجًا ذهنيًا منضبطًا قبل الانتقال إلى الحساب أو الشيفرة.", code: "C.01" }, { title: "استوديو التحليل", description: "تعلّم أدوات عملية لتفسير الأنظمة التقنية وسلوكها.", code: "C.02" }, { title: "أسس الهندسة", description: "عزّز القاعدة الكمية والمفاهيمية خلف خيارات التصميم الواثقة.", code: "C.03" }, { title: "البيانات للمهندسين", description: "حوّل القياسات إلى رؤية وقرارات وحجج شفافة.", code: "C.04" }, { title: "التصميم تحت القيود", description: "اعمل عبر المفاضلات المادية والمكانية والمالية والتشغيلية.", code: "C.05" }, { title: "القيادة في الأنظمة", description: "طوّر منظورًا واضحًا لقيادة الفرق عبر العمل التقني المعقد.", code: "C.06" },
      ]
    },
    simulations: {
      eyebrow: "03 / المحاكاة العملية", title: "اختبر المتغير. واقرأ الاستجابة.", description: "تحوّل مساحات المحاكاة العملية العلاقات المجردة إلى تجارب بصرية قابلة للتكرار ومصممة للتعلم التطبيقي.", cards: [
        { title: "مختبر أحمال الجسور", description: "قيّم مسارات القوة والاستجابة الإنشائية عبر ظروف متغيرة.", code: "S.01" }, { title: "توازن الشبكة", description: "اختبر الطلب على الطاقة وقدرة التوليد وسلوك النظام المرن.", code: "S.02" }, { title: "تدفق المدينة", description: "نمذج الحركة والكثافة والتدخلات عبر شبكة حضرية مترابطة.", code: "S.03" }, { title: "إجهاد المادة", description: "افحص كيفية تفاعل المواد عندما تجتمع الأحمال والحرارة والزمن.", code: "S.04" }, { title: "منطق المياه", description: "تتبّع نظام مياه من التجميع عبر المعالجة والاستخدام والاسترداد.", code: "S.05" }, { title: "غرفة التحكم", description: "تدرّب على القرارات في سيناريو هندسي متعدد المتغيرات ينبض بالحياة.", code: "S.06" },
      ]
    },
  },
  about: { eyebrow: "04 / عن MAE", title: "نمذجة. تحليل. هندسة.", intro: "أكاديمية MAE منصة أكاديمية عالمية تحوّل الفضول الهندسي إلى نماذج منظمة ووضوح تحليلي وممارسة تطبيقية.", founderEyebrow: "المؤسس / 001", founderName: "محمد أبو عليان", founderFullName: "محمد جهاد جمال أبو عليان", paragraphOne: "تحمل MAE أيضًا الأحرف الأولى لاسم المؤسس. وهي دعوة للتعامل مع التعليم الهندسي بوصفه تخصصًا حيًا؛ يبني فيه المتعلمون نموذجًا ويفحصون افتراضاته ويختبرونه أمام ظروف ذات معنى.", paragraphTwo: "بصفته المؤسس والمعلّم الهندسي، يصوغ محمد أبو عليان أكاديمية MAE حول الاستقصاء الصارم والتجريب العملي وثقافة تعلم متاحة دوليًا.", principles: [{ label: "نمذجة", value: "البنية" }, { label: "تحليل", value: "الرؤية" }, { label: "هندسة", value: "الفعل" }] },
  blueprints: { visual: { hero: { label: blueprintPaths.visual.ar[0][0], sublabel: blueprintPaths.visual.ar[0][1] }, research: { label: blueprintPaths.visual.ar[1][0], sublabel: blueprintPaths.visual.ar[1][1] }, courses: { label: blueprintPaths.visual.ar[2][0], sublabel: blueprintPaths.visual.ar[2][1] }, simulations: { label: blueprintPaths.visual.ar[3][0], sublabel: blueprintPaths.visual.ar[3][1] }, orbital: { label: blueprintPaths.visual.ar[4][0], sublabel: blueprintPaths.visual.ar[4][1] } }, stations: { research: [{ label: "خريطة الأدلة", sublabel: "الأنظمة بوصفها أدلة" }, { label: "مسار القوى", sublabel: "الميكانيكا التطبيقية" }, { label: "شبكة مدنية", sublabel: "بنية تحتية ذكية" }, { label: "متجه الطاقة", sublabel: "تحولات الطاقة" }, { label: "مجال إجرائي", sublabel: "تصميم حاسوبي" }, { label: "مصفوفة الأخلاقيات", sublabel: "أخلاقيات الهندسة" }], courses: [{ label: "سلم النماذج", sublabel: "التفكير بالنماذج" }, { label: "مسار التحليل", sublabel: "استوديو التحليل" }, { label: "مجموعة الأسس", sublabel: "أسس الهندسة" }, { label: "إشارة البيانات", sublabel: "البيانات للمهندسين" }, { label: "حلقة القيود", sublabel: "التصميم تحت القيود" }, { label: "محور القيادة", sublabel: "القيادة في الأنظمة" }], simulations: [{ label: "اختبار الأحمال", sublabel: "مختبر أحمال الجسور" }, { label: "توازن الشبكة", sublabel: "توازن الطاقة" }, { label: "شبكة التدفق", sublabel: "تدفق المدينة" }, { label: "مجال الإجهاد", sublabel: "إجهاد المادة" }, { label: "منطق المياه", sublabel: "نظام المياه" }, { label: "حلقة التحكم", sublabel: "غرفة التحكم" }] }, avatar: { aria: "رسم موضعي لشخصية ليو يرتدي خوذة ونظارات", archive: "ليو / أرشيف ميداني", reference: "مرجع 001" } },
  notFound: { title: "الصفحة غير موجودة", description: "الصفحة التي تبحث عنها غير موجودة أو تم نقلها.", action: "العودة للرئيسية" },
};

const es: LocaleContent = {
  navigation: { "00": "Inicio", "01": "Investigación académica", "02": "Biblioteca académica", "03": "Simulaciones prácticas", "04": "Acerca de" },
  controls: { home: "Inicio de MAE Academy", language: "Idioma", languageOptions: "Opciones de idioma", themeToLight: "Cambiar al tema claro", themeToDark: "Cambiar al tema oscuro", platformNavigation: "Navegación de la plataforma", navigationItem: "Elemento de navegación", previousSlide: "Elemento anterior de navegación", nextSlide: "Elemento siguiente de navegación", explore: "Explorar", station: "Estación" },
  languageNames: { en: "Inglés", ar: "Árabe", es: "Español" },
  footer: { description: "Modelar. Analizar. Ingeniería. Una plataforma global para el aprendizaje riguroso de ingeniería y el pensamiento aplicado de sistemas.", research: "Investigación", courses: "Cursos", library: "Biblioteca", simulations: "Simulaciones" },
  home: {
    headlinePrimary: "Bienvenido a MAE Academy", headlineSecondary: "Modelar - Analizar - Ingeniería", description: "Laboratorios interactivos de sistemas de control, electrónica de potencia y análisis de señales — construye intuición ejecutando el modelo, no solo leyendo sobre él.", ctaPrimary: "Iniciar una Simulación", ctaSecondary: "Explorar Biblioteca",
    stats: [{ value: "12+", label: "Simulaciones Interactivas" }, { value: "40+", label: "Módulos de Curso" }, { value: "100%", label: "Motor 100% en el Cliente" }],
    fieldTitle: "Elige una estación. Sigue la señal.",
    gateways: [
      { title: "Investigación Académica", description: "Recorre una pregunta a través de mapas de evidencia, lógica de sistemas y direcciones de ingeniería emergentes.", action: "Entrar a Investigación" },
      { title: "Biblioteca Académica", description: "Libros de texto abiertos, manuales técnicos y referencias fundamentales en ingeniería.", action: "Abrir Biblioteca Académica" },
      { title: "Simulaciones Prácticas", description: "Ajusta un lazo PID, analiza un circuito o controla un sistema neumático — y observa la respuesta en vivo.", action: "Lanzar Simulación" },
    ],
    platformsTitle: "Plataformas Principales de Ingeniería",
    platformsSubtitle: "Tres capas interconectadas de aprendizaje que unen la teoría matemática rigurosa con la intuición práctica en tiempo real.",
    platformSimulations: {
      badge: "Banco de Trabajo Interactivo",
      title: "Simulaciones Prácticas y Bancos de Laboratorio Virtuales",
      description: "Ejecuta modelos dinámicos en tiempo real en el navegador con retroalimentación instantánea. Diseñado para eliminar la barrera entre demostraciones matemáticas abstractas y el comportamiento del hardware.",
      cta: "Lanzar Laboratorio Interactivo",
      modules: [
        { title: "Sistemas de Control", desc: "Ajuste de PID, Lugar Geométrico de Raíces, respuesta al escalón en espacio de estados." },
        { title: "Electrónica de Potencia", desc: "Convertidores Buck/Boost CC-CC, modulación PWM, etapas de inversores." },
        { title: "Señales y Sistemas", desc: "Síntesis de Fourier, muestreo de Nyquist, respuesta en frecuencia de Bode." },
        { title: "Neumática y PLCs", desc: "Secuenciación electroneumática y emulación de lógica de escalera." },
      ],
    },
    platformCourses: {
      badge: "Currículo Estructurado",
      title: "Cursos Rigurosos de Ingeniería",
      description: "Series de conferencias conceptuales y rutas de estudio estructuradas que cubren temas fundamentales y avanzados con rigor matemático y explicaciones visuales intuitivas.",
      cta: "Explorar Catálogo de Cursos",
      topics: [
        "Teoría de Control Clásico",
        "Análisis Moderno en Espacio de Estados",
        "Arquitecturas de Microcontroladores",
        "Procesamiento de Señales",
      ],
    },
    platformResearch: {
      badge: "Modelado Profundo",
      title: "Investigación Matemática e Identificación de Sistemas",
      description: "Documentación de investigación de código abierto, derivaciones formales, funciones de transferencia y pruebas algorítmicas detrás de nuestras simulaciones.",
      cta: "Explorar Notas de Investigación",
      pillars: [
        { title: "Identificación de Sistemas", desc: "Estimación de estados no lineales y extracción de parámetros de caja gris." },
        { title: "Solucionadores Numéricos", desc: "Integración Runge-Kutta de 4to orden (RK4) para física en tiempo real." },
        { title: "Derivaciones Algorítmicas", desc: "Pruebas de código abierto, redacciones en LaTeX y bancos de pruebas reproducibles." },
      ],
    },
    methodEyebrow: "MAE / MÉTODO DE TRABAJO", methodTitle: "Un camino disciplinado de la pregunta a la acción.", methodDescription: "La estructura de MAE es deliberadamente transferible. Ya sea que una página futura contenga un estudio, una simulación o un módulo de curso, entra al sistema con la misma lógica calibrada.",
    methodSteps: [{ number: "01", title: "Observa el sistema", description: "Ubica las fuerzas, brechas, patrones y preguntas que merecen un marco más preciso." }, { number: "02", title: "Construye el modelo", description: "Traduce la complejidad a una representación operativa que pueda probarse, cuestionarse y refinarse." }, { number: "03", title: "Prueba la respuesta", description: "Pasa de la idea a decisiones aplicadas con evidencia, iteración y atención práctica." }],
    founderEyebrow: "Nota del Fundador", founderTitle: "La educación en ingeniería se vuelve potente cuando permanece cerca del sistema real.", founderDescription: "Conoce al fundador y la premisa de MAE detrás de la plataforma: Modelar. Analizar. Ingeniería.", founderAction: "Entrar al archivo del fundador",
  },
  collections: {
    research: {
      eyebrow: "01 / Investigación académica", title: "Convierte la evidencia en dirección de ingeniería.", description: "Un catálogo de artículos de ingeniería de acceso abierto y motor de descubrimiento. Busca, lee y descarga investigaciones.", cards: [
        { title: "Sistemas como evidencia", description: "Convierte preguntas complejas de ingeniería en rutas de investigación trazables y comprobables.", code: "R.01" }, { title: "Mecánica aplicada", description: "Explora la relación entre materiales, fuerza y restricciones reales.", code: "R.02" }, { title: "Infraestructura inteligente", description: "Investiga los patrones de detección, retroalimentación y resiliencia que dan forma a los sistemas cívicos.", code: "R.03" }, { title: "Transiciones energéticas", description: "Traza opciones técnicas emergentes en generación limpia y distribución.", code: "R.04" }, { title: "Diseño computacional", description: "Estudia modelos procedimentales que convierten restricciones en nuevas posibilidades.", code: "R.05" }, { title: "Ética de la ingeniería", description: "Prueba las suposiciones sociales, ambientales y humanas dentro de cada sistema.", code: "R.06" },
      ]
    },
    courses: {
      eyebrow: "02 / Cursos académicos", title: "Avanza a través de la lógica de crear.", description: "Un campo modular de cursos que conecta teoría, rigor analítico y hábitos de decisión de ingenieros en práctica.", cards: [
        { title: "Pensamiento de modelos", description: "Construye un modelo mental disciplinado antes de pasar al cálculo o al código.", code: "C.01" }, { title: "Estudio de análisis", description: "Aprende herramientas prácticas para interpretar sistemas técnicos y su comportamiento.", code: "C.02" }, { title: "Fundamentos de ingeniería", description: "Refuerza la base cuantitativa y conceptual detrás de decisiones de diseño seguras.", code: "C.03" }, { title: "Datos para ingenieros", description: "Convierte mediciones en perspectivas, decisiones y argumentos transparentes.", code: "C.04" }, { title: "Diseño bajo restricciones", description: "Trabaja con compensaciones materiales, espaciales, financieras y operativas.", code: "C.05" }, { title: "Liderazgo en sistemas", description: "Desarrolla una perspectiva clara para guiar equipos a través de trabajo técnico complejo.", code: "C.06" },
      ]
    },
    simulations: {
      eyebrow: "03 / Simulaciones prácticas", title: "Prueba la variable. Lee la respuesta.", description: "Los espacios de simulación convierten relaciones abstractas en experimentos visuales y repetibles diseñados para el aprendizaje aplicado.", cards: [
        { title: "Laboratorio de carga de puentes", description: "Evalúa rutas de fuerza y respuesta estructural en condiciones cambiantes.", code: "S.01" }, { title: "Equilibrio de red", description: "Prueba la demanda energética, la capacidad de generación y el comportamiento resiliente del sistema.", code: "S.02" }, { title: "Flujo urbano", description: "Modela movimiento, densidad e intervenciones en una red urbana conectada.", code: "S.03" }, { title: "Esfuerzo de materiales", description: "Examina cómo reaccionan los materiales cuando interactúan carga, calor y tiempo.", code: "S.04" }, { title: "Lógica del agua", description: "Sigue un sistema de agua desde la captación hasta el tratamiento, uso y recuperación.", code: "S.05" }, { title: "Sala de control", description: "Practica decisiones en un escenario de ingeniería vivo y multivariable.", code: "S.06" },
      ]
    },
  },
  about: { eyebrow: "04 / Acerca de MAE", title: "Modelar. Analizar. Ingeniería.", intro: "MAE Academy es una plataforma académica global que transforma la curiosidad de ingeniería en modelos estructurados, claridad analítica y práctica aplicada.", founderEyebrow: "FUNDADOR / 001", founderName: "Mohammad AbuElyan", founderFullName: "Mohammed Jihad Jamal Abu Elyan", paragraphOne: "MAE también refleja las iniciales del fundador. Es una invitación a tratar la educación en ingeniería como una disciplina viva: una en la que los estudiantes construyen un modelo, examinan sus supuestos y lo prueban frente a condiciones significativas.", paragraphTwo: "Como fundador y educador de ingeniería, Mohammad AbuElyan da forma a MAE Academy a partir de investigación rigurosa, experimentación práctica y una cultura de aprendizaje accesible internacionalmente.", principles: [{ label: "MODELAR", value: "Estructura" }, { label: "ANALIZAR", value: "Perspectiva" }, { label: "INGENIERÍA", value: "Acción" }] },
  blueprints: { visual: { hero: { label: blueprintPaths.visual.es[0][0], sublabel: blueprintPaths.visual.es[0][1] }, research: { label: blueprintPaths.visual.es[1][0], sublabel: blueprintPaths.visual.es[1][1] }, courses: { label: blueprintPaths.visual.es[2][0], sublabel: blueprintPaths.visual.es[2][1] }, simulations: { label: blueprintPaths.visual.es[3][0], sublabel: blueprintPaths.visual.es[3][1] }, orbital: { label: blueprintPaths.visual.es[4][0], sublabel: blueprintPaths.visual.es[4][1] } }, stations: { research: [{ label: "MAPA DE EVIDENCIA", sublabel: "Sistemas como evidencia" }, { label: "TRAZA DE FUERZA", sublabel: "Mecánica aplicada" }, { label: "RED CÍVICA", sublabel: "Infraestructura inteligente" }, { label: "VECTOR ENERGÉTICO", sublabel: "Transiciones energéticas" }, { label: "CAMPO PROCEDIMENTAL", sublabel: "Diseño computacional" }, { label: "MATRIZ ÉTICA", sublabel: "Ética de la ingeniería" }], courses: [{ label: "ESCALERA DE MODELOS", sublabel: "Pensamiento de modelos" }, { label: "RUTA DE ANÁLISIS", sublabel: "Estudio de análisis" }, { label: "CONJUNTO BASE", sublabel: "Fundamentos de ingeniería" }, { label: "SEÑAL DE DATOS", sublabel: "Datos para ingenieros" }, { label: "BUCLE DE RESTRICCIONES", sublabel: "Diseño bajo restricciones" }, { label: "EJE DE LIDERAZGO", sublabel: "Liderazgo en sistemas" }], simulations: [{ label: "PRUEBA DE CARGA", sublabel: "Laboratorio de puentes" }, { label: "EQUILIBRIO DE RED", sublabel: "Equilibrio energético" }, { label: "RED DE FLUJO", sublabel: "Flujo urbano" }, { label: "CAMPO DE ESFUERZO", sublabel: "Esfuerzo de materiales" }, { label: "LÓGICA DEL AGUA", sublabel: "Sistema de agua" }, { label: "BUCLE DE CONTROL", sublabel: "Sala de control" }] }, avatar: { aria: "Ilustración de Leo con casco y gafas", archive: "LEO / ARCHIVO DE CAMPO", reference: "REF. 001" } },
  notFound: { title: "Página no encontrada", description: "La página que buscas no existe o se ha movido.", action: "Ir al inicio" },
};

export const localizedContent: Record<Locale, LocaleContent> = { en, ar, es };

localizedContent.en.collections.simulations = {
  eyebrow: "03 / Practical Simulations",
  title: "Build, test, and read the system response.",
  description: "Applied laboratories for control, electronics, computation, mathematics, and connected engineering systems.",
  cards: [
    { title: "Control Systems", description: "Tune feedback, stability, and transient response inside a visible control loop.", code: "S.01" },
    { title: "Electrical Circuits", description: "Probe current, voltage, and signal behavior across an interactive circuit bench.", code: "S.02" },
    { title: "Power Electronics", description: "Test switching topologies, conversion stages, and power-flow decisions.", code: "S.03" },
    { title: "Code Studio", description: "Interactive Multi-Language Simulation & Trace Studio (MASM 8086, Python, C++, C).", code: "S.04" },
    { title: "PLC", description: "Build ladder logic and observe industrial control sequences in motion.", code: "S.05" },
    { title: "Signals and Systems", description: "Transform, filter, and interpret signals across time and frequency domains.", code: "S.06" },
    { title: "Digital Logic Design", description: "Compose gates, truth states, and logic paths into working digital systems.", code: "S.07" },
    { title: "Arduino Studio", description: "Embedded Systems & Microcontrollers: write Arduino C++ and watch an interactive UNO board, serial monitor, and live plotter respond.", code: "S.08" },
    { title: "Pneumatics and Hydraulic Drive", description: "Interactive electro-pneumatic and hydraulic circuit simulation with animated component dissection.", code: "S.09" },
  ],
};
localizedContent.ar.collections.simulations = {
  eyebrow: "03 / المحاكاة العملية",
  title: "ابنِ النظام، اختبره، واقرأ استجابته.",
  description: "مختبرات تطبيقية للتحكم والإلكترونيات والحوسبة والرياضيات والأنظمة الهندسية المتصلة.",
  cards: [
    { title: "أنظمة التحكم", description: "اضبط التغذية الراجعة والاستقرار والاستجابة العابرة داخل حلقة تحكم مرئية.", code: "S.01" },
    { title: "الدوائر الكهربائية", description: "افحص التيار والجهد وسلوك الإشارة عبر منصة دوائر تفاعلية.", code: "S.02" },
    { title: "إلكترونيات القدرة", description: "اختبر طوبولوجيا التبديل ومراحل التحويل وقرارات تدفق القدرة.", code: "S.03" },
    { title: "محرر الأكواد", description: "استوديو تفاعلي متعدد اللغات للمحاكاة والتتبع (MASM 8086, Python, C++, C).", code: "S.04" },
    { title: "PLC", description: "ابنِ منطق السلم وراقب تسلسلات التحكم الصناعي أثناء الحركة.", code: "S.05" },
    { title: "الإشارات والأنظمة", description: "حوّل الإشارات ورشّحها وفسّرها عبر نطاقي الزمن والتردد.", code: "S.06" },
    { title: "تصميم المنطق الرقمي", description: "ركّب البوابات وحالات الحقيقة ومسارات المنطق في أنظمة رقمية عاملة.", code: "S.07" },
    { title: "استوديو الأردوينو", description: "الأنظمة المدمجة والمتحكمات: اكتب شيفرة أردوينو C++ وشاهد لوحة UNO التفاعلية ومراقب التسلسل والراسم الحي وهي تستجيب.", code: "S.08" },
    { title: "محاكي أنظمة النيوماتيك والهيدروليك", description: "محاكاة تفاعلية للدوائر النيوماتيكية والهيدروليكية مع تشريح داخلي لميكانيزم الصمامات والسلندرات.", code: "S.09" },
  ],
};
localizedContent.es.collections.simulations = {
  eyebrow: "03 / Simulaciones prácticas",
  title: "Construye, prueba y lee la respuesta del sistema.",
  description: "Laboratorios aplicados para control, electrónica, computación, matemáticas y sistemas de ingeniería conectados.",
  cards: [
    { title: "Sistemas de control", description: "Ajusta retroalimentación, estabilidad y respuesta transitoria en un bucle de control visible.", code: "S.01" },
    { title: "Circuitos Eléctricos", description: "Mide corriente, voltaje y comportamiento de señales en un banco de circuitos interactivo.", code: "S.02" },
    { title: "Electrónica de potencia", description: "Prueba topologías de conmutación, etapas de conversión y decisiones de flujo de potencia.", code: "S.03" },
    { title: "Estudio de Código", description: "Estudio interactivo de simulación y trazado multilenguaje (MASM 8086, Python, C++, C).", code: "S.04" },
    { title: "PLC", description: "Construye lógica de escalera y observa secuencias de control industrial en movimiento.", code: "S.05" },
    { title: "Señales y sistemas", description: "Transforma, filtra e interpreta señales en los dominios del tiempo y la frecuencia.", code: "S.06" },
    { title: "Diseño de lógica digital", description: "Compone compuertas, estados de verdad y rutas lógicas en sistemas digitales funcionales.", code: "S.07" },
    { title: "Estudio Arduino", description: "Sistemas embebidos y microcontroladores: escribe C++ de Arduino y observa la placa UNO interactiva, el monitor serie y el graficador en vivo.", code: "S.08" },
    { title: "Accionamiento neumático e hidráulico", description: "Simulación interactiva de circuitos electroneumáticos e hidráulicos con disección animada de componentes.", code: "S.09" },
  ],
};

localizedContent.en.blueprints.stations.simulations = [
  { label: "CONTROL LOOP", sublabel: "Control systems" }, { label: "CIRCUIT BENCH", sublabel: "Electrical Circuits" }, { label: "POWER STAGE", sublabel: "Power electronics" }, { label: "CODE STUDIO", sublabel: "Code Studio" }, { label: "LADDER LOGIC", sublabel: "PLC" }, { label: "SIGNAL FIELD", sublabel: "Signals and systems" }, { label: "GATE ARRAY", sublabel: "Digital logic design" }, { label: "MATRIX PLANE", sublabel: "Linear algebra" }, { label: "ARDUINO BENCH", sublabel: "Arduino Studio" },
];
localizedContent.ar.blueprints.stations.simulations = [
  { label: "حلقة التحكم", sublabel: "أنظمة التحكم" }, { label: "منصة الدوائر", sublabel: "الدوائر الكهربائية" }, { label: "مرحلة القدرة", sublabel: "إلكترونيات القدرة" }, { label: "CODE STUDIO", sublabel: "Code Studio" }, { label: "منطق السلم", sublabel: "PLC" }, { label: "مجال الإشارة", sublabel: "الإشارات والأنظمة" }, { label: "مصفوفة البوابات", sublabel: "تصميم المنطق الرقمي" }, { label: "مستوى المصفوفة", sublabel: "الجبر الخطي" }, { label: "منصة الأردوينو", sublabel: "استوديو الأردوينو" },
];
localizedContent.es.blueprints.stations.simulations = [
  { label: "BUCLE DE CONTROL", sublabel: "Sistemas de control" }, { label: "BANCO DE CIRCUITOS", sublabel: "Circuitos Eléctricos" }, { label: "ETAPA DE POTENCIA", sublabel: "Electrónica de potencia" }, { label: "CODE STUDIO", sublabel: "Code Studio" }, { label: "LÓGICA DE ESCALERA", sublabel: "PLC" }, { label: "CAMPO DE SEÑAL", sublabel: "Señales y sistemas" }, { label: "MATRIZ DE COMPUERTAS", sublabel: "Diseño de lógica digital" }, { label: "PLANO MATRICIAL", sublabel: "Álgebra lineal" }, { label: "BANCO ARDUINO", sublabel: "Arduino Studio" },
];
