import assert from "node:assert/strict";
import test from "node:test";
import { analyzeLiquidation, evaluateLiquidation } from "../src/index.ts";
import { alignedInput, consistentNarrativeChecker } from "./fixtures.ts";

test("propone liquidazione per perizia e fattura allineate", () => {
  const result = analyzeLiquidation(alignedInput(), consistentNarrativeChecker());

  assert.equal(result.proposedDecision, "LIQUIDATE");
  assert.deepEqual(result.payableAmount, { minorUnits: 90_00, currency: "EUR" });
  assert.equal(result.amountStatus, "COMPUTED");
  assert.equal(result.requiresHumanReview, false);
  assert.equal(result.issues.length, 0);
});

test("compone motivazione senza modificare outcome deterministico", () => {
  const result = evaluateLiquidation(alignedInput(), consistentNarrativeChecker(), "seed-001");

  assert.equal(result.proposedDecision, "LIQUIDATE");
  assert.deepEqual(result.payableAmount, { minorUnits: 90_00, currency: "EUR" });
  assert.equal(result.motivation.index >= 0 && result.motivation.index < 100, true);
  assert.match(result.motivation.response, /LIQUIDATE/);
  assert.equal("systemPrompt" in result.motivation, false);
  assert.deepEqual(result.motivation.facts.policy, {
    covered: true,
    limit: { minorUnits: 50_000, currency: "EUR" },
    deductible: { minorUnits: 1_000, currency: "EUR" },
    sourceRef: "policy://POL-001",
  });
  assert.deepEqual(result.motivation.facts.documents, {
    appraisalTotal: { minorUnits: 10_000, currency: "EUR" },
    invoiceTotal: { minorUnits: 10_000, currency: "EUR" },
    appraisalLines: [{ itemCode: "BUMPER", amount: { minorUnits: 10_000, currency: "EUR" }, sourceRef: "appraisal://APP-001#line-1" }],
    invoiceLines: [{ itemCode: "BUMPER", amount: { minorUnits: 10_000, currency: "EUR" }, sourceRef: "invoice://INV-001#line-1" }],
  });
  assert.match(result.motivation.response, /Sinistro: The insured vehicle sustained front bumper damage/);
  assert.match(result.motivation.response, /Perizia narrativa: The inspection confirms front bumper damage/);
  assert.match(result.motivation.response, /Copertura: attiva/);
  assert.match(result.motivation.response, /Massimale: 50000 EUR/);
  assert.match(result.motivation.response, /Franchigia: 1000 EUR/);
  assert.match(result.motivation.response, /Perizia: 10000 EUR/);
  assert.match(result.motivation.response, /Fattura: 10000 EUR/);
});
