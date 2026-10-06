type ReplacementPair = {
  original: string;
  placeholder: string;
};

/** Replaces literal PII values in JSON-compatible documents and restores them in outputs. */
export class PiiAnonymizationWrapper {
  #placeholderToOriginal = new Map<string, string>();
  #replacementPairs: readonly ReplacementPair[];

  constructor(piiValues: readonly string[]) {
    const originalToPlaceholder = new Map<string, string>();

    for (const value of piiValues) {
      if (value.length === 0) {
        throw new TypeError("PII values must not be empty.");
      }

      if (!originalToPlaceholder.has(value)) {
        const placeholder = `[PII_${String(originalToPlaceholder.size + 1).padStart(3, "0")}]`;
        originalToPlaceholder.set(value, placeholder);
        this.#placeholderToOriginal.set(placeholder, value);
      }
    }

    this.#replacementPairs = [...originalToPlaceholder.entries()]
      .map(([original, placeholder]) => ({ original, placeholder }))
      .sort((left, right) => right.original.length - left.original.length);
  }

  /** Returns a deep transformed copy with configured PII values replaced by placeholders. */
  sanitize<T>(document: T): T {
    return transformDocument(document, (value) => this.replaceOriginals(value));
  }

  /** Returns a deep transformed copy with known placeholders replaced by original PII values. */
  restore<T>(output: T): T {
    return transformDocument(output, (value) => this.restorePlaceholders(value));
  }

  /** Replaces configured original values in one string without interpreting them as regexes. */
  private replaceOriginals(value: string): string {
    return this.#replacementPairs.reduce(
      (current, pair) => replaceLiteral(current, pair.original, pair.placeholder),
      value,
    );
  }

  /** Restores only placeholders created by this wrapper instance. */
  private restorePlaceholders(value: string): string {
    return [...this.#placeholderToOriginal.entries()].reduce(
      (current, [placeholder, original]) => replaceLiteral(current, placeholder, original),
      value,
    );
  }
}

/** Recursively transforms string values while preserving JSON-compatible document structure. */
function transformDocument<T>(value: T, transformString: (value: string) => string): T {
  if (typeof value === "string") {
    return transformString(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => transformDocument(item, transformString)) as T;
  }

  if (value !== null && typeof value === "object") {
    const transformed: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      transformed[key] = transformDocument(child, transformString);
    }
    return transformed as T;
  }

  return value;
}

/** Replaces all literal occurrences of a value without regular-expression semantics. */
function replaceLiteral(value: string, search: string, replacement: string): string {
  return value.split(search).join(replacement);
}
