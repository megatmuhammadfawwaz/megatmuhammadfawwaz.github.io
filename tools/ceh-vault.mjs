#!/usr/bin/env node
/*
 * Build the encrypted CEH study vault for the portfolio.
 *
 *   node tools/ceh-vault.mjs                 (prompts for the passphrase)
 *   CEH_PASSPHRASE=... node tools/ceh-vault.mjs
 *   node tools/ceh-vault.mjs --src "D:/CEH/New folder/ceh_quiz"
 *
 * Reads the plain quiz (never committed), then writes into ./ceh/:
 *   vault.bin   gzip(questions JSON) encrypted with AES-256-GCM,
 *               key = PBKDF2-SHA256(passphrase, random salt, 600k iterations)
 *   app.js / style.css   copied from the quiz so updates can be re-synced
 *
 * vault.bin layout: "CEHV" | version (1 byte) | iterations (uint32 BE)
 *                   | salt (16) | iv (12) | ciphertext + GCM tag (16)
 * Re-run any time to change the passphrase or pick up quiz edits.
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, pbkdf2Sync, createCipheriv } from "node:crypto";
import { gzipSync } from "node:zlib";
import { createInterface } from "node:readline/promises";

const ITERATIONS = 600_000;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "ceh");

const srcFlag = process.argv.indexOf("--src");
const SRC = srcFlag > 0 ? process.argv[srcFlag + 1] : "D:/CEH/New folder/ceh_quiz";

async function passphrase() {
  if (process.env.CEH_PASSPHRASE) return process.env.CEH_PASSPHRASE;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const p = await rl.question("Vault passphrase (12+ chars): ");
  rl.close();
  return p;
}

const raw = readFileSync(join(SRC, "data", "data.js"), "utf8");
const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
const data = JSON.parse(json);
if (!Array.isArray(data.questions) || !data.questions.length) throw new Error("No questions found in data.js");

const pass = (await passphrase()).normalize("NFC");
if (pass.length < 12) throw new Error("Passphrase must be at least 12 characters");

const salt = randomBytes(16);
const iv = randomBytes(12);
const key = pbkdf2Sync(Buffer.from(pass, "utf8"), salt, ITERATIONS, 32, "sha256");
const cipher = createCipheriv("aes-256-gcm", key, iv);
const body = Buffer.concat([cipher.update(gzipSync(JSON.stringify(data), { level: 9 })), cipher.final(), cipher.getAuthTag()]);

const header = Buffer.alloc(9);
header.write("CEHV", 0, "ascii");
header.writeUInt8(1, 4);
header.writeUInt32BE(ITERATIONS, 5);

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "vault.bin"), Buffer.concat([header, salt, iv, body]));
copyFileSync(join(SRC, "app.js"), join(OUT, "app.js"));
copyFileSync(join(SRC, "style.css"), join(OUT, "style.css"));

console.log(`vault.bin written: ${data.questions.length} questions, ${(body.length / 1024).toFixed(0)} KB encrypted`);
