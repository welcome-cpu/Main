// One-time Hive setup for the website's heating control. Run it yourself in a
// terminal (not through Claude), from the project folder:
//
//   node scripts/hive-setup.mjs
//
// It signs in to your Hive account (with the SMS code Hive sends), registers
// the website as a remembered device so it can sign in later without an SMS,
// checks that works, and lists your heating so you can pick Murray Cottage's.
// It then prints the HIVE_* settings to add to Vercel, and can also save them
// to .env.local for local testing. Your password goes only to Hive and, if you
// choose, into .env.local and Vercel.

import { createInterface } from "node:readline";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import cognito from "amazon-cognito-identity-js";

const { AuthenticationDetails, CognitoUser, CognitoUserPool } = cognito;
const API_BASES = ["https://beekeeper-uk.hivehome.com/1.0", "https://beekeeper.hivehome.com/1.0"];

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let muted = false;
rl._writeToOutput = (s) => {
  if (!muted || s.includes("\n")) rl.output.write(muted ? "\n" : s);
};
const ask = (q) => new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));
async function askHidden(q) {
  process.stdout.write(q);
  muted = true;
  const a = await new Promise((resolve) => rl.question("", resolve));
  muted = false;
  return a;
}

class MemoryStorage {
  items = new Map();
  getItem(k) {
    return this.items.get(k) ?? null;
  }
  setItem(k, v) {
    this.items.set(k, String(v));
  }
  removeItem(k) {
    this.items.delete(k);
  }
  clear() {
    this.items.clear();
  }
  find(suffix) {
    for (const [k, v] of this.items) if (k.endsWith(suffix)) return v;
    return null;
  }
}

async function poolConfig() {
  const html = await (await fetch("https://sso.hivehome.com/")).text();
  const read = (key) => html.match(new RegExp(`window\\.${key}\\s*=\\s*["']([^"']+)["']`))?.[1];
  const userPoolId = read("HiveSSOPoolId");
  const clientId = read("HiveSSOPublicCognitoClientId");
  if (!userPoolId || !clientId) throw new Error("Couldn't read Hive's sign-in settings from sso.hivehome.com.");
  return { userPoolId, clientId };
}

function signInWithSms(pool, storage, username, password) {
  const user = new CognitoUser({ Username: username, Pool: pool, Storage: storage });
  const details = new AuthenticationDetails({ Username: username, Password: password });
  return new Promise((resolve, reject) => {
    const callbacks = {
      onSuccess: (session) => resolve({ user, session }),
      onFailure: reject,
      mfaRequired: async () => {
        const code = await ask("Enter the code Hive just texted you: ");
        user.sendMFACode(code, callbacks);
      },
      totpRequired: async () => {
        const code = await ask("Enter the code from your authenticator app: ");
        user.sendMFACode(code, callbacks, "SOFTWARE_TOKEN_MFA");
      },
      newPasswordRequired: () => reject(new Error("Hive wants your password changed. Do that in the Hive app first.")),
    };
    user.authenticateUser(details, callbacks);
  });
}

function signInAsDevice(pool, username, password, keys) {
  const storage = {
    getItem: (k) =>
      k.endsWith(".deviceKey") ? keys.deviceKey : k.endsWith(".deviceGroupKey") ? keys.deviceGroupKey : k.endsWith(".randomPasswordKey") ? keys.devicePassword : null,
    setItem() {},
    removeItem() {},
    clear() {},
  };
  const user = new CognitoUser({ Username: username, Pool: pool, Storage: storage });
  return new Promise((resolve, reject) => {
    user.authenticateUser(new AuthenticationDetails({ Username: username, Password: password }), {
      onSuccess: (session) => resolve(session),
      onFailure: reject,
      mfaRequired: () => reject(new Error("Hive still asked for an SMS code, so the device wasn't remembered.")),
      totpRequired: () => reject(new Error("Hive still asked for a code, so the device wasn't remembered.")),
    });
  });
}

