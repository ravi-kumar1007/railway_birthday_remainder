/**
 * Prints a bcrypt hash for ADMIN_PASSWORD_HASH.
 *   npm run hash-password            (prompts, input hidden)
 *   echo 'secret' | npm run hash-password --silent
 * The password is never accepted as an argument, so it stays out of shell history.
 */
import bcrypt from "bcryptjs";
import { createInterface } from "node:readline";

const MIN_LENGTH = 10;
const COST = 12;

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    // Echo the prompt, swallow the typed characters
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => {
      if (!muted) process.stdout.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

async function main() {
  let password: string;
  if (process.stdin.isTTY) {
    password = await promptHidden("Admin password: ");
    const confirm = await promptHidden("Repeat password: ");
    if (password !== confirm) {
      console.error("Passwords do not match.");
      process.exit(1);
    }
  } else {
    password = await readStdin();
  }

  if (password.length < MIN_LENGTH) {
    console.error(`Use at least ${MIN_LENGTH} characters.`);
    process.exit(1);
  }
  if (Buffer.byteLength(password, "utf8") > 72) {
    console.error("bcrypt only uses the first 72 bytes; choose a shorter password.");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, COST);

  console.log("\nFor .env.local (Next.js needs every $ escaped as \\$):");
  console.log(`ADMIN_PASSWORD_HASH=${hash.replaceAll("$", "\\$")}`);
  console.log("\nFor the Netlify / Vercel environment variable UI (paste as-is, no backslashes):");
  console.log(hash);
}

main();
