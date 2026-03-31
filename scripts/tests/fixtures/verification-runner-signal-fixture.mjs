import { runVerification } from "../../lib/verification-runner.mjs";

await runVerification({
  bootstrap: false,
  steps: [
    {
      label: "stubborn child",
      command: process.execPath,
      args: [
        "-e",
        "import { writeFileSync } from 'node:fs'; writeFileSync(process.env.VERIFICATION_RUNNER_CHILD_PID_FILE, String(process.pid)); process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);",
      ],
    },
  ],
});
