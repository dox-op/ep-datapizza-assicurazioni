import type {
  DeterministicAnalysis,
  Evidence,
  LineComparison,
  Money,
  NarrativeConsistencyChecker,
  W2Input,
} from "./domain.ts";

const RULE_VERSION = "w2-v0.1";

/** Compares two money values in the same normalized currency. */
function moneyEquals(left: Money, right: Money): boolean {
  return left.minorUnits === right.minorUnits && left.currency === right.currency;
}

/** Verifies that a money value is non-negative, integral, and in the practice currency. */
function isValidMoney(value: Money, currency: string): boolean {
  return (
    Number.isInteger(value.minorUnits) &&
    value.minorUnits >= 0 &&
    value.currency === currency
  );
}

/** Creates a traceable evidence item for a deterministic decision. */
function evidence(code: string, message: string, sourceRefs: string[]): Evidence {
  return { code, message, sourceRefs };
}

/** Sums normalized line totals while retaining their shared currency. */
function sumLines(lines: W2Input["appraisal"]["lines"]): Money {
  return {
    minorUnits: lines.reduce((sum, line) => sum + line.total.minorUnits, 0),
    currency: lines[0]?.total.currency ?? "EUR",
  };
}

/** Validates structural and monetary invariants before any business calculation. */
function validateInput(input: W2Input): Evidence[] {
  const issues: Evidence[] = [];
  if (!input) {
    return [evidence("MISSING_ENTITY", "Input W2 assente.", [])];
  }

  const missingEntities = ["practice", "appraisal", "invoice", "policy"].filter(
    (entity) => !(input as unknown as Record<string, unknown>)[entity],
  );
  if (missingEntities.length > 0) {
    return [evidence("MISSING_ENTITY", `Entità mancanti: ${missingEntities.join(", ")}.`, [])];
  }

  const { practice, appraisal, invoice, policy } = input;
  const entities = [practice, appraisal, invoice, policy];

  if (!practice.claimId || !practice.policyId || !practice.currency || !practice.sourceRef) {
    issues.push(evidence("INVALID_PRACTICE", "Practice is incomplete.", [practice.sourceRef]));
  }

  if (!practice.narrative || !appraisal.narrative) {
    issues.push(evidence("MISSING_NARRATIVE", "Practice or appraisal narrative is missing.", [practice.sourceRef, appraisal.sourceRef]));
  }

  if (appraisal.claimId !== practice.claimId) {
    issues.push(evidence("CLAIM_ID_MISMATCH", "Perizia riferita a un'altra pratica.", [appraisal.sourceRef]));
  }
  if (invoice.claimId !== practice.claimId) {
    issues.push(evidence("CLAIM_ID_MISMATCH", "Fattura riferita a un'altra pratica.", [invoice.sourceRef]));
  }
  if (policy.claimId !== practice.claimId || policy.policyId !== practice.policyId) {
    issues.push(evidence("POLICY_REFERENCE_MISMATCH", "Condizioni di polizza non coerenti con la pratica.", [policy.sourceRef]));
  }

  for (const entity of entities) {
    if (!entity.sourceRef) {
      issues.push(evidence("MISSING_SOURCE_REF", "Fonte dell'entità assente.", []));
    }
  }

  for (const [name, lines, total] of [
    ["perizia", appraisal.lines, appraisal.total],
    ["fattura", invoice.lines, invoice.total],
  ] as const) {
    if (lines.length === 0) {
      issues.push(evidence("MISSING_LINES", `Nessuna voce nella ${name}.`, [total.currency]));
    }

    const codes = new Set<string>();
    for (const line of lines) {
      if (!line.itemCode || codes.has(line.itemCode)) {
        issues.push(evidence("INVALID_ITEM_CODE", `Codice voce non valido nella ${name}.`, [line.sourceRef]));
      }
      codes.add(line.itemCode);
      if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
        issues.push(evidence("INVALID_QUANTITY", `Quantità non valida nella ${name}.`, [line.sourceRef]));
      }
      if (!isValidMoney(line.total, practice.currency)) {
        issues.push(evidence("INVALID_MONEY", `Importo voce non valido nella ${name}.`, [line.sourceRef]));
      }
    }

    if (!isValidMoney(total, practice.currency)) {
      issues.push(evidence("INVALID_MONEY", `Totale ${name} non valido.`, [total.currency]));
    } else if (!moneyEquals(total, sumLines(lines))) {
      issues.push(evidence("TOTAL_MISMATCH", `Totale ${name} diverso dalla somma delle voci.`, [total.currency]));
    }
  }

  if (!isValidMoney(policy.limit, practice.currency) || !isValidMoney(policy.deductible, practice.currency)) {
    issues.push(evidence("INVALID_POLICY_MONEY", "Massimale o franchigia non validi.", [policy.sourceRef]));
  }

  return issues;
}

