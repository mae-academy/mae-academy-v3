import { useState, useEffect, useRef } from "react";
import { motion, Variants } from "framer-motion";
import {
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Globe,
  Check,
  ChevronDown,
  Layers,
  X,
} from "lucide-react";
import { BOOK_CATEGORIES, LibrarySort } from "@/lib/internetarchive";
import { searchAllBooks } from "@/lib/unifiedBooks";
import type { UnifiedBook } from "@/lib/bookSources";
import LibraryBookCard from "@/components/LibraryBookCard";

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 180, damping: 22 } },
};

const PAGE_SIZES = [12, 24, 48, 96];
const ARCHIVE_MAX_WINDOW = 10_000;

const LIBRARY_COPY = {
  eyebrow: "02 / Academic Library",
  title: "Read the books that engineers learn from.",
  description:
    "Open textbooks, manuals and references in engineering, computing, mathematics and physics, readable in the browser straight from the Internet Archive.",
};

const CATEGORY_OPTIONS = BOOK_CATEGORIES.map((name) => ({ label: name, value: name }));

const SORT_OPTIONS: { label: string; value: LibrarySort }[] = [
  { label: "Trending",        value: "trending"       },
  { label: "Most Downloaded", value: "top_downloaded" },
  { label: "Newest",          value: "newest"         },
  { label: "Earliest",        value: "earliest"       },
];

const LANGUAGE_OPTIONS = [
  { label: "All Languages",               value: "all" },
  { label: "English (en)",                value: "en"  },
  { label: "العربية – Arabic (ar)",       value: "ar"  },
  { label: "Español – Spanish (es)",      value: "es"  },
  { label: "Deutsch – German (de)",       value: "de"  },
  { label: "Français – French (fr)",      value: "fr"  },
  { label: "中文 – Chinese (zh)",          value: "zh"  },
  { label: "日本語 – Japanese (ja)",       value: "ja"  },
  { label: "Italiano – Italian (it)",     value: "it"  },
  { label: "Русский – Russian (ru)",      value: "ru"  },
];

