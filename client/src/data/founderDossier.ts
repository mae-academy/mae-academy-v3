/**
 * MAE Academy Data Layer: Founder Curriculum Vitae & Dossier Registry.
 * Completely decoupled data architecture for high-end editorial engineering CV.
 * Strictly free of emojis, academic-grade terminology, and fully typed for rapid updates.
 */

export interface LocalizedString {
  en: string;
  ar: string;
  es: string;
}

export interface FounderProfile {
  name: {
    en: string;
    ar: string;
    es: string;
    fullNameEn: string;
    fullNameAr: string;
    fullNameEs: string;
  };
  title: LocalizedString;
  institution: LocalizedString;
  department: LocalizedString;
  standing: LocalizedString;
  expectedGraduation: string;
  bio: LocalizedString;
  philosophyParagraphs: Array<LocalizedString>;
}

export interface ImpactMetric {
  id: string;
  value: string;
  label: LocalizedString;
  sublabel: LocalizedString;
}

export interface AuthoredWork {
  id: string;
  title: LocalizedString;
  category: LocalizedString;
  platformOrFormat: string;
  link: string;
  isExternal?: boolean;
  linkText: LocalizedString;
  description: LocalizedString;
  keyTopics?: Array<LocalizedString>;
}

export interface RoboticsContest {
  id: string;
  event: LocalizedString;
  roleAchievement: LocalizedString;
  year: string;
  imageSrc: string;
  details: LocalizedString;
}

export interface AcademicLeadership {
  id: string;
  role: LocalizedString;
  organization: LocalizedString;
  status: "Former" | "Current";
  statusBadge: LocalizedString;
  logo: string;
  contribution: LocalizedString;
  keyPillars: Array<LocalizedString>;
}

export interface OfficialContactChannel {
  id: string;
  platform: string;
  label: LocalizedString;
  address: string;
  href: string;
  type: "institutional" | "platform";
  description: LocalizedString;
}

export interface SocialLink {
  id: string;
  platform: string;
  label: string;
  url: string;
  ariaLabel: string;
}

export const founderProfile: FounderProfile = {
  name: {
    en: "Mohammad AbuElyan",
    ar: "محمد جهاد جمال أبو عليان",
    es: "Mohammad AbuElyan",
    fullNameEn: "Mohammad Jihad Jamal AbuElyan",
    fullNameAr: "محمد جهاد جمال أبو عليان",
    fullNameEs: "Mohammad Jihad Jamal AbuElyan",
  },
  title: {
    en: "Mechatronics Engineer & Educational Tutor",
    ar: "مهندس ميكاترونكس ومعلّم هندسي",
    es: "Ingeniero en Mecatrónica y Tutor Educativo",
  },
  institution: {
    en: "Al-Balqa Applied University – Faculty of Engineering Technology (FET / Polytechnic)",
    ar: "جامعة البلقاء التطبيقية – كلية الهندسة التكنولوجية (البوليتكنك)",
    es: "Universidad Aplicada de Al-Balqa – Facultad de Tecnología de Ingeniería (FET / Politécnico)",
  },
  department: {
    en: "Department of Mechatronics Engineering",
    ar: "قسم هندسة الميكاترونكس",
    es: "Departamento de Ingeniería Mecatrónica",
  },
  standing: {
    en: "Senior Engineering Student",
    ar: "طالب سنة متقدمة في الهندسة",
    es: "Estudiante Avanzado de Ingeniería",
  },
  expectedGraduation: "2028",
  bio: {
    en: "Focus on bridging the gap between physical hardware dynamics and intuitive digital simulations, driving both academic research and open-access engineering education.",
    ar: "التركيز على ردم الفجوة بين ديناميكا الأنظمة الفيزيائية والمحاكاة الرقمية التفاعلية، لدفع البحث الأكاديمي والتعليم الهندسي المفتوح.",
    es: "Enfocado en cerrar la brecha entre la dinámica de los sistemas físicos y las simulaciones digitales intuitivas, impulsando tanto la investigación académica como la educación en ingeniería de acceso abierto.",
  },
  philosophyParagraphs: [
    {
      en: "Driven by mechatronic systems integration, applied mathematics, and the architecture of physical-to-digital educational platforms. Specializing in control dynamics, embedded microarchitectures, and real-time numerical simulation models.",
      ar: "مدفوع بالتكامل العميق بين أنظمة الميكاترونكس والرياضيات التطبيقية وهندسة المنصات التعليمية الرقمية. متخصص في ديناميكا أنظمة التحكم والمعالجات المدمجة ونماذج المحاكاة الفيزيائية في الوقت الفعلي.",
      es: "Impulsado por la integración de sistemas mecatrónicos, las matemáticas aplicadas y la arquitectura de plataformas educativas que transforman lo físico en digital. Especializado en dinámica de control, microarquitecturas embebidas y modelos de simulación numérica en tiempo real.",
    },
    {
      en: "As founder of MAE Academy, dedicated to building rigorous, open-access technical computation frameworks and simulation engines for engineering students, transforming abstract derivations into tangible, verifiable digital laboratories.",
      ar: "بصفته مؤسس أكاديمية MAE، يكرس جهوده لبناء بيئات محاكاة هندسية مفتوحة ومتقدمة، تحوّل الاشتقاقات النظرية المجردة إلى مختبرات رقمية تفاعلية قابلة للفحص والتحقق العملي.",
      es: "Como fundador de MAE Academy, se dedica a construir marcos de cálculo técnico y motores de simulación rigurosos y de acceso abierto para estudiantes de ingeniería, convirtiendo derivaciones abstractas en laboratorios digitales tangibles y verificables.",
    },
  ],
};

