import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion, type Variants } from "framer-motion";
import { FileText, Calendar, Mail, ArrowRight, ArrowLeft } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";

const containerVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" },
  },
};

export default function TermsOfService() {
  const { locale: platformLocale } = useLocale();
  const [lang, setLang] = useState<"en" | "ar">(() =>
    platformLocale === "ar" ? "ar" : "en"
  );

  useEffect(() => {
    setLang(platformLocale === "ar" ? "ar" : "en");
  }, [platformLocale]);

  const isAr = lang === "ar";

  return (
    <motion.article
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      dir={isAr ? "rtl" : "ltr"}
      lang={lang}
      className={`max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16 text-slate-800 dark:text-zinc-200 ${
        isAr ? "font-arabic" : "font-sans"
      }`}
    >
      {/* ── Top Bar: Eyebrow + Language Switcher ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80 dark:border-white/[0.08]">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300 border border-violet-200/60 dark:border-violet-800/40">
          <FileText className="h-3.5 w-3.5" />
          <span>{isAr ? "الوثائق القانونية والامتثال" : "Legal & Compliance"}</span>
        </div>

        {/* In-page bilingual toggle */}
        <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-xs font-medium self-end sm:self-auto">
          <button
            type="button"
            onClick={() => setLang("en")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              lang === "en"
                ? "bg-white text-slate-900 shadow-xs font-semibold dark:bg-[#0D0D11] dark:text-white"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => setLang("ar")}
            className={`px-3 py-1.5 rounded-lg transition-all font-arabic ${
              lang === "ar"
                ? "bg-white text-slate-900 shadow-xs font-semibold dark:bg-[#0D0D11] dark:text-white"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            العربية
          </button>
        </div>
      </div>

      {/* ── Header Title & Meta ── */}
      <header className="mt-8 mb-10">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
          {isAr ? "شروط الاستخدام (Terms of Service)" : "Terms of Service"}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5 font-mono">
            <Calendar className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            {isAr ? "تاريخ السريان: 28 سبتمبر 2026" : "Effective Date: September 28, 2026"}
          </span>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <span>MAE Academy (https://maeacademy.org)</span>
        </div>

        {/* Cross-Link to Privacy Policy */}
        <div className="mt-4">
          <Link
            href="/privacy-policy"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 transition-colors"
          >
            <span>{isAr ? "الانتقال إلى سياسة الخصوصية" : "Looking for Privacy Policy? View Privacy Policy"}</span>
            {isAr ? <ArrowLeft className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
          </Link>
        </div>
      </header>

      {/* ── Main Legal Body ── */}
      <div className="space-y-8 text-sm sm:text-base leading-relaxed">
        {lang === "en" ? (
          /* =========================================================
             ENGLISH TERMS OF SERVICE CONTENT
             ========================================================= */
          <>
            <section className="p-6 rounded-2xl bg-slate-50/80 dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/[0.06]">
              <p className="text-slate-700 dark:text-zinc-300">
                Welcome to MAE Academy (
                <a
                  href="https://maeacademy.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-violet-600 dark:text-violet-400 underline underline-offset-2 hover:text-violet-700"
                >
                  https://maeacademy.org
                </a>
                ). By accessing or using our website, interactive tools, and educational resources, you acknowledge that you have read, understood, and agreed to be bound by these Terms of Service.
              </p>
            </section>

            {/* Section 1 */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-sm font-semibold">
                  1
                </span>
                <span>Description of Service</span>
              </h2>
              <p className="text-slate-600 dark:text-zinc-300">
                MAE Academy is an open educational platform offering interactive engineering simulators, technical explanations, and curated references to open-access academic literature and publications, provided without mandatory registration or subscription fees.
              </p>
            </section>

            {/* Section 2 */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-sm font-semibold">
                  2
                </span>
                <span>Intellectual Property Rights & Permitted Use</span>
              </h2>
              <div className="space-y-3 text-slate-600 dark:text-zinc-300">
                <p>
                  <strong className="font-semibold text-slate-900 dark:text-white">Proprietary Content:</strong> All original platform code, interactive simulations, custom diagrams, visual assets, and written tutorials are the property of MAE Academy. You may not copy, reverse-engineer, scrape, redistribute, or exploit this proprietary content for commercial gain without explicit prior written authorization.
                </p>
                <p>
                  <strong className="font-semibold text-slate-900 dark:text-white">Open-Source Literature:</strong> Open-access papers and third-party references are provided strictly for academic and educational purposes under their respective open-access licenses (e.g., Creative Commons).
                </p>
              </div>
            </section>

            {/* Section 3 */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-sm font-semibold">
                  3
                </span>
                <span>Engineering & Educational Disclaimer</span>
              </h2>
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-slate-700 dark:text-amber-200/90 text-sm space-y-2">
                <p>
                  All simulators, computational tools, and technical explanations are provided strictly on an &ldquo;as-is&rdquo; and &ldquo;as-available&rdquo; basis for educational and self-study purposes only.
                </p>
                <p>
                  While we strive for mathematical and theoretical accuracy, MAE Academy disclaims all liability for any computational inaccuracies, unintended errors, or practical decisions made based directly on these tools without independent professional verification and standard industrial compliance checks.
                </p>
              </div>
            </section>

            {/* Section 4 */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-sm font-semibold">
                  4
                </span>
                <span>External Links and Advertisements</span>
              </h2>
              <p className="text-slate-600 dark:text-zinc-300">
                Our site may contain links to external third-party websites or advertisements provided by advertising networks (such as Google). We do not control, endorse, or assume responsibility for the content, privacy practices, or accuracy of third-party domains.
              </p>
            </section>

            {/* Section 5 */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-sm font-semibold">
                  5
                </span>
                <span>Governing Law and Jurisdiction</span>
              </h2>
              <p className="text-slate-600 dark:text-zinc-300">
                These Terms and any disputes arising out of or related to your use of this platform shall be governed by and construed in accordance with the laws of the Hashemite Kingdom of Jordan, and the competent courts of Jordan shall have exclusive jurisdiction.
              </p>
            </section>

            {/* Section 6 */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-sm font-semibold">
                  6
                </span>
                <span>Contact Information</span>
              </h2>
              <p className="text-slate-600 dark:text-zinc-300">
                For any legal inquiries, copyright concerns, or questions regarding these terms, please contact:{" "}
                <a
                  href="mailto:maeacademy2026@gmail.com"
                  className="font-medium text-violet-600 dark:text-violet-400 underline underline-offset-2 hover:text-violet-700 inline-flex items-center gap-1"
                >
                  <Mail className="h-3.5 w-3.5 inline" />
                  maeacademy2026@gmail.com
                </a>
              </p>
            </section>
          </>
        ) : (
          /* =========================================================
             ARABIC TERMS OF SERVICE CONTENT
             ========================================================= */
          <>
            <section className="p-6 rounded-2xl bg-slate-50/80 dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/[0.06]">
              <p className="text-slate-700 dark:text-zinc-300">
                أهلاً بكم في منصة MAE Academy (
                <a
                  href="https://maeacademy.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-violet-600 dark:text-violet-400 underline underline-offset-2 hover:text-violet-700"
                >
                  https://maeacademy.org
                </a>
                ). استخدامك لهذا الموقع ولأدواته ومحتواه الأكاديمي يعني موافقتك الكاملة وغير المشروطة على الالتزام بجميع البنود والشروط الموضحة أدناه.
              </p>
            </section>

            {/* Section 1 */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-sm font-semibold">
                  1
                </span>
                <span>طبيعة الخدمات والمحتوى</span>
              </h2>
              <p className="text-slate-600 dark:text-zinc-300">
                منصة MAE Academy منصة تعليمية وأكاديمية متخصصة، تقدم أدوات محاكاة هندسية تفاعلية، شروحات تعليمية، وروابط لمصادر وبحوث علمية وكتب مفتوحة المصدر دون الحاجة لأي تسجيل حساب أو رسوم اشتراك.
              </p>
            </section>

            {/* Section 2 */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-sm font-semibold">
                  2
                </span>
                <span>حقوق الملكية الفكرية والاستخدام المسموح</span>
              </h2>
              <div className="space-y-3 text-slate-600 dark:text-zinc-300">
                <p>
                  <strong className="font-semibold text-slate-900 dark:text-white">محتوى المنصة الأصلي:</strong> كافة البرمجيات الخاصة، أدوات المحاكاة، الرسوم التوضيحية، والنصوص المؤلفة حصرياً للمنصة هي ملك لمنصة MAE Academy، ويُحظر نسخها، أو إعادة هندستها عكسياً، أو استخراج بياناتها آلياً (Scraping)، أو إعادة بيعها لأغراض تجارية دون إذن خطي مسبق.
                </p>
                <p>
                  <strong className="font-semibold text-slate-900 dark:text-white">المصادر المفتوحة والبحوث:</strong> يُتاح استعراض المراجع والأبحاث والكتب المفتوحة المصدر للأغراض التعليمية والبحثية الشخصية بما يتوافق مع رخص النشر الأصلية الخاصة بكل مرجع (مثل رخص Creative Commons).
                </p>
              </div>
            </section>

            {/* Section 3 */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-sm font-semibold">
                  3
                </span>
                <span>إخلاء المسؤولية الأكاديمية والهندسية (Disclaimer)</span>
              </h2>
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-slate-700 dark:text-amber-200/90 text-sm space-y-2">
                <p>
                  تُقدَّم كافة الشروحات، المعادلات، والنتائج الصادرة عن المحاكيات والأدوات البرمجية &ldquo;كما هي&rdquo; لأغراض التعليم والتدريب الأكاديمي فقط.
                </p>
                <p>
                  بالرغم من حرصنا على دقة النماذج الرياضية والفيزيائية، لا تتحمل المنصة أي مسؤولية قانونية أو مادية عن أي نتائج، أخطاء غير مقصودة، أو قرارات تطبيقية/هندسية عملية يتخذها المستخدم بالاعتماد المباشر على هذه الأدوات دون مراجعة المعايير والمراجع القياسية المعتمدة.
                </p>
              </div>
            </section>

            {/* Section 4 */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-sm font-semibold">
                  4
                </span>
                <span>الروابط الخارجية والمحتوى الإعلاني</span>
              </h2>
              <p className="text-slate-600 dark:text-zinc-300">
                قد يحتوي الموقع على روابط تؤدي إلى مواقع خارجية أو إعلانات مدعومة من أطراف ثالثة (مثل Google). نحن لا نتحكم في محتوى أو ممارسات أو سياسات تلك المواقع المستقلة، ولا نتحمل أي مسؤولية قانونية ناتجة عن زيارتها أو التعامل معها.
              </p>
            </section>

            {/* Section 5 */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-sm font-semibold">
                  5
                </span>
                <span>القانون الحاكم وفض النزاعات (Governing Law)</span>
              </h2>
              <p className="text-slate-600 dark:text-zinc-300">
                تخضع هذه الشروط والأحكام وتُفسر وفقاً للقوانين والأنظمة المعمول بها في المملكة الأردنية الهاشمية، وتختص المحاكم المعنية فيها بالفصل في أي نزاع قد ينشأ بخصوص استخدام هذا الموقع.
              </p>
            </section>

            {/* Section 6 */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-sm font-semibold">
                  6
                </span>
                <span>التواصل معنا</span>
              </h2>
              <p className="text-slate-600 dark:text-zinc-300">
                لأي استفسارات تتعلق بشروط الاستخدام، يسعدنا تواصلكم عبر البريد الإلكتروني:{" "}
                <a
                  href="mailto:maeacademy2026@gmail.com"
                  className="font-medium text-violet-600 dark:text-violet-400 underline underline-offset-2 hover:text-violet-700 inline-flex items-center gap-1"
                >
                  <Mail className="h-3.5 w-3.5 inline" />
                  maeacademy2026@gmail.com
                </a>
              </p>
            </section>
          </>
        )}
      </div>

      {/* ── Footer Contact Card ── */}
      <footer className="mt-14 pt-8 border-t border-slate-200/80 dark:border-white/[0.08] text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span>MAE Academy © 2026. </span>
          <span>{isAr ? "جميع الحقوق محفوظة." : "All rights reserved."}</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/privacy-policy"
            className="hover:text-slate-900 dark:hover:text-white transition-colors underline underline-offset-2"
          >
            {isAr ? "سياسة الخصوصية" : "Privacy Policy"}
          </Link>
          <span>·</span>
          <a
            href="mailto:maeacademy2026@gmail.com"
            className="hover:text-slate-900 dark:hover:text-white transition-colors inline-flex items-center gap-1"
          >
            <Mail className="h-3 w-3" />
            maeacademy2026@gmail.com
          </a>
        </div>
      </footer>
    </motion.article>
  );
}
