import { fileURLToPath } from "node:url";
import { runW2MockBundle } from "../src/file-runner.ts";

const scenarioDirectory = fileURLToPath(
  new URL("../data/synthetic/scenarios/narrative-contradiction/", import.meta.url),
);
const outputPath = process.argv[2] ?? "tmp/narrative-contradiction-output.json";
const result = runW2MockBundle(scenarioDirectory, outputPath, { seed: "narrative-contradiction" });

console.log(JSON.stringify({
  status: result.status,
  outputPath,
  ...(result.status === "COMPLETED"
    ? {
        routing: result.routing,
        narrativeResponse: result.proposal.narrativeCheck?.response,
        proposedDecision: result.proposal.proposedDecision,
        payableAmount: result.proposal.payableAmount,
      }
    : { error: result.error }),
}));

if (result.status === "FAILED") {
  process.exitCode = 1;
}
