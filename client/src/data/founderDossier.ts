/**
 * MAE Academy Data Layer: Founder Curriculum Vitae & Dossier Registry.
 * Completely decoupled data architecture for high-end editorial engineering CV.
 * Strictly free of emojis, academic-grade terminology, and fully typed for rapid updates.
 */

export interface LocalizedString {
  en: string;
  ar: string;
}

export interface FounderProfile {
  name: {
    en: string;
    ar: string;
    fullNameEn: string;
    fullNameAr: string;
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
    fullNameEn: "Mohammad Jihad Jamal AbuElyan",
    fullNameAr: "محمد جهاد جمال أبو عليان",
  },
  title: {
    en: "Mechatronics Engineer & Educational Tutor",
    ar: "مهندس ميكاترونكس ومعلّم هندسي",
  },
  institution: {
    en: "Al-Balqa Applied University – Faculty of Engineering Technology (FET / Polytechnic)",
    ar: "جامعة البلقاء التطبيقية – كلية الهندسة التكنولوجية (البوليتكنك)",
  },
  department: {
    en: "Department of Mechatronics Engineering",
    ar: "قسم هندسة الميكاترونكس",
  },
  standing: {
    en: "Senior Engineering Student",
    ar: "طالب سنة متقدمة في الهندسة",
  },
  expectedGraduation: "2028",
  bio: {
    en: "Focus on bridging the gap between physical hardware dynamics and intuitive digital simulations, driving both academic research and open-access engineering education.",
    ar: "التركيز على ردم الفجوة بين ديناميكا الأنظمة الفيزيائية والمحاكاة الرقمية التفاعلية، لدفع البحث الأكاديمي والتعليم الهندسي المفتوح.",
  },
  philosophyParagraphs: [
    {
      en: "Driven by mechatronic systems integration, applied mathematics, and the architecture of physical-to-digital educational platforms. Specializing in control dynamics, embedded microarchitectures, and real-time numerical simulation models.",
      ar: "مدفوع بالتكامل العميق بين أنظمة الميكاترونكس والرياضيات التطبيقية وهندسة المنصات التعليمية الرقمية. متخصص في ديناميكا أنظمة التحكم والمعالجات المدمجة ونماذج المحاكاة الفيزيائية في الوقت الفعلي.",
    },
    {
      en: "As founder of MAE Academy, dedicated to building rigorous, open-access technical computation frameworks and simulation engines for engineering students, transforming abstract derivations into tangible, verifiable digital laboratories.",
      ar: "بصفته مؤسس أكاديمية MAE، يكرس جهوده لبناء بيئات محاكاة هندسية مفتوحة ومتقدمة، تحوّل الاشتقاقات النظرية المجردة إلى مختبرات رقمية تفاعلية قابلة للفحص والتحقق العملي.",
    },
  ],
};

