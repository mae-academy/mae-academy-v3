/** MAE Academy visual system: locale-driven not-found state. */
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";
import { useLocale } from "@/contexts/LocaleContext";

export default function NotFound() {
  const [, setLocation] = useLocation();
  const { copy } = useLocale();
  return <div className="min-h-[calc(100svh-var(--mae-header-height))] w-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 dark:from-slate-950 dark:to-slate-900"><Card className="w-full max-w-lg border border-slate-200 bg-white/80 shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/80"><CardContent className="pb-8 pt-8 text-center"><div className="mb-6 flex justify-center"><div className="relative"><div className="absolute inset-0 rounded-full bg-rose-100 motion-safe:animate-pulse dark:bg-rose-500/15"/><AlertCircle className="relative h-16 w-16 text-rose-500"/></div></div><h1 className="mb-2 text-4xl font-black text-slate-900 dark:text-white">404</h1><h2 className="mb-4 text-xl font-semibold text-slate-700 dark:text-slate-200">{copy.notFound.title}</h2><p className="mb-8 leading-relaxed text-slate-600 dark:text-slate-400">{copy.notFound.description}</p><Button onClick={() => setLocation("/")} className="rounded-full bg-gradient-to-r from-blue-600 via-violet-500 to-rose-500 px-6 py-2.5 text-white shadow-md shadow-violet-500/20 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[.97]"><Home className="me-2 h-4 w-4"/>{copy.notFound.action}</Button></CardContent></Card></div>;
}
