export * from "./domain.ts";
export { PiiAnonymizationWrapper } from "./anonymization.ts";
export {
  buildNarrativeConsistencySystemPrompt,
  createFixtureNarrativeConsistencyChecker,
} from "./narrative-consistency.ts";
export { analyzeLiquidation } from "./liquidation.ts";
export {
  MOTIVATION_CATALOG,
  buildMotivationFacts,
  buildMotivationSystemPrompt,
  composeMotivation,
} from "./motivation.ts";

import type { LiquidationProposal, NarrativeConsistencyChecker, W2Input } from "./domain.ts";
import { PiiAnonymizationWrapper } from "./anonymization.ts";
import { analyzeLiquidation } from "./liquidation.ts";
import { composeMotivation } from "./motivation.ts";

/** Evaluates a proposal and adds a deterministic motivation after the narrative check. */
export function evaluateLiquidation(
  input: W2Input,
  narrativeChecker: NarrativeConsistencyChecker,
  seed = input?.practice?.claimId || "UNKNOWN",
): LiquidationProposal {
  const analysis = analyzeLiquidation(input, narrativeChecker);
  return {
    ...analysis,
    motivation: composeMotivation(input, analysis, seed),
  };
}

/** Runs W2 on sanitized documents and restores configured PII only in the final proposal. */
export function evaluateLiquidationWithPiiProtection(
  input: W2Input,
  narrativeChecker: NarrativeConsistencyChecker,
  piiValues: readonly string[],
  seed = input?.practice?.claimId || "UNKNOWN",
): LiquidationProposal {
  const wrapper = new PiiAnonymizationWrapper(piiValues);
  const sanitizedInput = wrapper.sanitize(input);
  const sanitizedProposal = evaluateLiquidation(sanitizedInput, narrativeChecker, seed);
  return wrapper.restore(sanitizedProposal);
}
