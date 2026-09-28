import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normalizes a string for phonetic comparison by:
 * 1. Removing accents (á -> a, ç -> c, etc.)
 * 2. Lowercasing
 * 3. Collapsing phonetically equivalent characters:
 *    s/z/x -> s  |  c/k/q -> k  |  g/j -> g  |  m/n -> m
 */
function normalizePhonetic(str: string): string {
  if (!str) return '';
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .toLowerCase()
    .replace(/x/g, 's')   // x -> s sound
    .replace(/z/g, 's')   // z -> s sound
    .replace(/ç/g, 's')   // ç -> s sound
    .replace(/ss/g, 's')  // ss -> s sound
    .replace(/k/g, 'k')   // keep k
    .replace(/q/g, 'k')   // q -> k sound
    .replace(/c/g, 'k')   // c -> k (covers ka, ko, ku)
    .replace(/j/g, 'g');  // j -> g sound
}

/**
 * Returns a RegExp for use in highlighting that matches phonetic equivalents.
 * Since we normalize both sides for filtering, this RegExp is used only for
 * yellow highlight rendering, so it uses a simpler literal approach.
 */
export function getPhoneticRegex(term: string, flags: string = 'gi'): RegExp | null {
  if (!term || term.trim() === '') return null;
  // Strip accents from term for display matching
  const clean = term.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  try {
    return new RegExp(`(${clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, flags);
  } catch {
    return null;
  }
}

/**
 * Tests whether a text string matches a search term using phonetic normalization.
 * This is the main function to use for filtering.
 */
export function phoneticMatch(text: string, term: string): boolean {
  if (!text || !term) return false;
  return normalizePhonetic(text).includes(normalizePhonetic(term));
}

/**
 * ISO 42001 Compliance Status logic.
 * Simple rule-based logic for UI badge display.
 */
export function calculateISOStatus(company: any) {
  if (company.privacySettings?.anonymizationEnabled && company.privacySettings?.retentionDays <= 90) {
    return 'conform';
  }
  if (company.plan === 'enterprise' && !company.privacySettings?.anonymizationEnabled) {
    return 'critical';
  }
  return 'pending';
}

/**
 * Determines if a metric should be billed based on the agent's lifecycle stage.
 */
export const isMetricBillable = (stage?: string) => {
  if (!stage) return true;
  const s = stage.toLowerCase();
  return !['poc', 'sandbox', 'internal'].includes(s);
};

/**
 * Sanitizes email addresses by removing:
 * - Invisible unicode characters (zero-width spaces \u200B-\u200D, BOM \uFEFF, invisible directional marks, etc.)
 * - All kinds of unicode whitespace (\s, non-breaking space \u00A0, em/en spaces, etc.)
 * - Surrounding quotes or brackets (e.g., copied from email headers like <user@domain.com> or "user@domain.com")
 * - Converts to lowercase
 */
export function sanitizeEmail(email: string | null | undefined): string {
  if (!email) return '';
  return String(email)
    .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u2060\u00AD\u180E]/g, '')
    .replace(/[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/g, '')
    .replace(/^[<"'\u201C\u201D\u2018\u2019]+|[>"'\u201C\u201D\u2018\u2019;]+$/g, '')
    .toLowerCase();
}

/**
 * Checks whether an email address is valid against standard email formatting.
 */
export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const sanitized = sanitizeEmail(email);
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(sanitized);
}

