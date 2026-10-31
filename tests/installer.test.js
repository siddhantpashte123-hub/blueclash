import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createApp } from "../server/app.js";

const installer = fs.readFileSync(
  new URL("../install.sh", import.meta.url),
  "utf8",
);

// Exercise the actual installer functions without running its interactive menu,
// touching systemd, or writing to the real /opt and /var/lib directories.
function shellFunction(name) {
  const match = installer.match(
    new RegExp(`^${name}\\(\\) \\{[\\s\\S]*?^\\}`, "m"),
  );
  assert.ok(match, `Could not find installer function ${name}`);
  return match[0];
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => (stdout += data));
    child.stderr.on("data", (data) => (stderr += data));
    child.on("error", reject);
    child.on("close", (code, signal) =>
      resolve({ code, signal, stdout, stderr }),
    );
  });
}

async function listen(server, host = "127.0.0.1") {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, resolve);
  });
  return server.address().port;
}

async function close(server) {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

const healthFunction = shellFunction("check_blueclash_health");
const portFunction = shellFunction("blueclash_port_available");
const prepareFunction = shellFunction("prepare_blueclash_port");

async function checkHealth(url, env) {
  return run(
    "bash",
    ["-c", `${healthFunction}\ncheck_blueclash_health "$1" 0`, "--", url],
    {
      env,
    },
  );
}

test("local installer health check bypasses HTTP proxies and verifies BlueClash's response", async (t) => {
  let proxyRequests = 0;
  let appRequests = 0;
  const app = http.createServer((req, res) => {
    appRequests++;
    if (req.url === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
    } else if (req.url === "/wrong-app") {
      res.writeHead(200);
      res.end("another service");
    } else {
      res.writeHead(404);
      res.end("not found");
    }
  });
  const proxy = http.createServer((_req, res) => {
    proxyRequests++;
    res.writeHead(404);
    res.end("proxy returned 404");
  });
  const appPort = await listen(app);
  const proxyPort = await listen(proxy);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "blueclash-curl-"));
  fs.writeFileSync(
    path.join(home, ".curlrc"),
    `proxy = "http://127.0.0.1:${proxyPort}"\n`,
  );
  t.after(async () => {
    await close(app);
    await close(proxy);
    fs.rmSync(home, { recursive: true, force: true });
  });
  const env = {
    ...process.env,
    HOME: home,
    http_proxy: `http://127.0.0.1:${proxyPort}`,
    HTTP_PROXY: `http://127.0.0.1:${proxyPort}`,
    all_proxy: `http://127.0.0.1:${proxyPort}`,
    ALL_PROXY: `http://127.0.0.1:${proxyPort}`,
    no_proxy: "",
    NO_PROXY: "",
  };
  const base = `http://127.0.0.1:${appPort}`;

  // Reproduce the old curl command's failure when a local proxy is configured.
  const oldCheck = await run(
    "curl",
    ["--silent", "--show-error", "--fail", `${base}/api/health`],
    { env },
  );
  assert.equal(oldCheck.code, 22);
  assert.equal(proxyRequests, 1);
  assert.equal(appRequests, 0);

  const direct = await checkHealth(`${base}/api/health`, env);
  assert.equal(direct.code, 0, direct.stderr);
  assert.equal(proxyRequests, 1, "health check must never contact the proxy");
  assert.equal(appRequests, 1);
  assert.equal((await checkHealth(`${base}/wrong-app`, env)).code, 1);
  assert.equal((await checkHealth(`${base}/missing`, env)).code, 1);
  assert.equal(proxyRequests, 1);
});

