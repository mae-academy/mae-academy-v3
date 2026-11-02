/** Written overview of the simulator suites, shown below the interactive catalog on /simulations. */
import { Link } from "wouter";
import { useLocale } from "@/contexts/LocaleContext";

type Suite = { href: string; name: string; text: string };
type GuideCopy = { title: string; intro: string[]; suitesTitle: string; suites: Suite[]; howTitle: string; how: string[] };

export const GUIDE: Record<"en" | "ar" | "es", GuideCopy> = {
  en: {
    title: "How the MAE Academy simulators work",
    intro: [
      "MAE Academy is a free set of browser-based engineering labs. Each simulator runs a real numerical model behind the interface, so changing a parameter changes the computed response instead of replaying a canned animation. Nothing needs to be installed and there is no sign-up.",
      "The labs are built for students and self-taught engineers who want to check a hand calculation, see why a circuit or controller behaves the way it does, or practise a technique before an exam or a project.",
    ],
    suitesTitle: "What you can explore",
    suites: [
      { href: "/simulations/plc", name: "PLC and Siemens LOGO!", text: "Write ladder logic or function block diagrams, force inputs and watch scan-by-scan outputs, timers and counters. Useful for learning interlocks, start/stop circuits and sequencing." },
      { href: "/simulations/arduino-studio", name: "Arduino UNO", text: "Run sketches against a virtual board with pins, a serial monitor and a plotter, so you can debug timing and I/O logic without hardware." },
      { href: "/simulations/code/python", name: "Python, C, C++ and 8086 assembly", text: "Step through programs line by line and see variables, memory, registers and the stack change, which makes pointers, recursion and flags much easier to understand." },
      { href: "/simulations/digital-logic-design?tool=schematic", name: "Digital logic design", text: "Build gate-level circuits, minimise expressions with Karnaugh maps, analyse timing diagrams and design finite state machines." },
      { href: "/simulations/signals-and-systems/fourier-analysis", name: "Signals and systems", text: "Explore convolution, Fourier series and transforms, Laplace and Z-transforms, and classify systems as linear, causal, stable or time-invariant." },
      { href: "/simulations/control-systems/root-locus", name: "Control systems", text: "Plot root locus, Bode and Nyquist diagrams, tune PID controllers against a step response and study state-space models." },
      { href: "/simulations/power-electronics/rectifier", name: "Power electronics", text: "Study controlled rectifiers, AC voltage controllers, DC-DC converters and PWM inverters with waveforms for voltage, current and harmonic content." },
      { href: "/simulations/circuit-lab", name: "Electrical circuits", text: "Draw a schematic and run DC, AC and transient analysis to read node voltages and branch currents." },
    ],
    howTitle: "Getting the most out of a lab",
    how: [
      "Start from a known case, such as a textbook circuit or a transfer function from your course, and compare the result with your hand solution before changing anything.",
      "Change one parameter at a time and note what moves. Most simulators show the governing equations or documentation below the workspace so you can connect the plot to the theory.",
      "Treat results as a learning aid. For safety-critical or production designs, confirm with the relevant standards and your own verification.",
    ],
  },
  ar: {
    title: "كيف تعمل محاكيات أكاديمية MAE",
    intro: [
      "أكاديمية MAE مجموعة مجانية من المختبرات الهندسية التي تعمل داخل المتصفح. خلف كل محاكي نموذج عددي حقيقي، لذلك يغيّر تعديل أي معامل الاستجابة المحسوبة بدلاً من تشغيل رسوم متحركة جاهزة. لا حاجة لتثبيت أي برنامج ولا لإنشاء حساب.",
      "صُمّمت المختبرات للطلاب والمهندسين المتعلمين ذاتياً الذين يريدون التحقق من حل يدوي، أو فهم سبب سلوك دائرة أو متحكّم بطريقة معينة، أو التدرّب على تقنية قبل امتحان أو مشروع.",
    ],
    suitesTitle: "ماذا يمكنك أن تستكشف",
    suites: [
      { href: "/simulations/plc", name: "PLC وSiemens LOGO!", text: "اكتب منطق السلّم أو مخططات الكتل الوظيفية، وافرض المدخلات وراقب المخرجات والمؤقتات والعدّادات في كل دورة مسح. مفيد لتعلّم التشابكات ودوائر التشغيل والإيقاف والتسلسل." },
      { href: "/simulations/arduino-studio", name: "Arduino UNO", text: "شغّل البرامج على لوحة افتراضية مع الأطراف ومراقب تسلسلي ومخطط بياني، لتصحيح التوقيت ومنطق الدخل والخرج دون عتاد." },
      { href: "/simulations/code/python", name: "Python وC وC++ ولغة التجميع 8086", text: "تتبّع البرامج سطراً بسطر وشاهد تغيّر المتغيرات والذاكرة والسجلات والمكدس، ما يسهّل فهم المؤشرات والاستدعاء الذاتي والأعلام." },
      { href: "/simulations/digital-logic-design?tool=schematic", name: "التصميم المنطقي الرقمي", text: "ابنِ دوائر على مستوى البوابات، وبسّط التعابير بخرائط كارنوف، وحلّل مخططات التوقيت، وصمّم آلات الحالة المنتهية." },
      { href: "/simulations/signals-and-systems/fourier-analysis", name: "الإشارات والأنظمة", text: "استكشف الالتفاف ومتسلسلات وتحويلات فورييه وتحويلي لابلاس وZ، وصنّف الأنظمة إلى خطية وسببية ومستقرة وثابتة زمنياً." },
      { href: "/simulations/control-systems/root-locus", name: "أنظمة التحكم", text: "ارسم مخطط موضع الجذور ومخططي بود ونيكويست، واضبط متحكمات PID على استجابة الخطوة، ودرس نماذج فضاء الحالة." },
      { href: "/simulations/power-electronics/rectifier", name: "إلكترونيات القدرة", text: "ادرس المقوّمات المتحكَّم بها ومتحكمات الجهد المتناوب ومحوّلات التيار المستمر وعاكسات PWM مع أشكال موجات الجهد والتيار والتوافقيات." },
      { href: "/simulations/circuit-lab", name: "الدوائر الكهربائية", text: "ارسم مخططاً وشغّل تحليل التيار المستمر والمتناوب والعابر لقراءة جهود العقد وتيارات الفروع." },
    ],
    howTitle: "كيف تستفيد من المختبر",
    how: [
      "ابدأ بحالة معروفة، مثل دائرة من كتاب مقرر أو دالة تحويل من مادتك، وقارن النتيجة بحلّك اليدوي قبل أن تغيّر أي شيء.",
      "غيّر معاملاً واحداً في كل مرة ولاحظ ما الذي يتحرك. تعرض معظم المحاكيات المعادلات الحاكمة أو الشرح أسفل مساحة العمل لتربط المنحنى بالنظرية.",
      "اعتبر النتائج وسيلة تعلّم. أما في التصاميم الحرجة أو الإنتاجية فتأكد وفق المعايير المعتمدة وتحققك الخاص.",
    ],
  },
  es: {
    title: "Cómo funcionan los simuladores de MAE Academy",
    intro: [
      "MAE Academy es un conjunto gratuito de laboratorios de ingeniería que funcionan en el navegador. Detrás de cada simulador hay un modelo numérico real, así que cambiar un parámetro cambia la respuesta calculada en lugar de reproducir una animación predefinida. No hay que instalar nada ni registrarse.",
      "Los laboratorios están pensados para estudiantes e ingenieros autodidactas que quieren comprobar un cálculo a mano, entender por qué un circuito o un controlador se comporta de cierta manera, o practicar una técnica antes de un examen o un proyecto.",
    ],
    suitesTitle: "Qué puedes explorar",
    suites: [
      { href: "/simulations/plc", name: "PLC y Siemens LOGO!", text: "Escribe lógica de escalera o diagramas de bloques de función, fuerza entradas y observa salidas, temporizadores y contadores ciclo a ciclo. Útil para aprender enclavamientos, arranque/paro y secuencias." },
      { href: "/simulations/arduino-studio", name: "Arduino UNO", text: "Ejecuta programas en una placa virtual con pines, monitor serie y graficador para depurar tiempos y lógica de E/S sin hardware." },
      { href: "/simulations/code/python", name: "Python, C, C++ y ensamblador 8086", text: "Recorre los programas línea a línea y mira cómo cambian variables, memoria, registros y pila, lo que facilita entender punteros, recursión y banderas." },
      { href: "/simulations/digital-logic-design?tool=schematic", name: "Diseño lógico digital", text: "Construye circuitos a nivel de compuertas, simplifica expresiones con mapas de Karnaugh, analiza diagramas de tiempo y diseña máquinas de estados finitos." },
      { href: "/simulations/signals-and-systems/fourier-analysis", name: "Señales y sistemas", text: "Explora convolución, series y transformadas de Fourier, Laplace y Z, y clasifica sistemas como lineales, causales, estables o invariantes en el tiempo." },
      { href: "/simulations/control-systems/root-locus", name: "Sistemas de control", text: "Traza el lugar de las raíces, diagramas de Bode y Nyquist, ajusta controladores PID con la respuesta al escalón y estudia modelos de espacio de estados." },
      { href: "/simulations/power-electronics/rectifier", name: "Electrónica de potencia", text: "Estudia rectificadores controlados, controladores de tensión alterna, convertidores CC-CC e inversores PWM con formas de onda de tensión, corriente y contenido armónico." },
      { href: "/simulations/circuit-lab", name: "Circuitos eléctricos", text: "Dibuja un esquema y ejecuta análisis de CC, CA y transitorio para leer tensiones de nodo y corrientes de rama." },
    ],
    howTitle: "Cómo sacar el máximo partido a un laboratorio",
    how: [
      "Empieza con un caso conocido, como un circuito de libro o una función de transferencia de tu curso, y compara el resultado con tu solución a mano antes de cambiar nada.",
      "Cambia un parámetro cada vez y observa qué se mueve. La mayoría de los simuladores muestran las ecuaciones o la documentación bajo el área de trabajo para conectar la gráfica con la teoría.",
      "Usa los resultados como ayuda de aprendizaje. Para diseños críticos o de producción, confirma con las normas aplicables y tu propia verificación.",
    ],
  },
};

