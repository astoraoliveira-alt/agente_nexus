/**
 * LGPD Data Masking Utility
 * Obscures sensitive information in strings using Regex patterns.
 */

// Basic Regex patterns for Brazilian/Common sensitive data
const PATTERNS = {
    // CPF: 000.000.000-00 or 00000000000
    // CPF: 000.000.000-00, 000.000.000.00 (user error) or 00000000000
    CPF: /(\d{3})\.?(\d{3})\.?(\d{3})[-.]?(\d{2})/g,

    // Email: user@domain.com -> u***@domain.com
    EMAIL: /([a-zA-Z0-9._-]+)(@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,

    // Phone: (XX) 99999-9999 or XX 999999999
    PHONE: /(\(?\d{2}\)?\s?\d{4,5}-?\d{4})/g,

    // Credit Card: 16 digits with spaces or dashes
    CARD: /(\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})/g,
};

/**
 * Masks sensitive information in a string.
 * @param text The string to mask
 * @param enabled Whether masking is active
 */
export function maskSensitiveData(text: string | null | undefined, enabled: boolean = true): string {
    if (!text) return '';
    if (!enabled) return text;

    let maskedText = text;

    // Mask CPF -> 123.***.***-34 (First 3 digits, Last 2 digits)
    maskedText = maskedText.replace(PATTERNS.CPF, (match, p1, p2, p3, p4) => {
        return `${p1}.***.***-${p4}`;
    });

    // Mask Email -> jo***@domain.com
    maskedText = maskedText.replace(PATTERNS.EMAIL, (match, p1, p2) => {
        const userPart = p1.substring(0, 2) + '***';
        return userPart + p2;
    });

    // Mask Phone -> (XX) *****-1234
    maskedText = maskedText.replace(PATTERNS.PHONE, (match) => {
        // Extract DDD (2 digits) and Last 4 digits
        const digits = match.replace(/\D/g, '');
        if (digits.length < 10) return match; // Invalid format

        // DDD: First 2 digits
        const ddd = digits.substring(0, 2);
        // Last 4 digits (for verification)
        const suffix = digits.slice(-4);

        // Construct mask: (DD) *****-SSSS
        const isNineDigit = digits.length === 11;
        // For 9 digit: 2 (DDD) + 9 (Number) = 11. Suffix is 4. Remaining middle is 5.
        // For 8 digit: 2 (DDD) + 8 (Number) = 10. Suffix is 4. Remaining middle is 4.
        const maskMiddle = isNineDigit ? '*****' : '****';

        return `(${ddd}) ${maskMiddle}-${suffix}`;
    });

    // Mask Cards -> 123 **** **** 456
    maskedText = maskedText.replace(PATTERNS.CARD, (match) => {
        const digits = match.replace(/\D/g, '');
        if (digits.length < 13) return match; // Too short

        const first3 = digits.substring(0, 3);
        const last3 = digits.slice(-3);

        // Preserve format separators? Or standardize?
        return `${first3} **** **** ${last3}`;
    });

    return maskedText;
}