export const impactMetrics: ImpactMetric[] = [
  {
    id: "metric-community",
    value: "80K+",
    label: {
      en: "Active Community",
      ar: "مجتمع هندسي متفاعل",
    },
    sublabel: {
      en: "Students & Researchers",
      ar: "طلاب وباحثون",
    },
  },
  {
    id: "metric-views",
    value: "26M+",
    label: {
      en: "Content Views",
      ar: "مشاهدات المحتوى التعليمي",
    },
    sublabel: {
      en: "Digital Lectures & Guides",
      ar: "محاضرات ودروس مرئية",
    },
  },
  {
    id: "metric-gpa",
    value: "3.84",
    label: {
      en: "Cumulative GPA",
      ar: "المعدل التراكمي",
    },
    sublabel: {
      en: "Out of 4.00 Scale",
      ar: "من أصل 4.00 سلم الامتياز",
    },
  },
  {
    id: "metric-credits",
    value: "110",
    label: {
      en: "Credits Completed",
      ar: "ساعة معتمدة منجزة",
    },
    sublabel: {
      en: "Zero Academic Warnings",
      ar: "سجل أكاديمي خالٍ من الإنذارات",
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
    },
    category: {
      en: "Full Video Course",
      ar: "مساق مرئي متكامل",
    },
    platformOrFormat: "YouTube (@MAE.Academy)",
    link: "https://www.youtube.com/@MAE.Academy",
    isExternal: true,
    linkText: {
      en: "Watch on YouTube",
      ar: "مشاهدة على يوتيوب",
    },
    description: {
      en: "Animated video lecture series visualizing dynamic physical modeling, s-domain stability, root locus loci, and frequency response analysis with real-world engineering plants.",
      ar: "سلسلة فيديوهات متحركة ومبسطة لشرح نمذجة الأنظمة الديناميكية، استقرار مستوى s، المحل الهندسي للجذور (Root Locus)، وتحليل الاستجابة الترددية للمنظومات الصناعية.",
    },
  },
  {
    id: "signals-systems-guide",
    title: {
      en: "Signals & Systems Comprehensive Study Guide",
      ar: "الدليل الشامل في الإشارات والأنظمة",
    },
    category: {
      en: "Reference Study Guide",
      ar: "دليل دراسي منهجي",
    },
    platformOrFormat: "PDF Monograph",
    link: "/library",
    isExternal: false,
    linkText: {
      en: "Access in Library",
      ar: "استعراض في المكتبة",
    },
    description: {
      en: "Rigorous technical reference monograph covering continuous/discrete transforms, frequency spectra, convolution integrals, difference equations, and stability criteria.",
      ar: "مرجع تقني منهجي يتناول تصنيفات الإشارات، تكاملات الالتفاف، معادلات الفروق، التحويلات المتصلة والمنفصلة، وتوزيع الأقطاب والأصفار في مستوى s و z.",
    },
  },
  {
    id: "sensors-actuators-manual",
    title: {
      en: "Sensors & Actuators Laboratory Manual",
      ar: "دليل مختبر الحساسات والمشغلات الميكانيكية",
    },
    category: {
      en: "Laboratory Manual",
      ar: "دليل تجارب مخبري",
    },
    platformOrFormat: "Lab Protocols & Schematics",
    link: "/library",
    isExternal: false,
    linkText: {
      en: "Access in Library",
      ar: "استعراض في المكتبة",
    },
    description: {
      en: "Procedural laboratory protocols bridging analog transducer measurements (strain gauges, RTDs, thermocouples, LVDTs) with precision operational amplifier signal conditioning circuits.",
      ar: "دليل إجرائي مخبري يربط القياسات التناظرية للحساسات والمحولات الصناعية بدوائر مضخمات العمليات الدقيقة لتحويل الإشارات وترشيحها ومعايرتها عملياً.",
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
    },
    roleAchievement: {
      en: "4th Place Nationally",
      ar: "المركز الرابع على مستوى المملكة",
    },
    year: "National Contest",
    imageSrc: "",
    details: {
      en: "Engineered autonomous micromouse pathfinding utilizing dynamic decision-tree maze traversal, sub-centimeter wall tracking, and low-latency motor encoder feedback calibration.",
      ar: "تطوير روبوت استكشاف متاهات ذاتي التحكم مع خوارزميات ملاحة تعتمد شجرة القرارات، وحساب مسافات فائق الدقة، ومعايرة مشفرات المحركات بتأخير زمني أدنى.",
    },
  },
  {
    id: "htu-sumo-contest",
    event: {
      en: "HTU Sumo Robot Contest",
      ar: "مسابقة روبوتات السومو - جامعة الحسين التقنية",
    },
    roleAchievement: {
      en: "Round of 16 Finalist",
      ar: "التأهل لدور الستة عشر (Finalist)",
    },
    year: "National Finals",
    imageSrc: "",
    details: {
      en: "Designed and programmed a competitive 3-kg class combat robot featuring aggressive target acquisition, microsecond optical boundary interrupters, and high-torque ground engagement.",
      ar: "تصميم وبرمجة روبوت قتالي فئة 3 كغم يتميز بالاستحواذ السريع على الهدف، واستشعار حواف الحلبة بالميكروثانية، وتوليد عزم تدافع أرضي فائق مع شاسيه مخصص.",
    },
  },
  {
    id: "nlfrc-line-follower",
    event: {
      en: "National Line Follower Robotics Competition (NLFRC)",
      ar: "المسابقة الوطنية للروبوت متتبع المسار (NLFRC)",
    },
    roleAchievement: {
      en: "Official Competitor",
      ar: "مشارك رسمي معتمد",
    },
    year: "National League",
    imageSrc: "",
    details: {
      en: "Engineered high-speed trajectory tracking using a multiplexed analog phototransistor sensor array sampled at 1 kHz with discrete closed-loop PID steering and derivative damping.",
      ar: "تتبع المسارات عالية السرعة عبر مصفوفة حساسات ضوئية تمثيلية بتردد أخذ عينات 1 كيلوهرتز مع ضبط تحكم PID رقمي مغلق الحلقة ومعالجة التشبع وتخميد المشتقة.",
    },
  },
];

