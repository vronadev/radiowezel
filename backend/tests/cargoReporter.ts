import type { Reporter } from "vitest/node";
import type { TestCase } from "vitest/node";

export default class CargoReporter implements Reporter {
  private passed = 0;
  private failed = 0;
  private skipped = 0;

  onInit(): void {
    console.log("running tests\n");
  }

  onUserConsoleLog(): void {
    // Keep npm run test output as a compact summary table.
  }

  onTestCaseResult(testCase: TestCase): void {
    const result = testCase.result();
    const name = testCase.fullName.replace(/\s*>\s*/g, "::");
    if (result.state === "passed") {
      this.passed += 1;
      console.log(`test ${name} ... ok`);
      return;
    }
    if (result.state === "skipped") {
      this.skipped += 1;
      console.log(`test ${name} ... ignored`);
      return;
    }
    if (result.state === "failed") {
      this.failed += 1;
      console.log(`test ${name} ... FAILED`);
      for (const error of result.errors) {
        if (error.message) {
          console.log(`  ${error.message.split("\n")[0]}`);
        }
      }
    }
  }

  onTestRunEnd(): void {
    const status = this.failed === 0 ? "ok" : "FAILED";
    console.log("");
    console.log(
      `test result: ${status}. ${this.passed} passed; ${this.failed} failed; ${this.skipped} ignored; 0 measured`,
    );
  }
}
