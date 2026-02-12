const { spawn } = require("node:child_process");
const electronPath = require("electron");

const env = {
  ...process.env,
  NODE_ENV: "development"
};

const isWsl = Boolean(env.WSL_DISTRO_NAME || env.WSL_INTEROP || env.WSLENV);

if (isWsl && !env.ELECTRON_DISABLE_GPU) {
  env.ELECTRON_DISABLE_GPU = "1";
}

const child = spawn(electronPath, ["."], {
  stdio: "inherit",
  env
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
