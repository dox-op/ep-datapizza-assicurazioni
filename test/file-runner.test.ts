import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  runW2MockBundle,
  type W2ExecutionResult,
} from "../src/file-runner.ts";

const mockDirectory = fileURLToPath(new URL("../data/synthetic/external-systems/", import.meta.url));
const w3TriggerDirectory = fileURLToPath(new URL("../data/synthetic/scenarios/w3-trigger/", import.meta.url));
const narrativeContradictionDirectory = fileURLToPath(new URL("../data/synthetic/scenarios/narrative-contradiction/", import.meta.url));

function outputPathFor(testName: string): string {
  return join(mkdtempSync(join(tmpdir(), "w2-mock-run-")), `${testName}.json`);
}

function readPersisted(outputPath: string): W2ExecutionResult {
  return JSON.parse(readFileSync(outputPath, "utf8")) as W2ExecutionResult;
}

test("mock bundle ingestion reads external-system files and produces a proposal", () => {
  const outputPath = outputPathFor("success");
  const result = runW2MockBundle(mockDirectory, outputPath);
  const persisted = readPersisted(outputPath);

  assert.equal(result.status, "COMPLETED");
  assert.equal(result.proposal?.proposedDecision, "LIQUIDATE");
  assert.deepEqual(result.proposal?.payableAmount, { minorUnits: 9_000, currency: "EUR" });
  assert.deepEqual(persisted, result);
  assert.deepEqual(result.sources, {
    practice: "claim://CLM-001",
    appraisal: "appraisal://APP-001",
    invoice: "invoice://INV-001",
    policy: "policy://POL-001",
  });
});

test("authentication failure is persisted as a non-retryable ingestion error", () => {
  const outputPath = outputPathFor("auth-failure");
  const result = runW2MockBundle(mockDirectory, outputPath, {
    authToken: "invalid-synthetic-token",
  });

  assert.equal(result.status, "FAILED");
  assert.deepEqual(result.error, {
    code: "AUTHENTICATION_FAILED",
    message: "Synthetic external-system authentication failed.",
    retryable: false,
    stage: "AUTHENTICATION",
  });
  assert.equal("proposal" in result, false);
});

test("missing source file is persisted as a non-retryable ingestion error", () => {
  const outputPath = outputPathFor("missing-appraisal");
  const result = runW2MockBundle(mockDirectory, outputPath, {
    fault: "MISSING_APPRAISAL",
  });

  assert.equal(result.status, "FAILED");
  assert.equal(result.error?.code, "MISSING_SOURCE_FILE");
  assert.equal(result.error?.stage, "INGESTION");
  assert.equal(result.error?.retryable, false);
  assert.match(result.error?.message ?? "", /servizio-periti-appraisal-app-001\.json/);
});

test("invalid source JSON is persisted as a non-retryable ingestion error", () => {
  const directory = mkdtempSync(join(tmpdir(), "w2-invalid-source-"));
  const outputPath = join(directory, "invalid-json.json");
  const invoiceFileName = "archivio-documentale-invoice-inv-001.json";
  for (const fileName of [
    "gestionale-sinistri-practice-clm-001.json",
    "servizio-periti-appraisal-app-001.json",
    invoiceFileName,
    "sistema-polizze-policy-pol-001.json",
  ]) {
    copyFileSync(join(mockDirectory, fileName), join(directory, fileName));
  }
  writeFileSync(join(directory, invoiceFileName), "{invalid-json");

  const result = runW2MockBundle(directory, outputPath);

  assert.equal(result.status, "FAILED");
  assert.equal(result.error?.code, "INVALID_SOURCE_FILE");
  assert.equal(result.error?.stage, "INGESTION");
  assert.equal(result.error?.retryable, false);
});

test("invalid invoice fault reaches the core and fails closed", () => {
  const outputPath = outputPathFor("invalid-invoice");
  const result = runW2MockBundle(mockDirectory, outputPath, {
    fault: "INVALID_INVOICE",
  });

  assert.equal(result.status, "COMPLETED");
  assert.equal(result.proposal?.proposedDecision, "DO_NOT_LIQUIDATE");
  assert.equal(result.proposal?.amountStatus, "NOT_COMPUTABLE");
  assert.equal(result.proposal?.requiresHumanReview, true);
  assert.equal(result.proposal?.issues[0]?.code, "CLAIM_ID_MISMATCH");
});

test("W3 scenario routes an invoice appraisal imbalance to W3", () => {
  const outputPath = outputPathFor("w3-trigger");
  const result = runW2MockBundle(w3TriggerDirectory, outputPath);

  assert.equal(result.status, "COMPLETED");
  assert.equal(result.routing.next, "W3");
  assert.equal(result.routing.referral?.code, "INVOICE_ABOVE_APPRAISAL_THRESHOLD");
  assert.equal(result.routing.referral?.thresholdPercent, 30);
  assert.equal(result.routing.referral?.variancePercent, 50);
  assert.equal(result.proposal?.proposedDecision, "DO_NOT_LIQUIDATE");
  assert.deepEqual(result.proposal?.payableAmount, { minorUnits: 9_000, currency: "EUR" });
  assert.equal(result.proposal?.issues.at(-1)?.code, "W3_REFERRAL");
});

test("narrative contradiction scenario blocks liquidation and routes to human review", () => {
  const outputPath = outputPathFor("narrative-contradiction");
  const result = runW2MockBundle(narrativeContradictionDirectory, outputPath);

  assert.equal(result.status, "COMPLETED");
  assert.equal(result.routing.next, "HUMAN_REVIEW");
  assert.equal(result.routing.referral, null);
  assert.equal(result.proposal?.narrativeCheck?.response.outcome, "CONTRADICTS");
  assert.equal("outcome" in (result.proposal?.narrativeCheck ?? {}), false);
  assert.deepEqual(result.proposal?.narrativeCheck?.response, { outcome: "CONTRADICTS" });
  assert.equal(result.proposal?.proposedDecision, "DO_NOT_LIQUIDATE");
  assert.equal(result.proposal?.payableAmount, null);
  assert.equal(result.proposal?.amountStatus, "NOT_COMPUTABLE");
});