async function heatingProducts(idToken) {
  for (const base of API_BASES) {
    const res = await fetch(`${base}/nodes/all?products=true&devices=true`, {
      headers: { Authorization: idToken, "Content-Type": "application/json", Accept: "*/*" },
    });
    if (!res.ok) {
      console.log(`  ${base} answered ${res.status}, trying the next one…`);
      continue;
    }
    const data = await res.json();
    const products = (data.products ?? []).filter((p) => p.type === "heating" || p.type === "trvcontrol");
    return { base, products };
  }
  throw new Error("Neither Hive API address accepted the sign-in.");
}

function saveToEnvLocal(values) {
  const file = ".env.local";
  const lines = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/).filter((l) => !/^HIVE_[A-Z_]+=/.test(l)) : [];
  while (lines.length && lines.at(-1) === "") lines.pop();
  lines.push("", "# Hive heating (scripts/hive-setup.mjs)", ...Object.entries(values).map(([k, v]) => `${k}=${JSON.stringify(v)}`), "");
  writeFileSync(file, lines.join("\n"));
}

try {
  console.log("Hive setup for Gamrie Chalets heating control\n");
  const username = (await ask("Hive account email: ")).toLowerCase();
  const password = await askHidden("Hive password (hidden): ");

  const { userPoolId, clientId } = await poolConfig();
  const pool = new CognitoUserPool({ UserPoolId: userPoolId, ClientId: clientId });
  const storage = new MemoryStorage();

  const { user } = await signInWithSms(pool, storage, username, password);
  const keys = {
    deviceKey: storage.find(".deviceKey"),
    deviceGroupKey: storage.find(".deviceGroupKey"),
    devicePassword: storage.find(".randomPasswordKey"),
  };
  if (!keys.deviceKey || !keys.deviceGroupKey || !keys.devicePassword) {
    throw new Error("Signed in, but Hive didn't register this as a device, so the website would need an SMS code every time.");
  }
  await new Promise((resolve, reject) => user.setDeviceStatusRemembered({ onSuccess: resolve, onFailure: reject }));
  console.log("\n✓ Signed in and registered the website as a remembered device.");

  const session = await signInAsDevice(pool, username, password, keys);
  console.log("✓ Checked: it can now sign in without an SMS code.");

  const { base, products } = await heatingProducts(session.getIdToken().getJwtToken());
  if (!products.length) throw new Error("No heating found on this Hive account.");
  console.log(`\nHeating on this Hive account (via ${base}):`);
  products.forEach((p, i) =>
    console.log(`  ${i + 1}. ${p.state?.name ?? "(no name)"}: mode ${p.state?.mode}, ${p.props?.temperature ?? "?"}° now, set to ${p.state?.target ?? "?"}°`),
  );
  let choice = 1;
  if (products.length > 1) choice = Number(await ask("Which one is Murray Cottage? Number: "));
  const heating = products[choice - 1];
  if (!heating) throw new Error("That isn't one of the numbers listed.");
  const sure = await ask(`Use "${heating.state?.name ?? heating.id}" for Murray Cottage? (y/N) `);
  if (sure.toLowerCase() !== "y") throw new Error("Stopped. Nothing was saved.");

  const values = {
    HIVE_USERNAME: username,
    HIVE_PASSWORD: password,
    HIVE_DEVICE_KEY: keys.deviceKey,
    HIVE_DEVICE_GROUP_KEY: keys.deviceGroupKey,
    HIVE_DEVICE_PASSWORD: keys.devicePassword,
    HIVE_HEATING_ID: heating.id,
    HIVE_API_BASE: base,
  };

  console.log("\nAdd these to Vercel (Settings > Environment Variables), marked Sensitive, for Preview first:");
  for (const k of Object.keys(values)) console.log(`  ${k}`);
  if ((await ask("\nShow the values on screen so you can copy them? (y/N) ")).toLowerCase() === "y") {
    for (const [k, v] of Object.entries(values)) console.log(`${k}=${v}`);
  }
  if ((await ask("Also save them to .env.local for local testing? (y/N) ")).toLowerCase() === "y") {
    saveToEnvLocal(values);
    console.log("✓ Saved to .env.local.");
  }
  console.log("\nDone.");
} catch (err) {
  console.error(`\n✗ ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