export const impactMetrics: ImpactMetric[] = [
  {
    id: "metric-community",
    value: "100K+",
    label: {
      en: "Active Community",
      ar: "مجتمع هندسي متفاعل",
      es: "Comunidad Activa",
    },
    sublabel: {
      en: "Students & Researchers",
      ar: "طلاب وباحثون",
      es: "Estudiantes e investigadores",
    },
  },
  {
    id: "metric-views",
    value: "35M+",
    label: {
      en: "Content Views",
      ar: "مشاهدات المحتوى التعليمي",
      es: "Visualizaciones del Contenido",
    },
    sublabel: {
      en: "Digital Lectures & Guides",
      ar: "محاضرات ودروس مرئية",
      es: "Clases y guías digitales",
    },
  },
  {
    id: "metric-gpa",
    value: "3.84",
    label: {
      en: "Cumulative GPA",
      ar: "المعدل التراكمي",
      es: "Promedio Acumulado",
    },
    sublabel: {
      en: "Out of 4.00 Scale",
      ar: "من أصل 4.00 سلم الامتياز",
      es: "Sobre una escala de 4.00",
    },
  },
  {
    id: "metric-credits",
    value: "110",
    label: {
      en: "Credits Completed",
      ar: "ساعة معتمدة منجزة",
      es: "Créditos Completados",
    },
    sublabel: {
      en: "Zero Academic Warnings",
      ar: "سجل أكاديمي خالٍ من الإنذارات",
      es: "Sin advertencias académicas",
    },
  },
];

/**
 * Authored Works, Study Guides, and Educational Courses
 * Enriched with core syllabus modules for balanced structural symmetry.
 */
