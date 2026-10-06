import type {
  DeterministicAnalysis,
  NarrativeConsistencyOutcome,
} from "../src/domain.ts";

type NarrativeJudgeInput = {
  expectedOutcome: NarrativeConsistencyOutcome;
  analysis: DeterministicAnalysis;
};

export type NarrativeJudgeResult = {
  verdict: "PASS" | "FAIL";
  reason: string;
  observedOutcome: NarrativeConsistencyOutcome | undefined;
};

/** Evaluates the narrative gate output against a synthetic oracle like an LLM judge. */
export function mockNarrativeAsJudge({
  expectedOutcome,
  analysis,
}: NarrativeJudgeInput): NarrativeJudgeResult {
  const observedOutcome = analysis.narrativeCheck?.response.outcome;
  const failures: string[] = [];

  if (observedOutcome !== expectedOutcome) {
    failures.push(`expected outcome ${expectedOutcome}, received ${observedOutcome ?? "missing"}`);
  }

  // CONTRADICTS must fail closed; CONSISTENT must preserve the aligned economic proposal.
  if (expectedOutcome === "CONTRADICTS") {
    if (analysis.proposedDecision !== "DO_NOT_LIQUIDATE") {
      failures.push("contradiction did not block liquidation");
    }
    if (analysis.payableAmount !== null) {
      failures.push("contradiction produced a payable amount");
    }
    if (analysis.amountStatus !== "NOT_COMPUTABLE") {
      failures.push("contradiction did not mark amount as not computable");
    }
    if (!analysis.requiresHumanReview) {
      failures.push("contradiction did not require human review");
    }
  } else {
    if (analysis.proposedDecision !== "LIQUIDATE") {
      failures.push("consistent aligned case did not preserve liquidation");
    }
    if (analysis.payableAmount === null) {
      failures.push("consistent aligned case lost payable amount");
    }
    if (analysis.amountStatus !== "COMPUTED") {
      failures.push("consistent aligned case did not compute amount");
    }
    if (analysis.requiresHumanReview) {
      failures.push("consistent aligned case unexpectedly required human review");
    }
  }

  return {
    verdict: failures.length === 0 ? "PASS" : "FAIL",
    reason: failures.length === 0 ? "All narrative gate criteria passed." : failures.join("; "),
    observedOutcome,
  };
}
