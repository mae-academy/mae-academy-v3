const fs = require('fs');

const data = {
  en: {
    circuit: {
      electricalCircuitLab: "Electrical Circuit Lab",
      circuitLabDesc: "The engine models continuous-time electrical behavior using Modified Nodal Analysis (MNA) and SPICE algorithms. Build circuits, run the simulation, and interact with components like switches or potentiometers in real-time.",
      canvasReady: "Canvas Ready",
      dragDropHint: "Drag and drop components from the library to begin circuit design.",
      clickPlaceWire: "Click to place wire",
      simulating: "Simulating...",
      spiceAccuracyPass: "SPICE ACCURACY PASS…",
      spiceVerified: "SPICE-VERIFIED",
      spiceUnavailable: "SPICE UNAVAILABLE · LIVE ENGINE",
      checkWarnings: "CHECK CIRCUIT WARNINGS",
      academicWorkspace: "Academic Analysis Workspace",
      showHideElectrons: "Show / Hide electron flow",
      resetSim: "Reset simulation",
      simulationSpeed: "Simulation speed",
      passives: "Passives",
      semiconductors: "Semiconductors",
      resistor: "Resistor",
      capacitor: "Capacitor",
      inductor: "Inductor"
    },
    control: {
      stepsTitle: "Root Locus Analytical Steps",
      step1Title: "Step 1: Poles and Zeros",
      step1Desc: "Identify the finite open-loop poles and zeros.",
      step2Title: "Step 2: Real Axis Segments",
      step2Desc: "The root locus exists on the real axis to the left of an odd number of total real poles and zeros.",
      step2Sub: "Odd count condition applies to all real poles & zeros from right to left along",
      step3Title: "Step 3: Infinite Roots",
      step3Desc: "Count the branches that go to infinity.",
      step4Title: "Step 4: Asymptotes",
      step4Desc: "Calculate the centroid",
      step4Sub: "Angles (Degrees)",
      step4None: "No asymptotes exist since",
      step5Title: "Step 5: Breakaway/Break-in Points",
      step5Desc: "Solve",
      step5Sub: "for real roots on the locus.",
      step5None: "None detected",
      step6Title: "Step 6: Imaginary Axis Crossing",
      step6Desc: "Found via Routh-Hurwitz array zero-row criteria and auxiliary polynomial roots.",
      step6None: "No stability boundary crossed"
    },
    assembler: {
      memoryViews: "Memory Views",
      traceLogs: "Trace Logs",
      executionErrors: "Execution Errors",
      compiling: "[Compiling & Linking...]",
      executing: "Executing program...",
      executionStopped: "Execution stopped. Check diagnostics below.",
      outputConsoleReady: "Output console ready. Click 'Run' to execute.",
      waitingInput: "Waiting for input — type a key…",
      keyboardEntry: "Keyboard entry (stdin buffer)…"
    }
  },
  ar: {
    circuit: {
      electricalCircuitLab: "مختبر الدوائر الكهربائية",
      circuitLabDesc: "يحاكي المحرك السلوك الكهربائي في الوقت المستمر باستخدام تحليل العقد المعدل (MNA) وخوارزميات سبايس (SPICE). قم ببناء الدوائر، وتشغيل المحاكاة، والتفاعل مع المكونات مثل المفاتيح أو مقاييس الجهد في الوقت الفعلي.",
      canvasReady: "الكانفس جاهز",
      dragDropHint: "اسحب وأفلت المكونات من المكتبة لبدء تصميم الدائرة.",
      clickPlaceWire: "انقر لوضع السلك",
      simulating: "جاري المحاكاة...",
      spiceAccuracyPass: "تم اجتياز دقة SPICE...",
      spiceVerified: "تم التحقق بواسطة SPICE",
      spiceUnavailable: "SPICE غير متوفر · محرك مباشر",
      checkWarnings: "تحقق من تحذيرات الدائرة",
      academicWorkspace: "مساحة التحليل الأكاديمي",
      showHideElectrons: "إظهار / إخفاء تدفق الإلكترونات",
      resetSim: "إعادة ضبط المحاكاة",
      simulationSpeed: "سرعة المحاكاة",
      passives: "السلبيات",
      semiconductors: "أشباه الموصلات",
      resistor: "مقاوم",
      capacitor: "مكثف",
      inductor: "محث"
    },
    control: {
      stepsTitle: "الخطوات التحليلية لمسار الجذور",
      step1Title: "الخطوة 1: الأقطاب والأصفار",
      step1Desc: "تحديد الأقطاب والأصفار المحدودة للحلقة المفتوحة.",
      step2Title: "الخطوة 2: أجزاء المحور الحقيقي",
      step2Desc: "يوجد مسار الجذور على المحور الحقيقي إلى يسار عدد فردي من إجمالي الأقطاب والأصفار الحقيقية.",
      step2Sub: "ينطبق شرط العدد الفردي على جميع الأقطاب والأصفار الحقيقية من اليمين إلى اليسار على طول",
      step3Title: "الخطوة 3: الجذور اللانهائية",
      step3Desc: "احسب الفروع التي تتجه إلى اللانهاية.",
      step4Title: "الخطوة 4: الخطوط التقاربية",
      step4Desc: "احسب النقطة المركزية",
      step4Sub: "الزوايا (بالدرجات)",
      step4None: "لا توجد خطوط تقاربية حيث أن",
      step5Title: "الخطوة 5: نقاط الانفصال والالتقاء",
      step5Desc: "قم بحل",
      step5Sub: "للجذور الحقيقية على المسار.",
      step5None: "لم يتم الكشف عن شيء",
      step6Title: "الخطوة 6: تقاطع المحور التخيلي",
      step6Desc: "موجودة عبر معايير صف الصفر لمصفوفة راوث-هورويتز وجذور كثيرة الحدود المساعدة.",
      step6None: "لم يتم عبور حدود الاستقرار"
    },
    assembler: {
      memoryViews: "عروض الذاكرة",
      traceLogs: "سجلات التتبع",
      executionErrors: "أخطاء التنفيذ",
      compiling: "[جاري التجميع والربط...]",
      executing: "جاري تنفيذ البرنامج...",
      executionStopped: "توقف التنفيذ. تحقق من التشخيص أدناه.",
      outputConsoleReady: "وحدة التحكم في الإخراج جاهزة. انقر فوق 'تشغيل' للتنفيذ.",
      waitingInput: "في انتظار الإدخال — اكتب مفتاحاً...",
      keyboardEntry: "إدخال لوحة المفاتيح (مخزن stdin المؤقت)..."
    }
  },
  es: {
    circuit: {
      electricalCircuitLab: "Laboratorio de Circuitos Eléctricos",
      circuitLabDesc: "El motor modela el comportamiento eléctrico en tiempo continuo utilizando Análisis Nodal Modificado (MNA) y algoritmos SPICE. Construye circuitos, ejecuta la simulación e interactúa con componentes como interruptores o potenciómetros en tiempo real.",
      canvasReady: "Lienzo Listo",
      dragDropHint: "Arrastra y suelta componentes desde la biblioteca para comenzar el diseño.",
      clickPlaceWire: "Haz clic para colocar el cable",
      simulating: "Simulando...",
      spiceAccuracyPass: "PRECISIÓN SPICE APROBADA…",
      spiceVerified: "SPICE VERIFICADO",
      spiceUnavailable: "SPICE NO DISPONIBLE · MOTOR EN VIVO",
      checkWarnings: "COMPRUEBE LAS ADVERTENCIAS DEL CIRCUITO",
      academicWorkspace: "Espacio de Análisis Académico",
      showHideElectrons: "Mostrar / Ocultar flujo de electrones",
      resetSim: "Restablecer simulación",
      simulationSpeed: "Velocidad de simulación",
      passives: "Pasivos",
      semiconductors: "Semiconductores",
      resistor: "Resistencia",
      capacitor: "Condensador",
      inductor: "Inductor"
    },
    control: {
      stepsTitle: "Pasos Analíticos del Lugar de las Raíces",
      step1Title: "Paso 1: Polos y Ceros",
      step1Desc: "Identificar los polos y ceros finitos de lazo abierto.",
      step2Title: "Paso 2: Segmentos del Eje Real",
      step2Desc: "El lugar de las raíces existe en el eje real a la izquierda de un número impar del total de polos y ceros reales.",
      step2Sub: "La condición de número impar se aplica a todos los polos y ceros reales de derecha a izquierda a lo largo de",
      step3Title: "Paso 3: Raíces Infinitas",
      step3Desc: "Cuenta las ramas que van hacia el infinito.",
      step4Title: "Paso 4: Asíntotas",
      step4Desc: "Calcula el centroide",
      step4Sub: "Ángulos (Grados)",
      step4None: "No existen asíntotas ya que",
      step5Title: "Paso 5: Puntos de Ruptura",
      step5Desc: "Resuelve",
      step5Sub: "para raíces reales en el lugar geométrico.",
      step5None: "Ninguno detectado",
      step6Title: "Paso 6: Cruce del Eje Imaginario",
      step6Desc: "Encontrado mediante los criterios de fila cero de la matriz de Routh-Hurwitz y las raíces de polinomios auxiliares.",
      step6None: "Ningún límite de estabilidad cruzado"
    },
    assembler: {
      memoryViews: "Vistas de Memoria",
      traceLogs: "Registros de Seguimiento",
      executionErrors: "Errores de Ejecución",
      compiling: "[Compilando y Enlazando...]",
      executing: "Ejecutando programa...",
      executionStopped: "Ejecución detenida. Comprueba los diagnósticos a continuación.",
      outputConsoleReady: "Consola de salida lista. Haz clic en 'Ejecutar' para ejecutar.",
      waitingInput: "Esperando entrada — escribe una tecla...",
      keyboardEntry: "Entrada de teclado (búfer stdin)..."
    }
  }
};

['en', 'ar', 'es'].forEach(lang => {
  const path = `./client/src/locales/${lang}/simulators.json`;
  const json = JSON.parse(fs.readFileSync(path, 'utf8'));
  
  for (const [key, value] of Object.entries(data[lang])) {
    if (!json[key]) json[key] = {};
    for (const [subKey, subValue] of Object.entries(value)) {
      json[key][subKey] = subValue;
    }
  }
  
  fs.writeFileSync(path, JSON.stringify(json, null, 2));
});
console.log("simulators.json updated");
