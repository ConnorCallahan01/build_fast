import { dispatch } from "./commands.js";
import { parseArgs } from "./util.js";

export async function main(argv) {
  const { command, flags } = parseArgs(argv);
  await dispatch(command, flags);
}

