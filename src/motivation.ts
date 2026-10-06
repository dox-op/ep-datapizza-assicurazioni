import type {
  DeterministicAnalysis,
  Motivation,
  MotivationFacts,
  W2Input,
} from "./domain.ts";
import { createMockMotivationResponse } from "./mocks/motivation.ts";

export { MOTIVATION_CATALOG } from "./mocks/motivation.ts";

/** Builds a minimal facts snapshot that keeps narrative, economic data, and sources together. */
export function buildMotivationFacts(
  input: W2Input,
  analysis: DeterministicAnalysis,
): MotivationFacts {
  const safeInput = (input ?? {}) as Partial<W2Input>;
  const practice = safeInput.practice;
  const appraisal = safeInput.appraisal;
  const invoice = safeInput.invoice;
  const policy = safeInput.policy;
  return {
    claim: {
      claimId: analysis.claimId,
      narrative: practice?.narrative ?? "",
      sourceRef: practice?.sourceRef ?? "",
    },
    appraisal: {
      narrative: appraisal?.narrative ?? "",
      total: appraisal?.total ?? null,
      sourceRef: appraisal?.sourceRef ?? "",
    },
    invoice: {
      total: invoice?.total ?? null,
      sourceRef: invoice?.sourceRef ?? "",
    },
    policy: {
      covered: policy?.covered ?? null,
      limit: policy?.limit ?? null,
      deductible: policy?.deductible ?? null,
      sourceRef: policy?.sourceRef ?? "",
    },
    documents: {
      appraisalTotal: appraisal?.total ?? null,
      invoiceTotal: invoice?.total ?? null,
      appraisalLines: (appraisal?.lines ?? []).map((line) => ({
        itemCode: line.itemCode,
        amount: line.total,
        sourceRef: line.sourceRef,
      })),
      invoiceLines: (invoice?.lines ?? []).map((line) => ({
        itemCode: line.itemCode,
        amount: line.total,
        sourceRef: line.sourceRef,
      })),
    },
  };
}

/** Builds the system prompt for the motivation writer from the analysis and source facts. */
export function buildMotivationSystemPrompt(
  analysis: DeterministicAnalysis,
  facts: MotivationFacts,
): string {
  return [
    "You write a concise motivation for a claims adjuster.",
    "Do not change the decision, amount, or human-review state.",
    "Explain coverage, policy limit, deductible, appraisal data, invoice data, and their relation to the claim.",
    "Use only the supplied JSON facts.",
    "Cite evidence through sourceRef.",
    "State that the amount is not computable when amountStatus is NOT_COMPUTABLE.",
    "Do not invent clauses, documents, amounts, or sources.",
    "",
    "ANALYSIS_JSON:",
    JSON.stringify(analysis, null, 2),
    "",
    "SOURCE_FACTS_JSON:",
    JSON.stringify(facts, null, 2),
  ].join("\n");
}

/** Creates a deterministic mock motivation without changing the analysis. */
export function composeMotivation(
  input: W2Input,
  analysis: DeterministicAnalysis,
  seed = analysis.claimId,
): Motivation {
  const facts = buildMotivationFacts(input, analysis);
  const systemPrompt = buildMotivationSystemPrompt(analysis, facts);
  const llmResponse = createMockMotivationResponse(systemPrompt, analysis, facts, seed);

  return {
    index: llmResponse.index,
    seed,
    facts,
    response: llmResponse.response,
  };
}
