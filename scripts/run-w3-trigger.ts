import { fileURLToPath } from "node:url";
import { runW2MockBundle } from "../src/file-runner.ts";

const scenarioDirectory = fileURLToPath(
  new URL("../data/synthetic/scenarios/w3-trigger/", import.meta.url),
);
const outputPath = process.argv[2] ?? "tmp/w3-trigger-output.json";
const result = runW2MockBundle(scenarioDirectory, outputPath, { seed: "w3-trigger" });

console.log(JSON.stringify({
  status: result.status,
  outputPath,
  ...(result.status === "COMPLETED"
    ? {
        routing: result.routing,
        proposedDecision: result.proposal.proposedDecision,
        payableAmount: result.proposal.payableAmount,
      }
    : { error: result.error }),
}));

if (result.status === "FAILED") {
  process.exitCode = 1;
}