export default function AcademicLibrary() {

  // ── Isolated, non-leaking state ───────────────────────────────────────────
  const [searchInput,    setSearchInput]    = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [category,  setCategory]  = useState("All Engineering");
  const [language,  setLanguage]  = useState("all");
  const [sort,      setSort]      = useState<LibrarySort>("trending");
  const [page,      setPage]      = useState(1);
  const [perPage,   setPerPage]   = useState(24);

  const [books,     setBooks]     = useState<UnifiedBook[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading,  setIsLoading]  = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [retryTick,  setRetryTick]  = useState(0);

  // Dropdowns
  const [openDropdown, setOpenDropdown] = useState<"category" | "language" | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const gridRef     = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── 500 ms debounce: sync search input → submittedQuery ──────────────────
  useEffect(() => {
    if (searchInput.trim() === "") {
      // Immediately clear submitted query when input is emptied
      setSubmittedQuery("");
      setPage(1);
      return;
    }
    const t = setTimeout(() => {
      setSubmittedQuery(searchInput.trim());
      setPage(1);
    }, 500);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── Master fetch effect – clears stale cards, then COMPLETELY REPLACES books ──
  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    setBooks([]);

    searchAllBooks({ query: submittedQuery, category, language, sort, page, perPage }, controller.signal)
      .then(({ books: fetched, totalCount: count }) => {
        setBooks(fetched);
        setTotalCount(count);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Library fetch error:", err);
        setBooks([]);
        setTotalCount(0);
        setError(err instanceof Error ? err.message : "Failed to load books.");
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [submittedQuery, category, language, sort, page, perPage, retryTick]);

  // ── Handlers (always reset page to 1 when filters change) ─────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      setSubmittedQuery(searchInput.trim());
      setPage(1);
    }
  };

  const clearSearch = () => {
    setSearchInput("");
    setSubmittedQuery("");
    setPage(1);
  };

  const handleCategoryChange = (val: string) => {
    setCategory(val);
    setPage(1);
    setOpenDropdown(null);
  };

  const handleLanguageChange = (val: string) => {
    setLanguage(val);
    setPage(1);
    setOpenDropdown(null);
  };

  const handleSortChange = (val: LibrarySort) => {
    setSort(val);
    setPage(1);
  };

  const handlePageSizeChange = (val: number) => {
    setPerPage(val);
    setPage(1);
  };

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalPages  = Math.max(1, Math.ceil(totalCount / perPage));
  const maxSafePage = Math.min(totalPages, Math.floor(ARCHIVE_MAX_WINDOW / perPage));

  // Clamp page whenever maxSafePage shrinks (e.g. after filter change)
  useEffect(() => {
    if (!isLoading && totalCount > 0 && page > maxSafePage) setPage(maxSafePage);
  }, [maxSafePage, page, isLoading, totalCount]);

  // The Internet Archive only serves page * rows <= 10,000; the catalog itself is far larger.
  const capNotice =
    totalCount > ARCHIVE_MAX_WINDOW ? (
      <span
        title={`The Internet Archive serves at most ${ARCHIVE_MAX_WINDOW.toLocaleString()} results per query. Narrow the search, category or language to reach the rest of the ${totalCount.toLocaleString()} matches.`}
        className="inline-flex cursor-help items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-700/60 dark:text-slate-300"
      >
        Browsing top {ARCHIVE_MAX_WINDOW.toLocaleString()} indexed books
      </span>
    ) : null;

  const goToPage = (target: number) => {
    if (target < 1 || target > maxSafePage) return;
    setPage(target);
    if (gridRef.current) {
      gridRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const getPageNumbers = (): (number | "...")[] => {
    if (maxSafePage <= 1) return [];
    const result: (number | "...")[] = [];

    const addPage = (p: number) => {
      if (p >= 1 && p <= maxSafePage && !result.includes(p)) result.push(p);
    };
    const addEllipsis = () => {
      if (result[result.length - 1] !== "...") result.push("...");
    };

    addPage(1);
    if (page > 3) addEllipsis();
    for (let p = Math.max(2, page - 1); p <= Math.min(maxSafePage - 1, page + 1); p++) addPage(p);
    if (page < maxSafePage - 2) addEllipsis();
    addPage(maxSafePage);

    return result;
  };

  const activeCategoryLabel = CATEGORY_OPTIONS.find((c) => c.value === category)?.label ?? "All Engineering";
  const activeLanguageLabel = LANGUAGE_OPTIONS.find((l) => l.value === language)?.label ?? "All Languages";
  const hasActiveFilters =
    submittedQuery || category !== "All Engineering" || language !== "all" || sort !== "trending";

  const resetAll = () => {
    setSearchInput("");
    setSubmittedQuery("");
    setCategory("All Engineering");
    setLanguage("all");
    setSort("trending");
    setPage(1);
  };

  return (
    <motion.section
      className="container py-14 sm:py-20 font-['Tajawal',sans-serif] leading-relaxed"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── Header ── */}
      <motion.div variants={itemVariants} className="mb-12 grid gap-7 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
        <div>
          <div className="mb-4 flex items-center gap-3">
            <p className="text-[10px] font-bold tracking-[0.18em] text-violet-700 dark:text-violet-300">
              {LIBRARY_COPY.eyebrow}
            </p>
            <span className="h-px w-16 bg-brand-gradient" />
          </div>
          <h1 className="max-w-3xl text-4xl font-black tracking-[-0.055em] text-slate-950 sm:text-6xl dark:text-white">
            {LIBRARY_COPY.title}
          </h1>
        </div>
        <p className="max-w-xl border-l-2 border-gradient-signal pl-5 text-base leading-7 text-slate-600 dark:text-zinc-400 rtl:border-l-0 rtl:border-r-2 rtl:pl-0 rtl:pr-5">
          {LIBRARY_COPY.description}
        </p>
      </motion.div>

      {/* ── Controls ── */}
      <motion.div variants={itemVariants} className="mb-10 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Search */}
          <div className="relative w-full max-w-md lg:max-w-lg">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
              <Search className="h-5 w-5" />
            </div>
            <input
              type="text"
              id="library-search-input"
              placeholder="Search books by title, author or topic (e.g. thermodynamics, PLC)…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full rounded-2xl border border-slate-200 bg-white/75 py-3.5 pl-12 pr-12 text-sm text-slate-900 shadow-sm transition-all focus:border-violet-500 focus:outline-none focus:ring-4 focus:ring-violet-500/10 dark:border-white/[0.08] dark:bg-zinc-950/60 dark:text-white dark:focus:border-violet-500"
            />
            {/* Clear or Loading indicator */}
            <div className="absolute inset-y-0 right-0 flex items-center pr-3.5">
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
              ) : searchInput ? (
                <button
                  onClick={clearSearch}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-slate-500 transition-colors hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          {/* Dropdowns + Sort */}
          <div className="flex flex-wrap items-center gap-3" ref={dropdownRef}>
            {/* Category */}
            <div className="relative">
              <button
                id="category-dropdown-btn"
                type="button"
                onClick={() => setOpenDropdown(openDropdown === "category" ? null : "category")}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs transition-all hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:text-white"
              >
                <Layers className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
                <span className="max-w-[150px] truncate">Category: {activeCategoryLabel}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${openDropdown === "category" ? "rotate-180" : ""}`} />
              </button>
              {openDropdown === "category" && (
                <div className="absolute right-0 top-full z-50 mt-2 max-h-80 w-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl animate-in fade-in zoom-in-95 dark:border-slate-800 dark:bg-slate-900">
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Engineering Disciplines
                  </div>
                  <div className="space-y-0.5">
                    {CATEGORY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => handleCategoryChange(opt.value)}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-1.5 text-start text-xs transition-all ${
                          category === opt.value
                            ? "bg-gradient-to-br from-blue-600 via-purple-600 to-red-600 font-semibold text-white shadow-sm"
                            : "font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-white"
                        }`}
                      >
                        <span className="truncate">{opt.label}</span>
                        {category === opt.value && <Check className="ml-1.5 h-3.5 w-3.5 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Language */}
            <div className="relative">
              <button
                id="language-dropdown-btn"
                type="button"
                onClick={() => setOpenDropdown(openDropdown === "language" ? null : "language")}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs transition-all hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:text-white"
              >
                <Globe className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
                <span className="max-w-[140px] truncate">Language: {activeLanguageLabel}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${openDropdown === "language" ? "rotate-180" : ""}`} />
              </button>
              {openDropdown === "language" && (
                <div className="absolute right-0 top-full z-50 mt-2 max-h-80 w-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl animate-in fade-in zoom-in-95 dark:border-slate-800 dark:bg-slate-900">
                  <div className="space-y-0.5">
                    {LANGUAGE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => handleLanguageChange(opt.value)}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-1.5 text-start text-xs transition-all ${
                          language === opt.value
                            ? "bg-gradient-to-br from-blue-600 via-purple-600 to-red-600 font-semibold text-white shadow-sm"
                            : "font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-white"
                        }`}
                      >
                        <span>{opt.label}</span>
                        {language === opt.value && <Check className="h-3.5 w-3.5 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sort segmented pill */}
            <div className="flex items-center gap-2">
              <span className="hidden text-xs font-semibold text-slate-500 dark:text-slate-400 sm:inline">Sort:</span>
              <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 p-1 shadow-xs dark:border-slate-700 dark:bg-slate-800/90">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleSortChange(opt.value)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                      sort === opt.value
                        ? "bg-gradient-to-br from-blue-600 via-purple-600 to-red-600 font-semibold text-white shadow-md"
                        : "bg-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Filter summary + active tags */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            {totalCount > 0 && (
              <span>
                Discovered <strong className="text-slate-900 dark:text-white">{totalCount.toLocaleString()}</strong> free-to-read engineering &amp; science books
              </span>
            )}
            {capNotice}
            {category !== "All Engineering" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                {activeCategoryLabel}
                <button onClick={() => handleCategoryChange("All Engineering")} className="hover:text-violet-900 dark:hover:text-white ml-0.5">✕</button>
              </span>
            )}
            {language !== "all" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                {activeLanguageLabel}
                <button onClick={() => handleLanguageChange("all")} className="hover:text-blue-900 dark:hover:text-white ml-0.5">✕</button>
              </span>
            )}
            {submittedQuery && (
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-semibold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                Keyword: "{submittedQuery}"
                <button onClick={clearSearch} className="hover:text-purple-900 dark:hover:text-white ml-0.5">✕</button>
              </span>
            )}
          </div>
          {hasActiveFilters && (
            <button
              onClick={resetAll}
              className="text-xs font-semibold text-violet-600 hover:underline dark:text-violet-400"
            >
              Reset all filters
            </button>
          )}
        </div>
      </motion.div>

      {/* ── Grid / Results ── */}
      {isLoading ? (
        <div ref={gridRef} className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: Math.min(perPage, 12) }).map((_, i) => (
            <div
              key={i}
              className="h-[430px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-white/[0.03]"
            />
          ))}
        </div>
      ) : error ? (
        <div
          ref={gridRef}
          role="alert"
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-red-300 py-20 text-center dark:border-red-500/30"
        >
          <p className="text-lg font-bold text-slate-900 dark:text-white">Could not load books</p>
          <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-zinc-400">{error}</p>
          <button
            onClick={() => setRetryTick((t) => t + 1)}
            className="mt-6 rounded-full bg-violet-100 px-6 py-2 text-sm font-bold text-violet-700 transition-colors hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-300"
          >
            Retry
          </button>
        </div>
      ) : books.length === 0 ? (
        <div
          ref={gridRef}
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-20 text-center dark:border-white/[0.08]"
        >
          <p className="text-lg font-bold text-slate-900 dark:text-white">No books found</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-zinc-400">
            Try adjusting your search query or selecting a different discipline.
          </p>
          <button
            onClick={resetAll}
            className="mt-6 rounded-full bg-violet-100 px-6 py-2 text-sm font-bold text-violet-700 transition-colors hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-300"
          >
            Reset Search
          </button>
        </div>
      ) : (
        <motion.div
          ref={gridRef}
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          variants={containerVariants}
        >
          {books.map((book) => (
            <LibraryBookCard
              key={book.id}
              book={book}
              itemVariants={itemVariants}
            />
          ))}
        </motion.div>
      )}

      {/* ── Numbered Pagination Footer ── */}
      {maxSafePage > 1 && (
        <div className="mt-16 flex flex-col gap-6 border-t border-slate-200 pt-8 dark:border-slate-800/80 lg:flex-row lg:items-center lg:justify-between">
          {/* Status */}
          <div className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 lg:text-start">
            Page{" "}
            <span className="font-semibold text-slate-800 dark:text-slate-200">{page}</span>{" "}
            of{" "}
            <span className="font-semibold text-slate-800 dark:text-slate-200">{maxSafePage.toLocaleString()}</span>{" "}
            <span className="opacity-75">({totalCount.toLocaleString()} total books)</span>{" "}
            {capNotice}
          </div>

          {/* Page buttons */}
          <div className="mx-auto flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 p-1 shadow-xs dark:border-slate-700 dark:bg-slate-800/90 lg:mx-0">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              aria-label="Previous page"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-transparent text-slate-600 transition-all hover:text-slate-900 disabled:opacity-30 dark:text-slate-400 dark:hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {getPageNumbers().map((num, idx) =>
              num === "..." ? (
                <span
                  key={`ellipsis-${idx}`}
                  className="flex h-9 w-8 select-none items-center justify-center px-1 text-xs font-bold text-slate-400 dark:text-slate-500"
                >
                  …
                </span>
              ) : (
                <button
                  key={num}
                  onClick={() => goToPage(num as number)}
                  className={
                    page === num
                      ? "flex h-9 min-w-[2.25rem] items-center justify-center rounded-full bg-gradient-to-br from-blue-600 via-purple-600 to-red-600 px-3.5 text-xs font-bold text-white shadow-md transition-transform active:scale-95"
                      : "flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
                  }
                >
                  {num}
                </button>
              )
            )}

            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= maxSafePage}
              aria-label="Next page"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-transparent text-slate-600 transition-all hover:text-slate-900 disabled:opacity-30 dark:text-slate-400 dark:hover:text-white"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Per-page selector */}
          <div className="flex items-center justify-center gap-2 lg:justify-end">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Per page:</span>
            <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 p-1 shadow-xs dark:border-slate-700 dark:bg-slate-800/90">
              {PAGE_SIZES.map((size) => (
                <button
                  key={size}
                  onClick={() => handlePageSizeChange(size)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-all duration-200 ${
                    perPage === size
                      ? "bg-gradient-to-br from-blue-600 via-purple-600 to-red-600 font-semibold text-white shadow-md"
                      : "bg-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </motion.section>
  );
}
