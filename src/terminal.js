const colorEnabled = Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined && process.env.BUILD_FAST_COLOR !== "0";

const codes = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m"
};

function color(code, value) {
  return colorEnabled ? `${code}${value}${codes.reset}` : value;
}

export function heading(label, detail = "") {
  const text = detail ? `${label}: ${detail}` : label;
  console.log(`\n${color(codes.bold + codes.cyan, `== ${text} ==`)}`);
}

export function step(label) {
  console.log(color(codes.magenta, `-- ${label}`));
}

export function info(label, detail = "") {
  console.log(detail ? `${color(codes.cyan, "INFO")} ${label}: ${detail}` : `${color(codes.cyan, "INFO")} ${label}`);
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

export function muted(value) {
  return color(codes.dim, value);
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
