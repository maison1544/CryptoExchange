import { spawn } from "node:child_process";
import path from "node:path";

const repoRoot = process.cwd();
const appPath = path.join(repoRoot, "apps", "user");

const instances = [
  { name: "user", port: "3000", distDir: ".next-user" },
  { name: "admin", port: "3001", distDir: ".next-admin" },
  { name: "partner", port: "3002", distDir: ".next-partner" },
];

const children = instances.map(({ name, port, distDir }) => {
  const child = spawn(`pnpm exec next dev -p ${port}`, {
    cwd: appPath,
    env: {
      ...process.env,
      NEXT_PUBLIC_APP_INSTANCE: name,
      NEXT_DEV_DIST_DIR: distDir,
    },
    shell: true,
    stdio: ["inherit", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[${name}:${port}] ${chunk}`);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[${name}:${port}] ${chunk}`);
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      process.exitCode = code;
    }
  });

  child.on("error", (error) => {
    console.error(`[${name}:${port}]`, error);
    process.exitCode = 1;
  });

  return child;
});

const keepAlive = setInterval(() => {}, 1000);

function shutdown() {
  clearInterval(keepAlive);
  children.forEach((child) => {
    if (!child.killed) {
      child.kill("SIGINT");
    }
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
