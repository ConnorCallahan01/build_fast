import readline from "node:readline";

const colorEnabled = Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined && process.env.BUILD_FAST_COLOR !== "0";

const codes = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  inverse: "\x1b[7m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  orange: "\x1b[38;5;208m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  magenta: "\x1b[35m"
};

function color(code, value) {
  return colorEnabled ? `${code}${value}${codes.reset}` : value;
}

export function banner(title = "build_fast", subtitle = "") {
  printBanner({ title, subtitle });
}

export async function animatedBanner(title = "build_fast", subtitle = "", options = {}) {
  const output = options.output || process.stdout;
  const shouldAnimate = Boolean(output.isTTY) && colorEnabled && process.env.BUILD_FAST_ANIMATION !== "0";
  if (!shouldAnimate) {
    printBanner({ title, subtitle });
    return;
  }

  const frames = [
    "build_fast .",
    "build_fast ..",
    "build_fast ...",
    "build_fast >>>"
  ];
  output.write("\n");
  for (const frame of frames) {
    readline.clearLine(output, 0);
    readline.cursorTo(output, 0);
    output.write(color(codes.orange + codes.bold, frame));
    await wait(55);
  }
  readline.clearLine(output, 0);
  readline.cursorTo(output, 0);
  printBanner({ title, subtitle, leadingNewline: false });
}

function printBanner({ title = "build_fast", subtitle = "", leadingNewline = true } = {}) {
  const wordmark = [
    " ____  _   _ ___ _     ____      _____  _    ____ _____",
    "| __ )| | | |_ _| |   |  _ \\    |  ___|/ \\  / ___|_   _|",
    "|  _ \\| | | || || |   | | | |   | |_  / _ \\ \\___ \\ | |",
    "| |_) | |_| || || |___| |_| |   |  _|/ ___ \\ ___) || |",
    "|____/ \\___/|___|_____|____/    |_| /_/   \\_\\____/ |_|"
  ];
  if (leadingNewline) console.log("");
  console.log(color(codes.orange, "==== ==== ==== ==== ==== ==== ==== ====>"));
  for (const line of wordmark) console.log(color(codes.orange + codes.bold, line));
  console.log(color(codes.orange + codes.bold, "-------------> plan / swarm / verify / ship"));
  if (title && title !== "build_fast") console.log(color(codes.bold, title));
  if (subtitle) console.log(color(codes.dim, subtitle));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function heading(label, detail = "") {
  const text = detail ? `${label} ${color(codes.dim, detail)}` : label;
  console.log(`\n${color(codes.orange + codes.bold, text)}`);
}

export function section(label) {
  console.log(`\n${color(codes.orange + codes.bold, label)}`);
  console.log(color(codes.orange, "-".repeat(Math.min(64, Math.max(24, String(label).length + 12)))));
}

export function step(label) {
  console.log(color(codes.orange, `> ${label}`));
}

export function info(label, detail = "") {
  console.log(detail ? `${color(codes.orange, "INFO")} ${label}: ${detail}` : `${color(codes.orange, "INFO")} ${label}`);
}

export function success(label, detail = "") {
  console.log(detail ? `${color(codes.green, "OK ")} ${label}: ${detail}` : `${color(codes.green, "OK ")} ${label}`);
}

export function warn(label, detail = "") {
  console.log(detail ? `${color(codes.yellow, "WARN")} ${label}: ${detail}` : `${color(codes.yellow, "WARN")} ${label}`);
}

export function failure(label, detail = "") {
  console.log(detail ? `${color(codes.red, "ERR")} ${label}: ${detail}` : `${color(codes.red, "ERR")} ${label}`);
}

export function check(ok, label, detail = "") {
  if (ok) success(label, detail);
  else failure(label, detail);
}

export function keyValue(label, value = "") {
  console.log(`${color(codes.orange, `${label}:`)} ${value}`);
}

export function line(value = "") {
  console.log(color(codes.orange, value));
}

export function muted(value) {
  return color(codes.dim, value);
}

export function highlight(value) {
  return color(codes.orange + codes.bold, value);
}

export async function select(label, choices, defaultValue = "", options = {}) {
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  const values = choices.map((choice) => typeof choice === "string" ? { value: choice, label: choice, detail: "" } : choice);
  const defaultIndex = Math.max(0, values.findIndex((choice) => choice.value === defaultValue));
  if (!input.isTTY || !output.isTTY || values.length === 0) {
    return values[defaultIndex]?.value || defaultValue;
  }

  const previousRawMode = input.isRaw;
  input.setRawMode(true);
  input.resume();

  let index = defaultIndex === -1 ? 0 : defaultIndex;
  let renderedLines = 0;

  function render() {
    if (renderedLines) {
      readline.moveCursor(output, 0, -renderedLines);
      readline.clearScreenDown(output);
    }
    const lines = [`${color(codes.bold, label)}`];
    for (let i = 0; i < values.length; i += 1) {
      const choice = values[i];
      const marker = i === index ? ">" : " ";
      const text = `${marker} ${choice.label}${choice.detail ? color(codes.dim, ` - ${choice.detail}`) : ""}`;
      lines.push(i === index ? highlight(text) : text);
    }
    output.write(`${lines.join("\n")}\n`);
    renderedLines = lines.length;
  }

  return await new Promise((resolve) => {
    let finished = false;

    function done(value) {
      if (finished) return;
      finished = true;
      input.off("data", onData);
      input.setRawMode(previousRawMode);
      resolve(value);
    }

    function onData(buffer) {
      const sequence = buffer.toString("utf8");
      if (sequence.includes("\u0003")) {
        output.write("\n");
        process.exit(130);
      }
      if (sequence.includes("\r") || sequence.includes("\n")) {
        done(values[index].value);
      } else if (sequence.includes("\u001b[A")) {
        index = (index - 1 + values.length) % values.length;
        render();
      } else if (sequence.includes("\u001b[B")) {
        index = (index + 1) % values.length;
        render();
      } else if (sequence === "\u001b") {
        done(values[defaultIndex]?.value || values[0].value);
      }
    }

    input.on("data", onData);
    render();
  });
}

export async function timed(label, fn) {
  step(label);
  const started = performance.now();
  const result = await fn();
  success(label, duration(started));
  return result;
}

export function duration(started) {
  const ms = Math.max(0, Math.round(performance.now() - started));
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function wrapBlock(text, options = {}) {
  const width = Math.max(40, Number(options.width || process.stdout.columns || 100));
  const indent = options.indent || "  ";
  const maxLines = Number(options.maxLines || 4);
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return "";

  const lines = [];
  let line = indent;
  for (const word of words) {
    if ((line + word).length > width && line.trim()) {
      lines.push(line.trimEnd());
      line = indent;
      if (lines.length >= maxLines) break;
    }
    line += `${word} `;
  }
  if (lines.length < maxLines && line.trim()) lines.push(line.trimEnd());
  if (words.join(" ").length > lines.map((item) => item.trim()).join(" ").length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/\s*$/, "")} ...`;
  }
  return lines.join("\n");
}