/** Compares normalized appraisal and invoice lines by their canonical item code. */
function compareLines(input: W2Input): LineComparison[] {
  const invoiceByCode = new Map(input.invoice.lines.map((line) => [line.itemCode, line]));
  const appraisalByCode = new Map(input.appraisal.lines.map((line) => [line.itemCode, line]));
  const codes = new Set([...appraisalByCode.keys(), ...invoiceByCode.keys()]);

  return [...codes].sort().map((itemCode) => {
    const appraisalLine = appraisalByCode.get(itemCode);
    const invoiceLine = invoiceByCode.get(itemCode);
    const appraisalAmount = appraisalLine?.total ?? { minorUnits: 0, currency: input.practice.currency };
    const invoiceAmount = invoiceLine?.total ?? { minorUnits: 0, currency: input.practice.currency };
    const matches = Boolean(appraisalLine && invoiceLine && moneyEquals(appraisalAmount, invoiceAmount));
    return {
      itemCode,
      appraisalAmount,
      invoiceAmount,
      candidateAmount: {
        minorUnits: Math.min(appraisalAmount.minorUnits, invoiceAmount.minorUnits),
        currency: input.practice.currency,
      },
      matches,
      evidence: evidence(
        matches ? "LINE_MATCH" : "LINE_DIVERGENCE",
        matches ? `Voce ${itemCode} coerente.` : `Voce ${itemCode} divergente o assente in una fonte.`,
        [appraisalLine?.sourceRef, invoiceLine?.sourceRef].filter(Boolean) as string[],
      ),
    };
  });
}

/** Produces a fail-closed liquidation proposal from normalized documents and a narrative-check result. */
export function analyzeLiquidation(
  input: W2Input,
  narrativeChecker: NarrativeConsistencyChecker,
): DeterministicAnalysis {
  const issues = validateInput(input);
  if (issues.length > 0) {
    return {
      claimId: input?.practice?.claimId || "UNKNOWN",
      proposedDecision: "DO_NOT_LIQUIDATE",
      payableAmount: null,
      amountStatus: "NOT_COMPUTABLE",
      requiresHumanReview: true,
      issues,
      lineComparisons: [],
      ruleVersion: RULE_VERSION,
    };
  }

  const narrativeCheck = narrativeChecker.check({
    claimNarrative: input.practice.narrative,
    appraisalNarrative: input.appraisal.narrative,
    sourceRefs: [input.practice.sourceRef, input.appraisal.sourceRef],
  });

  // A contradiction invalidates the economic proposal before coverage and line calculations run.
  if (narrativeCheck.response.outcome === "CONTRADICTS") {
    return {
      claimId: input.practice.claimId,
      proposedDecision: "DO_NOT_LIQUIDATE",
      payableAmount: null,
      amountStatus: "NOT_COMPUTABLE",
      requiresHumanReview: true,
      issues: [
        evidence(
          "NARRATIVE_CONTRADICTION",
          "The appraisal narrative contradicts the original claim narrative.",
          narrativeCheck.sourceRefs,
        ),
      ],
      narrativeCheck,
      lineComparisons: [],
      ruleVersion: RULE_VERSION,
    };
  }

  if (!input.policy.covered) {
    return {
      claimId: input.practice.claimId,
      proposedDecision: "DO_NOT_LIQUIDATE",
      payableAmount: { minorUnits: 0, currency: input.practice.currency },
      amountStatus: "ZERO",
      requiresHumanReview: false,
      issues: [evidence("NOT_COVERED", "La pratica non risulta coperta.", [input.policy.sourceRef])],
      narrativeCheck,
      lineComparisons: [],
      ruleVersion: RULE_VERSION,
    };
  }

  const lineComparisons = compareLines(input);
  const gross = lineComparisons.reduce((sum, line) => sum + line.candidateAmount.minorUnits, 0);
  const capped = Math.min(gross, input.policy.limit.minorUnits);
  const net = Math.max(0, capped - input.policy.deductible.minorUnits);
  const amount: Money = { minorUnits: net, currency: input.practice.currency };
  const hasDivergence = lineComparisons.some((line) => !line.matches);

  return {
    claimId: input.practice.claimId,
    proposedDecision: net > 0 ? "LIQUIDATE" : "DO_NOT_LIQUIDATE",
    payableAmount: amount,
    amountStatus: net > 0 ? "COMPUTED" : "ZERO",
    requiresHumanReview: hasDivergence,
    issues: lineComparisons.filter((line) => !line.matches).map((line) => line.evidence),
    narrativeCheck,
    lineComparisons,
    ruleVersion: RULE_VERSION,
  };
}
