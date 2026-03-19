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
