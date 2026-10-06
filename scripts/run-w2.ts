import { runW2MockBundle, type MockFault } from "../src/file-runner.ts";

const [mockDirectory, outputPath, ...flags] = process.argv.slice(2);

/** Reads one optional CLI flag value using its exact prefix. */
function readFlag(name: string): string | undefined {
  return flags.find((flag) => flag.startsWith(`${name}=`))?.slice(name.length + 1);
}

/** Checks whether a CLI value is one of the supported synthetic fault injections. */
function isMockFault(value: string | undefined): value is MockFault {
  return ["AUTHENTICATION_FAILURE", "MISSING_APPRAISAL", "INVALID_INVOICE"].includes(value ?? "");
}

if (!mockDirectory || !outputPath) {
  console.error("Usage: npm run run:synthetic -- <mock-directory> <output.json> [--auth-token=<token>] [--fault=<fault>]");
  process.exitCode = 1;
} else {
  const faultValue = readFlag("--fault");
  if (faultValue && !isMockFault(faultValue)) {
    console.error("Unsupported fault. Use AUTHENTICATION_FAILURE, MISSING_APPRAISAL, or INVALID_INVOICE.");
    process.exitCode = 1;
  } else {
    const result = runW2MockBundle(mockDirectory, outputPath, {
      authToken: readFlag("--auth-token"),
      fault: faultValue,
    });
    console.log(JSON.stringify(
      result.status === "COMPLETED"
        ? {
            status: result.status,
            claimId: result.proposal.claimId,
            proposedDecision: result.proposal.proposedDecision,
            payableAmount: result.proposal.payableAmount,
            outputPath,
          }
        : { status: result.status, error: result.error, outputPath },
    ));
    if (result.status === "FAILED") {
      process.exitCode = 1;
    }
  }
}
