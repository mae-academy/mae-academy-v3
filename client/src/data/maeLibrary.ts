/**
 * MAE Library: study materials written by MAE Academy and its contributors.
 *
 * Publishing rules (they follow Google's AdSense content policy, https://support.google.com/adsense/answer/10015918):
 *  - Only items with `status: "published"` appear on the live site. Drafts show in development and Vercel Preview only, so no empty or
 *    "coming soon" entry is ever public.
 *  - Every published item needs real text on its page: a description, the contents, and a sample written by the author.
 *  - `rights` states who owns the item. Items by contributors need `permission` and the author's name in `authors`.
 *  - `updated` changes only when the item really changes (it feeds the visible date and the sitemap).
 */
export type MaeItemType = "test-bank" | "study-guide" | "summary" | "lab-manual" | "video-course" | "project";

export interface MaeLibraryItem {
  slug: string;
  type: MaeItemType;
  status: "published" | "draft";
  title: string;
  /** One or two sentences for the card. */
  summary: string;
  /** The full description shown on the item page. */
  description: string;
  language: string;
  authors: string[];
  rights: "owner" | "permission";
  /** ISO dates (YYYY-MM-DD). */
  published?: string;
  updated?: string;
  pages?: number;
  /** Table of contents, one entry per line, copied from the work itself. */
  contents: string[];
  /** A short excerpt written by the author, shown as text on the page. */
  sample: string[];
  /** Public link to the file (for example a shared Google Drive link). */
  downloadUrl?: string;
  /** Public link to the video (for example YouTube). */
  videoUrl?: string;
}

export const MAE_TYPE_ORDER: MaeItemType[] = ["video-course", "study-guide", "summary", "test-bank", "lab-manual", "project"];

const TODO = "[OWNER TO WRITE]";
const draft = (slug: string, type: MaeItemType, title: string): MaeLibraryItem => ({
  slug, type, status: "draft", title,
  summary: `${TODO}: one or two sentences.`,
  description: `${TODO}: what this material covers, who it is for, and how to use it.`,
  language: TODO, authors: ["Mohammad AbuElyan"], rights: "owner",
  contents: [`${TODO}: paste the table of contents`],
  sample: [`${TODO}: paste a short excerpt of the work (a worked example or two solved questions).`],
});

/** Works announced by the owner. They stay drafts until the owner supplies the real contents and sample. */
export const MAE_LIBRARY: MaeLibraryItem[] = [
  draft("control-systems-course", "video-course", "Control Systems video course"),
  draft("control-systems-study-guide", "study-guide", "Control Systems study guide"),
  draft("signals-and-systems-study-guide", "study-guide", "Signals and Systems study guide"),
  draft("computer-skills-study-guide", "study-guide", "Computer Skills study guide"),
  draft("plc-summary", "summary", "PLC summary"),
  draft("electrical-machines-test-bank", "test-bank", "Electrical Machines test bank"),
  draft("assembly-test-bank", "test-bank", "Assembly language test bank"),
  draft("sensors-lab-manual", "lab-manual", "Sensors lab manual"),
];

/** Drafts are shown in development and in Vercel Preview deployments (flag set in vite.config.ts), never in production. */
const DEFAULT_INCLUDE_DRAFTS = Boolean(import.meta.env?.DEV) || (typeof __SHOW_MAE_DRAFTS__ !== "undefined" && __SHOW_MAE_DRAFTS__);

export function visibleMaeItems(includeDrafts: boolean = DEFAULT_INCLUDE_DRAFTS): MaeLibraryItem[] {
  return MAE_LIBRARY.filter((item) => item.status === "published" || includeDrafts);
}

export const findMaeItem = (slug: string, includeDrafts?: boolean) => visibleMaeItems(includeDrafts).find((item) => item.slug === slug);

/** Types that actually have items, in display order. Empty categories are never shown. */
export function maeTypesWithItems(items: MaeLibraryItem[]): MaeItemType[] {
  return MAE_TYPE_ORDER.filter((type) => items.some((item) => item.type === type));
}
