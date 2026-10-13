import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { CheckCircle2, Clock, Loader2, Mail, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocale } from "@/contexts/LocaleContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import SocialLinks from "@/components/SocialLinks";

const SUPPORT_EMAIL = "maeacademy2026@gmail.com";
const TOPICS = ["general", "support", "feedback", "partnership", "legal"] as const;
const WEB3FORMS_URL = "https://api.web3forms.com/submit";
const ACCESS_KEY = import.meta.env.VITE_WEB3FORMS_ACCESS_KEY || "c4f70c88-da58-4e49-8970-214d260daee6";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Errors = Partial<Record<"name" | "email" | "message", string>>;

const fieldClass =
  "mt-1.5 block w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100";

export default function Contact() {
  const { t } = useTranslation("common");
  const { locale, isRtl } = useLocale();
  usePageTitle(t("contact.title"));
  const [form, setForm] = useState({ name: "", email: "", topic: "general", message: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    const next: Errors = {};
    if (!form.name.trim()) next.name = t("contact.errName");
    if (!EMAIL_RE.test(form.email.trim())) next.email = t("contact.errEmail");
    if (form.message.trim().length < 10) next.message = t("contact.errMessage");
    setErrors(next);
    if (Object.keys(next).length) return;

    setSending(true);
    setSent(false);
    try {
      const res = await fetch(WEB3FORMS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: ACCESS_KEY,
          name: form.name.trim(),
          email: form.email.trim(),
          subject: `[${t(`contact.topics.${form.topic}`)}] from ${form.name.trim()}`,
          from_name: "MAE Academy Platform Contact Form",
          message: form.message.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success !== true) throw new Error(data.message || `HTTP ${res.status}`);
      toast.success(t("contact.success"));
      setSent(true);
      setForm({ name: "", email: "", topic: "general", message: "" });
    } catch (error) {
      console.error("Contact form submission failed:", error);
      toast.error(t("contact.errSend"));
    } finally {
      setSending(false);
    }
  };

  const err = (msg?: string, id?: string) =>
    msg ? <p id={id} role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">{msg}</p> : null;

  return (
    <section dir={isRtl ? "rtl" : "ltr"} lang={locale} className="mx-auto w-full max-w-[1380px] px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <header className="mb-10 max-w-3xl">
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{t("contact.title")}</h1>
        <p className="mt-3 text-slate-600 dark:text-slate-400">{t("contact.subtitle")}</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:gap-10">
        <form onSubmit={onSubmit} noValidate className="min-w-0 space-y-5 rounded-2xl border border-slate-200 bg-white/70 p-5 sm:p-7 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor="c-name" className="text-sm font-semibold">{t("contact.name")}</label>
              <input id="c-name" autoComplete="name" value={form.name} onChange={set("name")} aria-invalid={!!errors.name} aria-describedby={errors.name ? "c-name-err" : undefined} className={fieldClass} />
              {err(errors.name, "c-name-err")}
            </div>
            <div className="min-w-0">
              <label htmlFor="c-email" className="text-sm font-semibold">{t("contact.email")}</label>
              <input id="c-email" type="email" autoComplete="email" value={form.email} onChange={set("email")} aria-invalid={!!errors.email} aria-describedby={errors.email ? "c-email-err" : undefined} className={fieldClass} />
              {err(errors.email, "c-email-err")}
            </div>
          </div>
          <div>
            <label htmlFor="c-topic" className="text-sm font-semibold">{t("contact.topic")}</label>
            <select id="c-topic" value={form.topic} onChange={set("topic")} className={fieldClass}>
              {TOPICS.map((k) => <option key={k} value={k}>{t(`contact.topics.${k}`)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="c-message" className="text-sm font-semibold">{t("contact.message")}</label>
            <textarea id="c-message" rows={6} value={form.message} onChange={set("message")} aria-invalid={!!errors.message} aria-describedby={errors.message ? "c-message-err" : undefined} className={`${fieldClass} resize-y`} />
            {err(errors.message, "c-message-err")}
          </div>
          <button type="submit" disabled={sending} aria-busy={sending} className="btn-brand-primary min-h-[44px] w-full justify-center gap-2 px-6 py-3 text-xs font-semibold disabled:cursor-wait disabled:opacity-70 sm:w-auto sm:px-8 sm:text-sm">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 rtl:-scale-x-100" />}
            {sending ? t("contact.sending") : t("contact.send")}
          </button>
          {sent && (
            <div role="status" className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 text-sm font-medium text-indigo-800 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 dark:border-indigo-800/50 dark:bg-indigo-950/30 dark:text-indigo-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
              {t("contact.success")}
            </div>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t("contact.privacyNote")}{" "}
            <Link href="/privacy" className="underline underline-offset-4 hover:text-violet-600">{t("footer.privacyPolicy")}</Link>
          </p>
        </form>

        <aside className="min-w-0 space-y-6 self-start rounded-2xl border border-slate-200 bg-white/70 p-5 sm:p-7 dark:border-white/10 dark:bg-white/[0.03]">
          <h2 className="text-lg font-bold">{t("contact.infoTitle")}</h2>
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-5 w-5 shrink-0 text-violet-600 dark:text-violet-400" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t("contact.supportEmail")}</p>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="break-all text-sm font-medium hover:text-violet-600">{SUPPORT_EMAIL}</a>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-violet-600 dark:text-violet-400" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t("contact.hours")}</p>
              <p className="text-sm">{t("contact.hoursValue")}</p>
            </div>
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{t("contact.social")}</p>
            <SocialLinks className="gap-4" />
          </div>
        </aside>
      </div>
    </section>
  );
}
