/**
 * MAE Academy Practical Simulations Catalog.
 * Rich filter toolbar (Category Pills, Search, Sorting Engine), responsive cards, and animated transitions.
 */
import { useMemo, useState } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { ArrowUpRight, Search, SlidersHorizontal, X } from "lucide-react";
import { Link } from "wouter";
import SimulationSchematic from "./SimulationSchematic";
import { useLocale } from "@/contexts/LocaleContext";
import {
  simulationsCatalog,
  SimulationItemMeta,
  SimulationCategory,
  SimulationItem,
} from "@/data/platform";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface PracticalSimulationsProps {
  eyebrow: string;
  title: string;
  description: string;
  cards: Array<{
    title: string;
    description: string;
    code: string;
    badge?: string;
  }>;
}

type SortOption = "featured" | "asc" | "desc" | "newest";

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 180, damping: 22 },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: { duration: 0.2 },
  },
};

export default function PracticalSimulations({
  eyebrow,
  title,
  description,
  cards,
}: PracticalSimulationsProps) {
  const { copy, isRtl, locale } = useLocale();

  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("featured");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Category labels with localized fallbacks
  const categoryTabs: Array<{
    id: string;
    label: string;
    category?: SimulationCategory;
  }> = useMemo(() => {
    if (locale === "ar") {
      return [
        { id: "all", label: "الكل" },
        { id: "systems-control", label: "التحكم والأنظمة" },
        { id: "circuits-power", label: "الدوائر والقدرة" },
        { id: "embedded-software", label: "الأنظمة المدمجة والبرمجة" },
      ];
    }
    if (locale === "es") {
      return [
        { id: "all", label: "Todos" },
        { id: "systems-control", label: "Sistemas y Control" },
        { id: "circuits-power", label: "Circuitos y Potencia" },
        { id: "embedded-software", label: "Embebidos y Código" },
      ];
    }
    return [
      { id: "all", label: "All" },
      { id: "systems-control", label: "Systems & Control" },
      { id: "circuits-power", label: "Circuits & Power" },
      { id: "embedded-software", label: "Embedded & Code" },
    ];
  }, [locale]);

  // Combine localized card copy with simulations catalog metadata
  const enrichedSimulations = useMemo<SimulationItem[]>(() => {
    return simulationsCatalog.map((meta, idx) => {
      const card = cards[idx] || {
        title: meta.id,
        description: "",
        code: `S.${String(idx + 1).padStart(2, "0")}`,
        badge: undefined,
      };

      const href = meta.href || `/simulations/${meta.slug}`;

      return {
        id: meta.id,
        title: card.title,
        description: card.description,
        category: meta.category,
        isFeatured: meta.isFeatured,
        createdAt: meta.createdAt,
        badge: meta.badge,
        href,
        slug: meta.slug,
        index: meta.index,
        visualVariant: meta.visualVariant,
      };
    });
  }, [cards]);

  // Filter & sort logic as specified in user blueprint
  const filteredSimulations = useMemo(() => {
    return enrichedSimulations
      .filter((sim) => {
        const matchesCategory =
          selectedCategory === "all" || sim.category === selectedCategory;
        const q = searchQuery.trim().toLowerCase();
        const matchesSearch =
          !q ||
          sim.title.toLowerCase().includes(q) ||
          sim.description.toLowerCase().includes(q);
        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => {
        if (sortBy === "featured") {
          const aFeatured = a.isFeatured || a.badge === "HOT" ? 1 : 0;
          const bFeatured = b.isFeatured || b.badge === "HOT" ? 1 : 0;
          if (bFeatured !== aFeatured) return bFeatured - aFeatured;
          return a.index - b.index;
        }
        if (sortBy === "asc") return a.title.localeCompare(b.title);
        if (sortBy === "desc") return b.title.localeCompare(a.title);
        if (sortBy === "newest") {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        return 0;
      });
  }, [enrichedSimulations, selectedCategory, sortBy, searchQuery]);

  return (
    <motion.section
      className="container py-12 sm:py-16 lg:py-20"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header Eyebrow & Title */}
      <motion.div
        variants={itemVariants}
        className="mb-10 grid gap-6 lg:grid-cols-[1.2fr_.8fr] lg:items-end"
      >
        <div>
          <div className="mb-4 flex items-center gap-3">
            <p className="text-[10px] font-bold tracking-[0.18em] text-violet-700 dark:text-violet-300">
              {eyebrow}
            </p>
            <span className="h-px w-16 bg-brand-gradient" />
          </div>
          <h1 className="max-w-3xl text-4xl font-black tracking-[-0.055em] text-slate-950 sm:text-5xl lg:text-6xl dark:text-white">
            {title}
          </h1>
        </div>
        <p className="max-w-xl border-l-2 border-gradient-signal pl-5 text-base leading-7 text-slate-600 dark:text-zinc-400 rtl:border-l-0 rtl:border-r-2 rtl:pl-0 rtl:pr-5">
          {description}
        </p>
      </motion.div>

      {/* Toolbar: Category Tabs (Left) + Search & Sorting (Right) */}
      <motion.div
        variants={itemVariants}
        className="mb-10 flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white/60 p-3.5 backdrop-blur-md shadow-[0_4px_20px_-10px_rgba(15,23,42,0.08)] sm:p-4 lg:flex-row lg:items-center lg:justify-between dark:border-white/[0.08] dark:bg-[#0c0d12]/70 dark:shadow-[0_4px_20px_-10px_rgba(0,0,0,0.5)]"
      >
        {/* Category Tabs: Exact Segmented Tab Bar matching reference */}
        <div className="overflow-x-auto no-scrollbar py-1">
          <div className="inline-flex items-center gap-1 rounded-full border border-slate-200/60 bg-[#f1f5f9]/80 p-1.5 shadow-inner backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
            {categoryTabs.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  type="button"
                  className={`whitespace-nowrap rounded-full px-5 py-1.5 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-gradient-to-br from-blue-600 via-purple-600 to-rose-500 text-white shadow-md"
                      : "bg-transparent text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Controls Group: Search Bar + Sort Dropdown */}
        <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
          {/* Search Input (No icon/text overlap) */}
          <div className="relative flex-1 min-w-[220px] sm:w-64">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-zinc-500 rtl:left-auto rtl:right-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                locale === "ar"
                  ? "بحث في المحاكاة..."
                  : locale === "es"
                  ? "Buscar simulaciones..."
                  : "Search simulations..."
              }
              className="h-10 w-full rounded-full border border-slate-200 bg-white pl-10 pr-8 py-2 text-sm text-slate-800 placeholder-slate-400 shadow-xs transition-colors focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-zinc-500 dark:focus:border-purple-400 rtl:pl-8 rtl:pr-10"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:text-slate-600 dark:text-zinc-400 dark:hover:text-zinc-200 rtl:right-auto rtl:left-3"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Sort Dropdown (Clean text, no yellow star icon) */}
          <div className="w-auto">
            <Select
              value={sortBy}
              onValueChange={(val) => setSortBy(val as SortOption)}
            >
              <SelectTrigger
                size="default"
                className="h-10 rounded-full border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-xs hover:border-purple-300 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200"
              >
                <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5 text-violet-600 dark:text-violet-400 rtl:mr-0 rtl:ml-1.5" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent align={isRtl ? "start" : "end"} className="rounded-xl">
                <SelectItem value="featured">
                  {locale === "ar"
                    ? "المميز والأحدث (افتراضي)"
                    : locale === "es"
                    ? "Destacados / Hot"
                    : "Featured / Hot"}
                </SelectItem>
                <SelectItem value="alphabetical-asc">
                  {locale === "ar"
                    ? "أبجدياً: أ إلى ي"
                    : locale === "es"
                    ? "Alfabético: A a Z"
                    : "Alphabetical: A to Z"}
                </SelectItem>
                <SelectItem value="alphabetical-desc">
                  {locale === "ar"
                    ? "أبجدياً: ي إلى أ"
                    : locale === "es"
                    ? "Alfabético: Z a A"
                    : "Alphabetical: Z to A"}
                </SelectItem>
                <SelectItem value="newest">
                  {locale === "ar"
                    ? "الأحدث أولاً"
                    : locale === "es"
                    ? "Más recientes primero"
                    : "Newest First"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </motion.div>

      {/* Grid of Simulation Cards with Layout Transitions */}
      {filteredSimulations.length > 0 ? (
        <motion.div
          layout
          className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3"
          variants={containerVariants}
        >
          <AnimatePresence mode="popLayout">
            {filteredSimulations.map((sim) => {
              const isHotOrFeatured =
                sim.isFeatured || sim.badge === "HOT" || sim.badge === "NEW";

              return (
                <motion.article
                  layout
                  variants={itemVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  key={sim.id}
                  className="simulation-station group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/75 p-4 shadow-[0_15px_40px_-28px_rgba(15,23,42,.45)] transition-all duration-300 hover:-translate-y-2 hover:border-violet-400 hover:shadow-2xl hover:shadow-purple-500/20 dark:border-white/[0.08] dark:bg-[#08080A] dark:hover:border-white/[0.15]"
                >
                  {/* Glowing Top Edge on Hover */}
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-brand-gradient opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                  {/* Schematic Visual Box */}
                  <div className="relative mb-4 overflow-hidden rounded-xl border border-slate-200/70 bg-slate-50 p-2 dark:border-white/[0.08] dark:bg-zinc-950/60">
                    <SimulationSchematic
                      variant={
                        typeof sim.visualVariant === "number"
                          ? sim.visualVariant
                          : sim.index
                      }
                      labelled={false}
                      className="aspect-[1.26] w-full transition-transform duration-500 group-hover:scale-[1.035]"
                    />

                    {/* Featured / Hot Pill Badge (Top-Right of card/visual) */}
                    {(sim.isFeatured || sim.badge === "HOT") && (
                      <div className="absolute top-2.5 right-2.5 z-10 rtl:right-auto rtl:left-2.5">
                        <span className="inline-flex items-center gap-1 bg-gradient-to-br from-purple-600 to-rose-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-xs tracking-wider uppercase">
                          HOT
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Card Content & Action Button */}
                  <div className="flex flex-1 flex-col px-2 pb-2">
                    <h2 className="mb-2 text-xl font-bold tracking-[-0.03em] text-slate-900 dark:text-white">
                      {sim.title}
                    </h2>

                    <p className="mb-5 flex-1 min-h-12 text-sm leading-6 text-slate-600 dark:text-zinc-400">
                      {sim.description}
                    </p>

                    <div className="pt-2">
                      <Link
                        href={sim.href}
                        className="group/button inline-flex items-center gap-2 rounded-full border border-violet-300/70 bg-white/50 px-4 py-2.5 text-xs font-bold text-violet-700 shadow-sm transition-all duration-200 hover:scale-[1.02] hover:border-violet-400 hover:bg-violet-50 active:scale-[.97] dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-violet-300 dark:hover:bg-white/[0.08]"
                      >
                        {copy.controls.explore}{" "}
                        <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/button:-translate-y-0.5 group-hover/button:translate-x-0.5" />
                      </Link>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </motion.div>
      ) : (
        /* Empty State */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/40 py-16 px-4 text-center dark:border-white/10 dark:bg-white/[0.02]"
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-zinc-400">
            <Search className="h-6 w-6" />
          </div>
          <h3 className="mb-1 text-base font-bold text-slate-900 dark:text-white">
            {locale === "ar"
              ? "لم يتم العثور على محاكاة تطابق بحثك"
              : locale === "es"
              ? "No se encontraron simulaciones"
              : "No simulations found"}
          </h3>
          <p className="max-w-md text-xs text-slate-500 dark:text-zinc-400">
            {locale === "ar"
              ? "جرب تعديل معايير البحث أو اختيار تبويب تصنيف آخر."
              : locale === "es"
              ? "Intenta ajustar los términos de búsqueda o cambiar de categoría."
              : "Try adjusting your search terms or selecting another category."}
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory("all");
              setSearchQuery("");
            }}
            className="mt-4 rounded-full border border-violet-300/70 bg-white px-4 py-2 text-xs font-semibold text-violet-700 shadow-sm transition hover:bg-violet-50 dark:border-white/10 dark:bg-white/10 dark:text-violet-300"
          >
            {locale === "ar"
              ? "إعادة ضبط الفلاتر"
              : locale === "es"
              ? "Restablecer filtros"
              : "Reset filters"}
          </button>
        </motion.div>
      )}
    </motion.section>
  );
}