export const authoredWorks: AuthoredWork[] = [
  {
    id: "control-systems-course",
    title: {
      en: "Control Systems Comprehensive Course",
      ar: "كورس أنظمة التحكم الآلي الشامل",
      es: "Curso Integral de Sistemas de Control",
    },
    category: {
      en: "Full Video Course",
      ar: "مساق مرئي متكامل",
      es: "Curso en Video Completo",
    },
    platformOrFormat: "YouTube (@MAE.Academy)",
    link: "https://www.youtube.com/@MAE.Academy",
    isExternal: true,
    linkText: {
      en: "Watch on YouTube",
      ar: "مشاهدة على يوتيوب",
      es: "Ver en YouTube",
    },
    description: {
      en: "Animated video lecture series visualizing dynamic physical modeling, s-domain stability, root locus loci, and frequency response analysis with real-world engineering plants.",
      ar: "سلسلة فيديوهات متحركة ومبسطة لشرح نمذجة الأنظمة الديناميكية، استقرار مستوى s، المحل الهندسي للجذور (Root Locus)، وتحليل الاستجابة الترددية للمنظومات الصناعية.",
      es: "Serie de video-lecciones animadas que visualizan el modelado dinámico de sistemas, la estabilidad en el dominio s, el lugar geométrico de las raíces (Root Locus) y el análisis de respuesta en frecuencia con plantas de ingeniería reales.",
    },
  },
  {
    id: "signals-systems-guide",
    title: {
      en: "Signals & Systems Comprehensive Study Guide",
      ar: "الدليل الشامل في الإشارات والأنظمة",
      es: "Guía de Estudio Integral de Señales y Sistemas",
    },
    category: {
      en: "Reference Study Guide",
      ar: "دليل دراسي منهجي",
      es: "Guía de Estudio de Referencia",
    },
    platformOrFormat: "PDF Monograph",
    link: "/library",
    isExternal: false,
    linkText: {
      en: "Access in Library",
      ar: "استعراض في المكتبة",
      es: "Acceder en la Biblioteca",
    },
    description: {
      en: "Rigorous technical reference monograph covering continuous/discrete transforms, frequency spectra, convolution integrals, difference equations, and stability criteria.",
      ar: "مرجع تقني منهجي يتناول تصنيفات الإشارات، تكاملات الالتفاف، معادلات الفروق، التحويلات المتصلة والمنفصلة، وتوزيع الأقطاب والأصفار في مستوى s و z.",
      es: "Monografía técnica de referencia rigurosa que cubre transformadas continuas y discretas, espectros de frecuencia, integrales de convolución, ecuaciones en diferencias y criterios de estabilidad.",
    },
  },
  {
    id: "sensors-actuators-manual",
    title: {
      en: "Sensors & Actuators Laboratory Manual",
      ar: "دليل مختبر الحساسات والمشغلات الميكانيكية",
      es: "Manual de Laboratorio de Sensores y Actuadores",
    },
    category: {
      en: "Laboratory Manual",
      ar: "دليل تجارب مخبري",
      es: "Manual de Laboratorio",
    },
    platformOrFormat: "Lab Protocols & Schematics",
    link: "/library",
    isExternal: false,
    linkText: {
      en: "Access in Library",
      ar: "استعراض في المكتبة",
      es: "Acceder en la Biblioteca",
    },
    description: {
      en: "Procedural laboratory protocols bridging analog transducer measurements (strain gauges, RTDs, thermocouples, LVDTs) with precision operational amplifier signal conditioning circuits.",
      ar: "دليل إجرائي مخبري يربط القياسات التناظرية للحساسات والمحولات الصناعية بدوائر مضخمات العمليات الدقيقة لتحويل الإشارات وترشيحها ومعايرتها عملياً.",
      es: "Protocolos de laboratorio que conectan las mediciones de transductores analógicos (galgas extensiométricas, RTD, termopares, LVDT) con circuitos precisos de acondicionamiento de señal mediante amplificadores operacionales.",
    },

  },
];

/**
 * Competitive Robotics: Clean, high-precision telemetry and specs.
 */
export const roboticsCompetitions: RoboticsContest[] = [
  {
    id: "ieee-maze-contest",
    event: {
      en: "IEEE Robot Maze Contest",
      ar: "مسابقة الروبوت في المتاهة - IEEE",
      es: "Concurso de Robots Laberinto IEEE",
    },
    roleAchievement: {
      en: "4th Place Nationally",
      ar: "المركز الرابع على مستوى المملكة",
      es: "4.º Lugar a Nivel Nacional",
    },
    year: "National Contest",
    imageSrc: "",
    details: {
      en: "Engineered autonomous micromouse pathfinding utilizing dynamic decision-tree maze traversal, sub-centimeter wall tracking, and low-latency motor encoder feedback calibration.",
      ar: "تطوير روبوت استكشاف متاهات ذاتي التحكم مع خوارزميات ملاحة تعتمد شجرة القرارات، وحساب مسافات فائق الدقة، ومعايرة مشفرات المحركات بتأخير زمني أدنى.",
      es: "Desarrollo de un micromouse autónomo para la búsqueda de rutas mediante recorrido dinámico de laberintos basado en árboles de decisión, seguimiento de paredes con precisión submilimétrica y calibración de encoders de motor de baja latencia.",
    },
  },
  {
    id: "htu-sumo-contest",
    event: {
      en: "HTU Sumo Robot Contest",
      ar: "مسابقة روبوتات السومو - جامعة الحسين التقنية",
      es: "Concurso de Robots Sumo HTU",
    },
    roleAchievement: {
      en: "Round of 16 Finalist",
      ar: "التأهل لدور الستة عشر (Finalist)",
      es: "Finalista de Octavos de Final",
    },
    year: "National Finals",
    imageSrc: "",
    details: {
      en: "Designed and programmed a competitive 3-kg class combat robot featuring aggressive target acquisition, microsecond optical boundary interrupters, and high-torque ground engagement.",
      ar: "تصميم وبرمجة روبوت قتالي فئة 3 كغم يتميز بالاستحواذ السريع على الهدف، واستشعار حواف الحلبة بالميكروثانية، وتوليد عزم تدافع أرضي فائق مع شاسيه مخصص.",
      es: "Diseño y programación de un robot de combate de la categoría de 3 kg con adquisición rápida del objetivo, detección de bordes del ring mediante interruptores ópticos de microsegundos y alto par de empuje sobre el suelo, con chasis a medida.",
    },
  },
  {
    id: "nlfrc-line-follower",
    event: {
      en: "National Line Follower Robotics Competition (NLFRC)",
      ar: "المسابقة الوطنية للروبوت متتبع المسار (NLFRC)",
      es: "Concurso Nacional de Robots Seguidores de Línea (NLFRC)",
    },
    roleAchievement: {
      en: "Official Competitor",
      ar: "مشارك رسمي معتمد",
      es: "Competidor Oficial",
    },
    year: "National League",
    imageSrc: "",
    details: {
      en: "Engineered high-speed trajectory tracking using a multiplexed analog phototransistor sensor array sampled at 1 kHz with discrete closed-loop PID steering and derivative damping.",
      ar: "تتبع المسارات عالية السرعة عبر مصفوفة حساسات ضوئية تمثيلية بتردد أخذ عينات 1 كيلوهرتز مع ضبط تحكم PID رقمي مغلق الحلقة ومعالجة التشبع وتخميد المشتقة.",
      es: "Seguimiento de trayectorias de alta velocidad mediante un arreglo multiplexado de sensores fototransistores analógicos muestreado a 1 kHz, con dirección PID digital de lazo cerrado, manejo de saturación y amortiguamiento derivativo.",
    },
  },
];

