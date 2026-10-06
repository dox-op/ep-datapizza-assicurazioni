import type {
  NarrativeCheck,
  NarrativeCheckInput,
  NarrativeConsistencyChecker,
  NarrativeConsistencyOutcome,
} from "./domain.ts";
import { createMockNarrativeResponse } from "./mocks/narrative-consistency.ts";

/** Builds the system prompt for the narrative-consistency check. */
export function buildNarrativeConsistencySystemPrompt(input: NarrativeCheckInput): string {
  return [
    "You are a claims narrative consistency evaluator.",
    "Compare the original claim narrative with the appraisal narrative.",
    "Return only JSON with one field: outcome.",
    'outcome must be exactly "CONSISTENT" or "CONTRADICTS".',
    "Do not assess coverage, damages, fraud, or payable amount.",
    "",
    "<INPUT_JSON>",
    "```json",
    JSON.stringify(input, null, 2),
    "```",
    "</INPUT_JSON>",
  ].join("\n");
}

/** Creates a deterministic checker that returns the outcome declared by a synthetic fixture. */
export function createFixtureNarrativeConsistencyChecker(
  outcome: NarrativeConsistencyOutcome,
): NarrativeConsistencyChecker {
  return {
    /** Returns the fixture-declared LLM response for the supplied narratives. */
    check(input: NarrativeCheckInput): NarrativeCheck {
      const response = createMockNarrativeResponse(
        buildNarrativeConsistencySystemPrompt(input),
        outcome,
      );
      return {
        response,
        sourceRefs: input.sourceRefs,
      };
    },
  };
}
