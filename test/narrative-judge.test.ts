import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeLiquidation,
  createFixtureNarrativeConsistencyChecker,
} from "../src/index.ts";
import { alignedInput } from "./fixtures.ts";
import { mockNarrativeAsJudge } from "./narrative-judge.ts";

for (const expectedOutcome of ["CONSISTENT", "CONTRADICTS"] as const) {
  test(`mock LLM-as-a-judge accepts ${expectedOutcome} narrative harness case`, () => {
    const input = alignedInput();
    input.practice.narrative = "The vehicle suffered rear-end collision damage.";
    input.appraisal.narrative = expectedOutcome === "CONSISTENT"
      ? "Rear-end collision damage was found on the vehicle."
      : "No collision damage was found on the vehicle.";

    const analysis = analyzeLiquidation(
      input,
      createFixtureNarrativeConsistencyChecker(expectedOutcome),
    );
    const judgment = mockNarrativeAsJudge({ expectedOutcome, analysis });

    assert.equal(judgment.verdict, "PASS", judgment.reason);
    assert.deepEqual(judgment.observedOutcome, expectedOutcome);
  });
}

test("mock LLM-as-a-judge rejects a contradiction that leaks into the proposal", () => {
  const input = alignedInput();
  const analysis = analyzeLiquidation(
    input,
    createFixtureNarrativeConsistencyChecker("CONTRADICTS"),
  );
  const corruptedAnalysis = {
    ...analysis,
    proposedDecision: "LIQUIDATE",
    payableAmount: { minorUnits: 9_000, currency: "EUR" },
    amountStatus: "COMPUTED",
    requiresHumanReview: false,
  } as typeof analysis;

  const judgment = mockNarrativeAsJudge({
    expectedOutcome: "CONTRADICTS",
    analysis: corruptedAnalysis,
  });

  assert.equal(judgment.verdict, "FAIL");
  assert.match(judgment.reason, /did not block liquidation/);
  assert.match(judgment.reason, /produced a payable amount/);
});