test("the health check recognizes a real BlueClash server with isolated data", async (t) => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "blueclash-installer-app-"),
  );
  const app = createApp({ dataDir: dir });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  t.after(async () => {
    await close(server);
    app.locals.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}/api/health`;
  const result = await checkHealth(url, process.env);
  assert.equal(result.code, 0, result.stderr);
});

test("port preflight detects a conflict without disturbing the process using the port", async (t) => {
  const listener = net.createServer((socket) => socket.end("still running"));
  const port = await listen(listener, "0.0.0.0");
  t.after(() => (listener.listening ? close(listener) : undefined));
  const check = () =>
    run("bash", [
      "-c",
      `${portFunction}\nblueclash_port_available "$1" "$2"`,
      "--",
      process.execPath,
      String(port),
    ]);

  const occupied = await check();
  assert.equal(occupied.code, 1);
  assert.match(occupied.stderr, /EADDRINUSE/);
  const response = await new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1");
    let data = "";
    socket.on("data", (chunk) => (data += chunk));
    socket.on("end", () => resolve(data));
    socket.on("error", reject);
  });
  assert.equal(response, "still running");
  await close(listener);
  const available = await check();
  assert.equal(available.code, 0, available.stderr);
});

test("a port conflict restarts only the previously active BlueClash service", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blueclash-systemctl-"));
  const log = path.join(dir, "calls.log");
  fs.writeFileSync(
    path.join(dir, "systemctl"),
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$MOCK_LOG"
case "$1" in
  is-active) [[ "$MOCK_ACTIVE" == 1 ]] ;;
  stop) [[ "$MOCK_STOP_OK" == 1 ]] ;;
  start) [[ "$MOCK_START_OK" == 1 ]] ;;
  *) exit 1 ;;
esac
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(path.join(dir, "ss"), "#!/usr/bin/env bash\nexit 0\n", {
    mode: 0o755,
  });
  const listener = net.createServer();
  const port = await listen(listener, "0.0.0.0");
  t.after(async () => {
    if (listener.listening) await close(listener);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const script = `warn() { printf '%s\\n' "$*" >&2; }\n${portFunction}\n${prepareFunction}\nprepare_blueclash_port "$1" "$2"`;
  const runPreparation = async (active, stopOk = 1) => {
    fs.writeFileSync(log, "");
    const result = await run(
      "bash",
      ["-c", script, "--", process.execPath, String(port)],
      {
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          MOCK_LOG: log,
          MOCK_ACTIVE: String(active),
          MOCK_STOP_OK: String(stopOk),
          MOCK_START_OK: "1",
        },
      },
    );
    return {
      ...result,
      calls: fs.readFileSync(log, "utf8").trim().split("\n").filter(Boolean),
    };
  };

  const activeConflict = await runPreparation(1);
  assert.equal(activeConflict.code, 1);
  assert.deepEqual(activeConflict.calls, [
    "is-active --quiet blueclash.service",
    "stop blueclash.service",
    "start blueclash.service",
  ]);
  assert.match(
    activeConflict.stderr,
    /Another process may already be listening/,
  );

  const freshConflict = await runPreparation(0);
  assert.equal(freshConflict.code, 1);
  assert.deepEqual(freshConflict.calls, [
    "is-active --quiet blueclash.service",
    "stop blueclash.service",
  ]);

  const stopFailure = await runPreparation(1, 0);
  assert.equal(stopFailure.code, 1);
  assert.match(stopFailure.stderr, /previous installation was not replaced/);
  assert.deepEqual(stopFailure.calls, [
    "is-active --quiet blueclash.service",
    "stop blueclash.service",
  ]);

  await close(listener);
  const available = await runPreparation(1);
  assert.equal(available.code, 0, available.stderr);
  assert.deepEqual(available.calls, [
    "is-active --quiet blueclash.service",
    "stop blueclash.service",
  ]);
});

test("a blocked port aborts before replacing an existing installation or its data", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blueclash-install-flow-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const appDir = path.join(dir, "app");
  const nodeDir = path.join(dir, "node");
  const dataDir = path.join(dir, "data");
  const service = path.join(dir, "blueclash.service");
  const manager = path.join(dir, "blueclash-manager");
  const log = path.join(dir, "systemctl.log");
  fs.mkdirSync(appDir, { recursive: true });
  fs.mkdirSync(`${appDir}.previous`, { recursive: true });
  fs.mkdirSync(path.join(nodeDir, "bin"), { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, "old-app"), "keep existing app");
  fs.writeFileSync(
    path.join(`${appDir}.previous`, "old-backup"),
    "keep old backup",
  );
  fs.writeFileSync(
    path.join(dataDir, "blueclash.sqlite"),
    "keep existing database",
  );
  fs.writeFileSync(service, "keep existing service configuration");
  fs.symlinkSync(process.execPath, path.join(nodeDir, "bin", "node"));

  const from = installer.indexOf("has_tty() {");
  const to = installer.indexOf("if [[ \"${1:-}\" == '--status' ]]");
  assert.ok(from >= 0 && to > from);
  const functions = installer.slice(from, to);
  const script = `set -Eeuo pipefail
APP_DIR="$1"; NODE_DIR="$2"; DATA_DIR="$3"; SERVICE_FILE="$4"; MANAGER="$5"; MOCK_LOG="$6"
WORK_DIR=""; REPO_URL="no-network"; REPO_REF=main; NODE_VERSION="$("$NODE_DIR/bin/node" -p 'process.version')"
say() { printf '%s\\n' "$*"; }
warn() { printf '%s\\n' "$*" >&2; }
trap 'if [[ "$WORK_DIR" == /tmp/blueclash-install.* ]]; then rm -rf -- "$WORK_DIR"; fi' EXIT
${functions}
check_system() { :; }
install_dependencies() { :; }
getent() { return 0; }
id() { return 0; }
chown() { :; }
git() { local dest="\${!#}"; mkdir -p "$dest"; }
npm() { :; }
ss() { :; }
blueclash_port_available() { printf 'Port check failed: EADDRINUSE\\n' >&2; return 1; }
systemctl() { printf '%s\\n' "$*" >> "$MOCK_LOG"; return 0; }
install_blueclash
`;
  const result = await run("bash", [
    "-c",
    script,
    "--",
    appDir,
    nodeDir,
    dataDir,
    service,
    manager,
    log,
  ]);
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stderr, /EADDRINUSE/);
  assert.equal(
    fs.readFileSync(path.join(appDir, "old-app"), "utf8"),
    "keep existing app",
  );
  assert.equal(
    fs.readFileSync(path.join(`${appDir}.previous`, "old-backup"), "utf8"),
    "keep old backup",
  );
  assert.equal(
    fs.readFileSync(path.join(dataDir, "blueclash.sqlite"), "utf8"),
    "keep existing database",
  );
  assert.equal(
    fs.readFileSync(service, "utf8"),
    "keep existing service configuration",
  );
  assert.deepEqual(fs.readFileSync(log, "utf8").trim().split("\n"), [
    "is-active --quiet blueclash.service",
    "stop blueclash.service",
    "start blueclash.service",
  ]);
});