export const academicLeadershipRoles: AcademicLeadership[] = [
  {
    id: "spectrum-team",
    role: {
      en: "Head of Academic Office",
      ar: "رئيس المكتب الأكاديمي",
    },
    organization: {
      en: "Spectrum Team",
      ar: "فريق سبيكتروم الهندسي",
    },
    status: "Former",
    statusBadge: {
      en: "Former",
      ar: "سابقًا",
    },
    logo: "/spectrum-logo.png",
    contribution: {
      en: "Directed the academic office in authoring, standardizing, and publishing verified exam solutions, study banks, and comprehensive revision guides across foundational mechatronics and electrical coursework.",
      ar: "إدارة المكتب الأكاديمي في تأليف وتدقيق ونشر بنوك الأسئلة المعتمدة، والحلول النموذجية للامتحانات، والملخصات المنهجية الشاملة لمساقات هندسة الميكاترونكس والكهرباء الأساسية.",
    },
    keyPillars: [
      {
        en: "Systematized institutional exam solution archives across foundational mechatronics and electrical courses.",
        ar: "أرشفة وتوثيق الحلول النموذجية لمساقات هندسة الميكاترونكس والكهرباء الأساسية لتخدم أجيالاً متتالية من الطلبة.",
      },
      {
        en: "Orchestrated academic review boards to eliminate pedagogical ambiguities in technical derivations.",
        ar: "تنسيق لجان مراجعة وتدقيق متخصصة لضمان دقة الشروحات والاشتقاقات الرياضية المعقدة في المواد الأساسية.",
      },
      {
        en: "Established standardized LaTeX-authored revision manuals distributed to hundreds of engineering undergraduates.",
        ar: "إصدار ملخصات مكتوبة بنظام LaTeX وتوزيعها على مئات من طلبة كلية الهندسة التكنولوجية.",
      },
    ],
  },
  {
    id: "athar-team",
    role: {
      en: "Academic Lead",
      ar: "المسؤول الأكاديمي",
    },
    organization: {
      en: "Athar Team",
      ar: "فريق أثر الأكاديمي",
    },
    status: "Current",
    statusBadge: {
      en: "Current",
      ar: "حاليًا",
    },
    logo: "/athar-logo.png",
    contribution: {
      en: "Spearheading cohort-level mentorship, curriculum accessibility initiatives, interactive problem clinics, and hands-on laboratory instrumentation workshops for engineering undergraduates.",
      ar: "قيادة برامج الإرشاد الأكاديمي على مستوى الدفعة، ومبادرات تيسير المناهج الهندسية، وورش العمل التطبيقية لتدريب الطلبة على أجهزة القياس والمختبرات الميدانية.",
    },
    keyPillars: [
      {
        en: "Directing structured review sessions in control engineering, digital systems, and embedded computing.",
        ar: "إدارة جلسات تقوية أكاديمية ودروس مساندة منتظمة في هندسة التحكم والأنظمة الرقمية والمعالجات المدمجة.",
      },
      {
        en: "Formulating laboratory onboarding roadmaps to prepare junior students for hardware instrumentation.",
        ar: "بناء مسارات إرشادية وتدريبية للطلبة المستجدين لتمكينهم من التعامل الاحترافي مع أجهزة القياس المخبرية.",
      },
      {
        en: "Bridging faculty curriculum objectives with open, student-led collaborative study sessions.",
        ar: "تعزيز الربط الفعال والمثمر بين مخرجات التعلم المعتمدة وجلسات الدراسة التشاركية بين الطلاب.",
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
    },
    address: "32315018039@std.bau.edu.jo",
    href: "mailto:32315018039@std.bau.edu.jo",
    type: "institutional",
    description: {
      en: "Official university channel for academic verification, research correspondence, and collegiate inquiries.",
      ar: "القناة الرسمية المعتمدة للتحقق الأكاديمي والمراسلات البحثية والجامعية في جامعة البلقاء.",
    },
  },
  {
    id: "platform-email",
    platform: "Platform Business Email",
    label: {
      en: "Platform Business Email",
      ar: "البريد الإداري والتنفيذي للمنصة",
    },
    address: "maeacademy2026@gmail.com",
    href: "mailto:maeacademy2026@gmail.com",
    type: "platform",
    description: {
      en: "Direct editorial and administrative inbox for MAE Academy curriculum partnerships, simulator feedback, and lectures.",
      ar: "صندوق المراسلات الإدارية والشراكات الأكاديمية ومقترحات محركات المحاكاة لأكاديمية MAE.",
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