export default function SimulationsGuide() {
  const { locale } = useLocale();
  const c = GUIDE[locale as keyof typeof GUIDE] ?? GUIDE.en;
  return (
    <section aria-labelledby="sim-guide-title" className="mx-auto w-full max-w-5xl px-4 pb-16 pt-4 text-slate-700 dark:text-zinc-300 sm:px-6">
      <h2 id="sim-guide-title" className="mb-4 text-2xl font-bold text-slate-900 dark:text-white">{c.title}</h2>
      {c.intro.map((p) => (
        <p key={p} className="mb-3 leading-relaxed">{p}</p>
      ))}
      <h3 className="mb-3 mt-8 text-xl font-semibold text-slate-900 dark:text-white">{c.suitesTitle}</h3>
      <ul className="grid gap-4 sm:grid-cols-2">
        {c.suites.map((s) => (
          <li key={s.href} className="rounded-xl border border-slate-200 bg-white/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
            <Link href={s.href} className="font-semibold text-violet-700 hover:underline dark:text-violet-400">{s.name}</Link>
            <p className="mt-1 text-sm leading-relaxed">{s.text}</p>
          </li>
        ))}
      </ul>
      <h3 className="mb-3 mt-8 text-xl font-semibold text-slate-900 dark:text-white">{c.howTitle}</h3>
      <ul className="list-disc space-y-2 ps-5 leading-relaxed">
        {c.how.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </section>
  );
}
