import assert from "node:assert/strict";
import test from "node:test";
import {
  MOTIVATION_CATALOG,
  analyzeLiquidation,
  evaluateLiquidation,
} from "../src/index.ts";
import type { W2Input } from "../src/domain.ts";
import { alignedInput, consistentNarrativeChecker } from "./fixtures.ts";

test("divergenza tra perizia e fattura usa importo conservativo e controllo umano", () => {
  const input = alignedInput();
  input.invoice.lines[0]!.total = { minorUnits: 120_00, currency: "EUR" };
  input.invoice.total = { minorUnits: 120_00, currency: "EUR" };

  const result = analyzeLiquidation(input, consistentNarrativeChecker());

  assert.equal(result.proposedDecision, "LIQUIDATE");
  assert.deepEqual(result.payableAmount, { minorUnits: 90_00, currency: "EUR" });
  assert.equal(result.requiresHumanReview, true);
  assert.equal(result.issues[0]?.code, "LINE_DIVERGENCE");
});

test("massimale e franchigia impediscono importi oltre i vincoli di polizza", () => {
  const input = alignedInput();
  input.appraisal.lines[0]!.total = { minorUnits: 1_000_00, currency: "EUR" };
  input.appraisal.total = { minorUnits: 1_000_00, currency: "EUR" };
  input.invoice.lines[0]!.total = { minorUnits: 1_000_00, currency: "EUR" };
  input.invoice.total = { minorUnits: 1_000_00, currency: "EUR" };
  input.policy.limit = { minorUnits: 300_00, currency: "EUR" };
  input.policy.deductible = { minorUnits: 50_00, currency: "EUR" };

  const result = analyzeLiquidation(input, consistentNarrativeChecker());

  assert.deepEqual(result.payableAmount, { minorUnits: 250_00, currency: "EUR" });
  assert.equal(result.proposedDecision, "LIQUIDATE");
});

test("input incoerente produce proposta fail-closed senza importo", () => {
  const input = alignedInput();
  input.invoice.total = { minorUnits: 99_00, currency: "EUR" };

  const result = analyzeLiquidation(input, consistentNarrativeChecker());

  assert.equal(result.proposedDecision, "DO_NOT_LIQUIDATE");
  assert.equal(result.payableAmount, null);
  assert.equal(result.amountStatus, "NOT_COMPUTABLE");
  assert.equal(result.requiresHumanReview, true);
  assert.equal(result.issues[0]?.code, "TOTAL_MISMATCH");
});

test("entità mancante a runtime produce errore controllato", () => {
  const input = { ...alignedInput(), invoice: undefined } as unknown as W2Input;

  const result = analyzeLiquidation(input, consistentNarrativeChecker());

  assert.equal(result.proposedDecision, "DO_NOT_LIQUIDATE");
  assert.equal(result.payableAmount, null);
  assert.equal(result.amountStatus, "NOT_COMPUTABLE");
  assert.equal(result.requiresHumanReview, true);
  assert.equal(result.issues[0]?.code, "MISSING_ENTITY");
});

test("copertura assente produce importo zero senza calcolo economico", () => {
  const input = alignedInput();
  input.policy.covered = false;

  const result = analyzeLiquidation(input, consistentNarrativeChecker());

  assert.equal(result.proposedDecision, "DO_NOT_LIQUIDATE");
  assert.deepEqual(result.payableAmount, { minorUnits: 0, currency: "EUR" });
  assert.equal(result.amountStatus, "ZERO");
  assert.equal(result.requiresHumanReview, false);
  assert.equal(result.issues[0]?.code, "NOT_COVERED");
});

test("riordinare le righe non modifica l'analisi", () => {
  const first = alignedInput();
  const second = alignedInput();
  const extraAppraisalLine = {
    itemCode: "HEADLIGHT",
    description: "Faro anteriore",
    quantity: 1,
    total: { minorUnits: 50_00, currency: "EUR" },
    sourceRef: "appraisal://APP-001#line-2",
  };
  const extraInvoiceLine = {
    ...extraAppraisalLine,
    sourceRef: "invoice://INV-001#line-2",
  };
  first.appraisal.lines.push(extraAppraisalLine);
  first.invoice.lines.push(extraInvoiceLine);
  first.appraisal.total = { minorUnits: 150_00, currency: "EUR" };
  first.invoice.total = { minorUnits: 150_00, currency: "EUR" };
  second.appraisal.lines.push(extraAppraisalLine);
  second.invoice.lines.push(extraInvoiceLine);
  second.appraisal.lines.reverse();
  second.invoice.lines.reverse();
  second.appraisal.total = { minorUnits: 150_00, currency: "EUR" };
  second.invoice.total = { minorUnits: 150_00, currency: "EUR" };

  assert.deepEqual(
    analyzeLiquidation(first, consistentNarrativeChecker()),
    analyzeLiquidation(second, consistentNarrativeChecker()),
  );
});

test("mock LLM è riproducibile e ha 100 motivazioni distinte", () => {
  const first = evaluateLiquidation(alignedInput(), consistentNarrativeChecker(), "replay-seed");
  const second = evaluateLiquidation(alignedInput(), consistentNarrativeChecker(), "replay-seed");

  assert.equal(MOTIVATION_CATALOG.length, 100);
  assert.equal(new Set(MOTIVATION_CATALOG).size, 100);
  assert.deepEqual(first.motivation, second.motivation);
  assert.match(first.motivation.response, /appraisal:\/\/APP-001/);
  assert.match(first.motivation.response, /invoice:\/\/INV-001/);
  assert.equal("systemPrompt" in first.motivation, false);
  assert.doesNotMatch(JSON.stringify(first), /systemPrompt/);
});
