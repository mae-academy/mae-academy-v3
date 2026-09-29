import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion, type Variants } from "framer-motion";
import { ShieldCheck, Calendar, Mail, ExternalLink, ArrowRight, ArrowLeft } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";

const containerVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" },
  },
};

export default function PrivacyPolicy() {
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
          <ShieldCheck className="h-3.5 w-3.5" />
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
          {isAr ? "سياسة الخصوصية (Privacy Policy)" : "Privacy Policy"}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5 font-mono">
            <Calendar className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            {isAr ? "تاريخ السريان: 28 سبتمبر 2026" : "Effective Date: September 28, 2026"}
          </span>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <span>MAE Academy (https://maeacademy.org)</span>
        </div>

        {/* Cross-Link to Terms of Service */}
        <div className="mt-4">
          <Link
            href="/terms-of-service"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 transition-colors"
          >
            <span>{isAr ? "الانتقال إلى شروط الاستخدام" : "Looking for Terms of Service? View Terms of Service"}</span>
            {isAr ? <ArrowLeft className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
          </Link>
        </div>
      </header>

      {/* ── Main Legal Body ── */}
      <div className="space-y-8 text-sm sm:text-base leading-relaxed">
        {/* Intro */}
        <section className="p-5 sm:p-6 rounded-2xl border border-slate-200/80 bg-slate-50/50 dark:border-white/[0.08] dark:bg-[#08080A]/60">
          <p className="text-slate-700 dark:text-zinc-300">
            {isAr ? (
              <>
                تُعنى منصة MAE Academy (
                <a
                  href="https://maeacademy.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-violet-600 dark:text-violet-400 underline decoration-violet-300 underline-offset-4 hover:text-violet-700"
                >
                  https://maeacademy.org
                </a>
                ) باحترام وحماية خصوصية جميع زوارها ومستخدميها. توضح هذه الوثيقة طبيعة المعلومات التي قد يتم جمعها أثناء تصفحك للموقع وكيفية التعامل معها وحمايتها.
              </>
            ) : (
              <>
                MAE Academy (
                <a
                  href="https://maeacademy.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-violet-600 dark:text-violet-400 underline decoration-violet-300 underline-offset-4 hover:text-violet-700"
                >
                  https://maeacademy.org
                </a>
                ) is dedicated to safeguarding and respecting the privacy of our visitors. This Privacy Policy details the types of information we may collect and how it is used and protected.
              </>
            )}
          </p>
        </section>

        {/* Section 1 */}
        <section className="p-6 sm:p-8 rounded-2xl border border-slate-200/80 bg-white dark:border-white/[0.08] dark:bg-[#08080A]/60 shadow-2xs space-y-3">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <span className="flex items-center justify-center w-6 h-6 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-mono text-xs font-bold shrink-0">
              1
            </span>
            <span>
              {isAr ? "جمع البيانات الشخصية وتسجيل الدخول" : "Information Collection & User Accounts"}
            </span>
          </h2>
          <p className="text-slate-700 dark:text-zinc-300">
            {isAr
              ? "لا تتطلب منصة MAE Academy إنشاء حساب أو تسجيل دخول لاستخدام الأدوات أو الوصول إلى المراجع والأبحاث والكتب المتاحة."
              : "MAE Academy does not require any user registration or account creation to access its tools, simulations, open-source literature, or academic resources."}
          </p>
          <p className="text-slate-700 dark:text-zinc-300">
            {isAr ? (
              <>
                لا نقوم بجمع أو تخزين أي بيانات تعريف شخصية (مثل الأسماء، أرقام الهواتف، أو العناوين) إلا في حال قيامك بمراسلتنا طوعاً عبر البريد الإلكتروني المخصص للتواصل (
                <a
                  href="mailto:maeacademy2026@gmail.com"
                  className="text-violet-600 dark:text-violet-400 font-medium hover:underline"
                >
                  maeacademy2026@gmail.com
                </a>
                )، وفي هذه الحالة تُستخدم بياناتك فقط للرد على استفسارك.
              </>
            ) : (
              <>
                We do not collect or store any personally identifiable information (PII) unless you voluntarily reach out to us via our designated contact email (
                <a
                  href="mailto:maeacademy2026@gmail.com"
                  className="text-violet-600 dark:text-violet-400 font-medium hover:underline"
                >
                  maeacademy2026@gmail.com
                </a>
                ). In such instances, your email address and message are utilized solely to respond to your inquiry.
              </>
            )}
          </p>
        </section>

        {/* Section 2 */}
        <section className="p-6 sm:p-8 rounded-2xl border border-slate-200/80 bg-white dark:border-white/[0.08] dark:bg-[#08080A]/60 shadow-2xs space-y-3">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <span className="flex items-center justify-center w-6 h-6 rounded-md bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 font-mono text-xs font-bold shrink-0">
              2
            </span>
            <span>
              {isAr ? "ملفات السجلات (Log Files)" : "Server Log Files"}
            </span>
          </h2>
          <p className="text-slate-700 dark:text-zinc-300">
            {isAr
              ? "تتبع المنصة الإجراءات القياسية في استخدام ملفات السجلات التلقائية للسيرفرات. تشمل هذه المعلومات غير الشخصية: عناوين بروتوكول الإنترنت (IP)، نوع المتصفح، مزود خدمة الإنترنت (ISP)، طابع التاريخ والوقت، وصفحات الإحالة/الخروج. الهدف من هذه البيانات هو تحليل الاتجاهات العامة، إدارة الموقع، وضمان استقرار وسرعة الخدمة، دون ربطها بأي معلومات تحدد هويتك الشخصية."
              : "Like most standard web servers, MAE Academy utilizes standard log files. The logged data includes Internet Protocol (IP) addresses, browser type, Internet Service Provider (ISP), date/time stamps, and referring/exit pages. This information is non-personally identifiable and is analyzed solely for technical administration, security, and optimizing site performance."}
          </p>
        </section>

        {/* Section 3 */}
        <section className="p-6 sm:p-8 rounded-2xl border border-slate-200/80 bg-white dark:border-white/[0.08] dark:bg-[#08080A]/60 shadow-2xs space-y-4">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <span className="flex items-center justify-center w-6 h-6 rounded-md bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-mono text-xs font-bold shrink-0">
              3
            </span>
            <span>
              {isAr
                ? "ملفات تعريف الارتباط وإعلانات الطرف الثالث (Google AdSense)"
                : "Cookies and Third-Party Advertising (Google AdSense)"}
            </span>
          </h2>
          <p className="text-slate-700 dark:text-zinc-300">
            {isAr
              ? "المنصة بحد ذاتها لا تستخدم ملفات تعريف ارتباط (Cookies) لجمع بيانات المستخدمين."
              : "Our website does not set first-party cookies for tracking user identities."}
          </p>
          <p className="text-slate-700 dark:text-zinc-300">
            {isAr
              ? "ومع ذلك، تستعين منصتنا بشركات إعلانية كطرف ثالث (مثل Google) لعرض الإعلانات عند زيارتك للموقع:"
              : "However, we partner with third-party vendors, including Google, to serve advertisements when you visit our website:"}
          </p>
          <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-zinc-300 ps-2">
            <li>
              {isAr
                ? "يستخدم Google بصفتها مورداً لطرف ثالث ملفات تعريف ارتباط (مثل ملف تعريف الارتباط DART) لعرض الإعلانات للمستخدمين استناداً إلى زياراتهم لموقعنا ومواقع أخرى على شبكة الإنترنت."
                : "Google uses cookies, including the DART cookie, to serve targeted ads to our users based on their visits to our site and other destinations across the web."}
            </li>
            <li>
              {isAr
                ? "يجوز لشركاء الإعلانات استخدام تقنيات مثل ملفات تعريف الارتباط أو إشارات الويب لقياس فاعلية حملاتهم الإعلانية وتخصيص محتوى الإعلانات."
                : "Third-party ad networks may also use cookies, JavaScript, or Web Beacons to gauge the effectiveness of their advertising campaigns and customize ad content."}
            </li>
          </ul>
          <p className="pt-2 text-slate-700 dark:text-zinc-300">
            {isAr ? (
              <>
                يمكن للمستخدمين إلغاء الاشتراك في استخدام ملف تعريف الارتباط DART لتقديم الإعلانات المستندة إلى الاهتمامات عبر زيارة:{" "}
                <a
                  href="https://adssettings.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-violet-600 dark:text-violet-400 hover:underline inline-flex items-center gap-1"
                >
                  <span>إعدادات إعلانات Google</span>
                  <ExternalLink className="h-3 w-3" />
                </a>{" "}
                أو من خلال زيارة موقع مبادرة الإعلانات على شبكة الإنترنت:{" "}
                <a
                  href="https://www.aboutads.info/choices/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-violet-600 dark:text-violet-400 hover:underline inline-flex items-center gap-1"
                >
                  <span>Network Advertising Initiative</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
                .
              </>
            ) : (
              <>
                Users can opt out of personalized advertising by visiting{" "}
                <a
                  href="https://adssettings.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-violet-600 dark:text-violet-400 hover:underline inline-flex items-center gap-1"
                >
                  <span>Google Ads Settings</span>
                  <ExternalLink className="h-3 w-3" />
                </a>{" "}
                or via the{" "}
                <a
                  href="https://www.aboutads.info/choices/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-violet-600 dark:text-violet-400 hover:underline inline-flex items-center gap-1"
                >
                  <span>Network Advertising Initiative Opt-Out Page</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
                .
              </>
            )}
          </p>
        </section>

        {/* Section 4 */}
        <section className="p-6 sm:p-8 rounded-2xl border border-slate-200/80 bg-white dark:border-white/[0.08] dark:bg-[#08080A]/60 shadow-2xs space-y-3">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <span className="flex items-center justify-center w-6 h-6 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-mono text-xs font-bold shrink-0">
              4
            </span>
            <span>
              {isAr
                ? "الملكية الفكرية للمراجع والكتب المفتوحة المصدر"
                : "Open-Source Resources & Intellectual Property"}
            </span>
          </h2>
          <p className="text-slate-700 dark:text-zinc-300">
            {isAr
              ? "توفر المنصة روابط وإشارات لبحوث علمية ومراجع أكاديمية مفتوحة المصدر (Open Access / Open Source). نحرص بشكل تام على إسناد كل عمل لمؤلفيه والناشرين الأصليين وفق رخص النشر المفتوحة المعتمدة."
              : "Our platform references and links to open-access research papers, textbooks, and public domain materials. All referenced works remain the intellectual property of their respective authors and publishers, cited and distributed in compliance with their applicable open licenses."}
          </p>
        </section>

        {/* Section 5 */}
        <section className="p-6 sm:p-8 rounded-2xl border border-slate-200/80 bg-white dark:border-white/[0.08] dark:bg-[#08080A]/60 shadow-2xs space-y-3">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <span className="flex items-center justify-center w-6 h-6 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-mono text-xs font-bold shrink-0">
              5
            </span>
            <span>
              {isAr
                ? "خصوصية الأطفال (COPPA)"
                : "Children's Online Privacy (COPPA Compliance)"}
            </span>
          </h2>
          <p className="text-slate-700 dark:text-zinc-300">
            {isAr
              ? "لا تجمع المنصة بأي شكل من الأشكال أي معلومات شخصية موجهة للأطفال دون سن 13 عاماً. وإذا تبيّن لنا تزويدنا بأي بيانات شخصية لقاصر، فإننا نحذفها فوراً من سجلات المراسلات لدينا."
              : "We do not knowingly collect personal information from children under the age of 13. If you believe that a minor has provided us with personal information, please contact us immediately, and we will promptly remove such records from our systems."}
          </p>
        </section>

        {/* Section 6 */}
        <section className="p-6 sm:p-8 rounded-2xl border border-slate-200/80 bg-white dark:border-white/[0.08] dark:bg-[#08080A]/60 shadow-2xs space-y-3">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <span className="flex items-center justify-center w-6 h-6 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-mono text-xs font-bold shrink-0">
              6
            </span>
            <span>
              {isAr ? "التعديلات والتواصل" : "Updates & Contact"}
            </span>
          </h2>
          <p className="text-slate-700 dark:text-zinc-300">
            {isAr
              ? "نحتفظ بالحق في تحديث سياسة الخصوصية هذه لمواكبة التحديثات التقنية والقانونية. يُنصح بمراجعة هذه الصفحة بشكل دوري."
              : "We reserve the right to revise this policy to reflect operational, legal, or regulatory modifications."}
          </p>
          <div className="pt-2 flex items-center gap-2 text-slate-700 dark:text-zinc-300">
            <Mail className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0" />
            <span>
              {isAr
                ? "للاستفسارات القانونية وملاحظات الخصوصية، يرجى التواصل معنا عبر:"
                : "If you have any inquiries regarding this Privacy Policy, please contact us at:"}{" "}
              <a
                href="mailto:maeacademy2026@gmail.com"
                className="font-semibold text-violet-600 dark:text-violet-400 hover:underline"
              >
                maeacademy2026@gmail.com
              </a>
            </span>
          </div>
        </section>
      </div>
    </motion.article>
  );
}