export const academicLeadershipRoles: AcademicLeadership[] = [
  {
    id: "spectrum-team",
    role: {
      en: "Head of Academic Office",
      ar: "رئيس المكتب الأكاديمي",
      es: "Jefe de la Oficina Académica",
    },
    organization: {
      en: "Spectrum Team",
      ar: "فريق سبيكتروم الهندسي",
      es: "Equipo Spectrum",
    },
    status: "Former",
    statusBadge: {
      en: "Former",
      ar: "سابقًا",
      es: "Anterior",
    },
    logo: "/spectrum-logo.png",
    contribution: {
      en: "Directed the academic office in authoring, standardizing, and publishing verified exam solutions, study banks, and comprehensive revision guides across foundational mechatronics and electrical coursework.",
      ar: "إدارة المكتب الأكاديمي في تأليف وتدقيق ونشر بنوك الأسئلة المعتمدة، والحلول النموذجية للامتحانات، والملخصات المنهجية الشاملة لمساقات هندسة الميكاترونكس والكهرباء الأساسية.",
      es: "Dirigió la oficina académica en la redacción, estandarización y publicación de soluciones de exámenes verificadas, bancos de preguntas y guías de repaso integrales en las materias básicas de mecatrónica y electricidad.",
    },
    keyPillars: [
      {
        en: "Systematized institutional exam solution archives across foundational mechatronics and electrical courses.",
        ar: "أرشفة وتوثيق الحلول النموذجية لمساقات هندسة الميكاترونكس والكهرباء الأساسية لتخدم أجيالاً متتالية من الطلبة.",
        es: "Sistematización de los archivos institucionales de soluciones de exámenes en las materias básicas de mecatrónica y electricidad.",
      },
      {
        en: "Orchestrated academic review boards to eliminate pedagogical ambiguities in technical derivations.",
        ar: "تنسيق لجان مراجعة وتدقيق متخصصة لضمان دقة الشروحات والاشتقاقات الرياضية المعقدة في المواد الأساسية.",
        es: "Coordinación de comités de revisión académica para eliminar ambigüedades pedagógicas en las derivaciones técnicas.",
      },
      {
        en: "Established standardized LaTeX-authored revision manuals distributed to hundreds of engineering undergraduates.",
        ar: "إصدار ملخصات مكتوبة بنظام LaTeX وتوزيعها على مئات من طلبة كلية الهندسة التكنولوجية.",
        es: "Establecimiento de manuales de repaso estandarizados redactados en LaTeX, distribuidos a cientos de estudiantes de ingeniería de pregrado.",
      },
    ],
  },
  {
    id: "athar-team",
    role: {
      en: "Academic Lead",
      ar: "المسؤول الأكاديمي",
      es: "Responsable Académico",
    },
    organization: {
      en: "Athar Team",
      ar: "فريق أثر الأكاديمي",
      es: "Equipo Athar",
    },
    status: "Current",
    statusBadge: {
      en: "Current",
      ar: "حاليًا",
      es: "Actual",
    },
    logo: "/athar-logo.png",
    contribution: {
      en: "Spearheading cohort-level mentorship, curriculum accessibility initiatives, interactive problem clinics, and hands-on laboratory instrumentation workshops for engineering undergraduates.",
      ar: "قيادة برامج الإرشاد الأكاديمي على مستوى الدفعة، ومبادرات تيسير المناهج الهندسية، وورش العمل التطبيقية لتدريب الطلبة على أجهزة القياس والمختبرات الميدانية.",
      es: "Liderazgo de programas de mentoría a nivel de cohorte, iniciativas para facilitar el acceso a los planes de estudio, clínicas interactivas de problemas y talleres prácticos de instrumentación de laboratorio para estudiantes de ingeniería de pregrado.",
    },
    keyPillars: [
      {
        en: "Directing structured review sessions in control engineering, digital systems, and embedded computing.",
        ar: "إدارة جلسات تقوية أكاديمية ودروس مساندة منتظمة في هندسة التحكم والأنظمة الرقمية والمعالجات المدمجة.",
        es: "Dirección de sesiones de repaso estructuradas en ingeniería de control, sistemas digitales y computación embebida.",
      },
      {
        en: "Formulating laboratory onboarding roadmaps to prepare junior students for hardware instrumentation.",
        ar: "بناء مسارات إرشادية وتدريبية للطلبة المستجدين لتمكينهم من التعامل الاحترافي مع أجهزة القياس المخبرية.",
        es: "Elaboración de hojas de ruta de inducción al laboratorio para preparar a los estudiantes de nuevo ingreso en la instrumentación de hardware.",
      },
      {
        en: "Bridging faculty curriculum objectives with open, student-led collaborative study sessions.",
        ar: "تعزيز الربط الفعال والمثمر بين مخرجات التعلم المعتمدة وجلسات الدراسة التشاركية بين الطلاب.",
        es: "Vinculación de los objetivos curriculares de la facultad con sesiones de estudio colaborativo abiertas y dirigidas por estudiantes.",
      },
    ],
  },
];

