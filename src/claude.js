import { spawn } from "node:child_process";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { ensureDir, writeJson } from "./util.js";

export function permissionModeFor(config, autopilot) {
  return config.claude.permissionMode[autopilot] || config.claude.permissionMode.junior_mode || "acceptEdits";
}

export function maxTurnsFor(config, autopilot) {
  return Number(config.claude.maxTurns[autopilot] || config.claude.maxTurns.junior_mode || 30);
}

export async function writeManagedClaudeSettings(runDir, autopilot) {
  const settings = {
    permissions: {
      deny: [
        "Bash(git push *)",
        "Bash(git reset --hard *)",
        "Bash(rm -rf / *)",
        "Bash(rm -rf ~ *)",
        "Read(.env)",
        "Read(**/.env)"
      ]
    },
    hooks: {
      Stop: [
        {
          hooks: [
            {
              type: "prompt",
              timeout: 30,
              continueOnBlock: true,
              prompt:
                "You are a build_fast Stop hook. Decide whether Claude should be allowed to stop. Require that the assigned task acceptance criteria are addressed, requested feedback loops were run or explicitly explained, and a structured final result was produced. Autopilot: " +
                autopilot +
                ". Context: $ARGUMENTS Respond only with JSON: {\"ok\": true} or {\"ok\": false, \"reason\": \"what remains\"}."
            }
          ]
        }
      ]
    }
  };
  const filePath = path.join(runDir, "claude-settings.json");
  await writeJson(filePath, settings);
  return filePath;
}

export async function runClaude({ config, prompt, projectDir, runDir, autopilot, permissionProfile, onStart }) {
  await ensureDir(runDir);

  const args = [
    "-p",
    prompt,
    "--output-format",
    config.claude.outputFormat || "json",
    "--max-turns",
    String(maxTurnsFor(config, autopilot)),
    "--name",
    `build_fast-${Date.now()}`
  ];

  if (permissionProfile === "managed") {
    const settingsPath = await writeManagedClaudeSettings(runDir, autopilot);
    args.push("--settings", settingsPath);
  }

  if (permissionProfile !== "inherit") {
    args.push("--permission-mode", permissionModeFor(config, autopilot));
  }

  const stdoutPath = path.join(runDir, "stdout.log");
  const stderrPath = path.join(runDir, "stderr.log");
  const resultPath = path.join(runDir, "result.json");

  return new Promise((resolve) => {
    const child = spawn(config.claude.command || "claude", args, {
      cwd: projectDir,
      env: { ...process.env, BUILD_FAST_RUN_DIR: runDir },
      stdio: ["ignore", "pipe", "pipe"]
    });

    if (onStart) {
      Promise.resolve(onStart({ pid: child.pid })).catch(() => {});
    }

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", async (code, signal) => {
      await writeFile(stdoutPath, stdout);
      await writeFile(stderrPath, stderr);

      const parsed = parseClaudeOutput(stdout);
      await writeJson(resultPath, {
        code,
        signal,
        parsed,
        stdoutPath,
        stderrPath
      });

      resolve({
        code,
        signal,
        parsed,
        stdout,
        stderr
      });
    });

    child.on("error", async (error) => {
      await writeFile(stderrPath, error.stack || error.message);
      resolve({
        code: 1,
        signal: null,
        parsed: null,
        stdout: "",
        stderr: error.stack || error.message
      });
    });
  });
}

function parseClaudeOutput(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    const json = JSON.parse(trimmed);
    if (typeof json.result === "string") {
      return parseJsonFromText(json.result) || json;
    }
    return json.structured_output || json;
  } catch {
    return parseJsonFromText(trimmed) || { status: "completed", summary: trimmed };
  }
}

function parseJsonFromText(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return null;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}