export const officialChannels: OfficialContactChannel[] = [
  {
    id: "institutional-email",
    platform: "University Institutional Email",
    label: {
      en: "University Institutional Email",
      ar: "البريد الجامعي الأكاديمي الرسمي",
      es: "Correo Institucional Universitario",
    },
    address: "32315018039@std.bau.edu.jo",
    href: "mailto:32315018039@std.bau.edu.jo",
    type: "institutional",
    description: {
      en: "Official university channel for academic verification, research correspondence, and collegiate inquiries.",
      ar: "القناة الرسمية المعتمدة للتحقق الأكاديمي والمراسلات البحثية والجامعية في جامعة البلقاء.",
      es: "Canal oficial de la universidad para verificación académica, correspondencia de investigación y consultas universitarias.",
    },
  },
  {
    id: "platform-email",
    platform: "Platform Business Email",
    label: {
      en: "Platform Business Email",
      ar: "البريد الإداري والتنفيذي للمنصة",
      es: "Correo Comercial de la Plataforma",
    },
    address: "maeacademy2026@gmail.com",
    href: "mailto:maeacademy2026@gmail.com",
    type: "platform",
    description: {
      en: "Direct editorial and administrative inbox for MAE Academy curriculum partnerships, simulator feedback, and lectures.",
      ar: "صندوق المراسلات الإدارية والشراكات الأكاديمية ومقترحات محركات المحاكاة لأكاديمية MAE.",
      es: "Bandeja directa de correspondencia editorial y administrativa de MAE Academy para alianzas curriculares, comentarios sobre los simuladores y clases.",
    },
  },
];

export const verifiedSocialLinks: SocialLink[] = [
  {
    id: "linkedin",
    platform: "LinkedIn",
    label: "LinkedIn Professional Profile",
    url: "https://www.linkedin.com/in/mohammad-abuelyan-368ab8384/",
    ariaLabel: "Mohammad AbuElyan on LinkedIn",
  },
  {
    id: "youtube",
    platform: "YouTube",
    label: "MAE Academy YouTube Channel",
    url: "https://www.youtube.com/@MAE.Academy",
    ariaLabel: "MAE Academy on YouTube",
  },
  {
    id: "instagram",
    platform: "Instagram",
    label: "MAE Academy Instagram",
    url: "https://www.instagram.com/mae.academy/",
    ariaLabel: "MAE Academy on Instagram",
  },
  {
    id: "facebook",
    platform: "Facebook",
    label: "MAE Academy Facebook",
    url: "https://www.facebook.com/search/top?q=mae+academy&_rdc=1&_rdr",
    ariaLabel: "MAE Academy on Facebook",
  },
];
