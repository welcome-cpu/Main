import "server-only";

// Talks to Hive (British Gas Hive Home). Hive has no official API for other
// apps; this uses the unofficial one the Hive app itself uses, as documented by
// the open-source Pyhive library (github.com/Pyhass/Pyhive). It can break if
// Hive changes it: every failure is caught by the caller and shown in admin.
//
// Signing in: Hive accounts live in Amazon Cognito. The owner ran
// scripts/hive-setup.mjs once, which signed in with an SMS code and registered
// this site as a remembered device, so the server signs in with the password
// and device keys alone, with no SMS. All of these are server-only secrets.

import { AuthenticationDetails, CognitoUser, CognitoUserPool, type ICognitoStorage } from "amazon-cognito-identity-js";
import {
  parseHeatingSchedule,
  parseHotWaterSchedule,
  type HeatingSchedule,
  type HotWaterSchedule,
} from "@/lib/heating/hive-schedule";

export class HiveError extends Error {}

const SSO_PAGE = "https://sso.hivehome.com/";
const DEFAULT_API_BASE = "https://beekeeper-uk.hivehome.com/1.0";
const TIMEOUT_MS = 20_000;

type HiveEnv = {
  username: string;
  password: string;
  deviceKey: string;
  deviceGroupKey: string;
  devicePassword: string;
  heatingId: string;
  /** Optional: otherwise found as the hot water on the same Hive receiver as the heating. */
  hotWaterId: string | null;
  apiBase: string;
};

function hiveEnv(): HiveEnv | null {
  const e = process.env;
  if (!e.HIVE_USERNAME || !e.HIVE_PASSWORD || !e.HIVE_DEVICE_KEY || !e.HIVE_DEVICE_GROUP_KEY || !e.HIVE_DEVICE_PASSWORD || !e.HIVE_HEATING_ID) {
    return null;
  }
  return {
    username: e.HIVE_USERNAME.trim().toLowerCase(),
    password: e.HIVE_PASSWORD,
    deviceKey: e.HIVE_DEVICE_KEY,
    deviceGroupKey: e.HIVE_DEVICE_GROUP_KEY,
    devicePassword: e.HIVE_DEVICE_PASSWORD,
    heatingId: e.HIVE_HEATING_ID,
    hotWaterId: e.HIVE_HOT_WATER_ID || null,
    apiBase: (e.HIVE_API_BASE || DEFAULT_API_BASE).replace(/\/$/, ""),
  };
}

export function isHiveConfigured() {
  return hiveEnv() !== null;
}

/** Hive's Cognito pool and app client, published on its sign-in page. */
export async function hivePoolConfig(): Promise<{ userPoolId: string; clientId: string }> {
  const res = await fetch(SSO_PAGE, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new HiveError(`Hive's sign-in page returned ${res.status}.`);
  const html = await res.text();
  const read = (key: string) => html.match(new RegExp(`window\\.${key}\\s*=\\s*["']([^"']+)["']`))?.[1];
  const userPoolId = read("HiveSSOPoolId");
  const clientId = read("HiveSSOPublicCognitoClientId");
  if (!userPoolId || !clientId) throw new HiveError("Couldn't find Hive's sign-in settings on its sign-in page. Hive may have changed it.");
  return { userPoolId, clientId };
}

/** Hands the remembered-device keys to the Cognito library, whatever user id it files them under. */
function deviceStorage(env: HiveEnv): ICognitoStorage {
  const items = new Map<string, string>();
  return {
    getItem(key) {
      if (key.endsWith(".deviceKey")) return env.deviceKey;
      if (key.endsWith(".deviceGroupKey")) return env.deviceGroupKey;
      if (key.endsWith(".randomPasswordKey")) return env.devicePassword;
      return items.get(key) ?? null;
    },
    setItem(key, value) {
      items.set(key, value);
    },
    removeItem(key) {
      items.delete(key);
    },
    clear() {
      items.clear();
    },
  };
}

async function signIn(env: HiveEnv): Promise<string> {
  const { userPoolId, clientId } = await hivePoolConfig();
  const pool = new CognitoUserPool({ UserPoolId: userPoolId, ClientId: clientId, Storage: deviceStorage(env) });
  const user = new CognitoUser({ Username: env.username, Pool: pool, Storage: deviceStorage(env) });
  const details = new AuthenticationDetails({ Username: env.username, Password: env.password });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new HiveError("Signing in to Hive timed out.")), TIMEOUT_MS);
    const done = (fn: () => void) => {
      clearTimeout(timer);
      fn();
    };
    user.authenticateUser(details, {
      onSuccess: (session) => done(() => resolve(session.getIdToken().getJwtToken())),
      onFailure: (err: unknown) =>
        done(() => reject(new HiveError(`Hive sign-in failed: ${err instanceof Error ? err.message : String(err)}`))),
      mfaRequired: () =>
        done(() =>
          reject(new HiveError("Hive asked for an SMS code, so it no longer remembers this site. Run scripts/hive-setup.mjs again.")),
        ),
      totpRequired: () => done(() => reject(new HiveError("Hive asked for an authenticator code. Run scripts/hive-setup.mjs again."))),
      newPasswordRequired: () => done(() => reject(new HiveError("Hive wants the account password changed. Do that in the Hive app."))),
    });
  });
}

export type HeatingStatus = {
  id: string;
  name: string | null;
  mode: string | null;
  target: number | null;
  temperature: number | null;
  schedule: HeatingSchedule | null;
};

export type HotWaterStatus = {
  id: string;
  name: string | null;
  mode: string | null;
  /** Whether the water is being heated right now. */
  on: boolean | null;
  schedule: HotWaterSchedule | null;
};

export type HiveStatus = {
  heating: HeatingStatus;
  hotWater: HotWaterStatus | null;
  /** Why the hot water couldn't be found, if it couldn't. */
  hotWaterError: string | null;
};

type HiveProduct = {
  id?: unknown;
  type?: unknown;
  parent?: unknown;
  state?: { name?: unknown; mode?: unknown; target?: unknown; heat?: unknown; schedule?: unknown; status?: unknown };
  props?: { temperature?: unknown; working?: unknown };
};
type Found = HiveProduct & { id: string; type: string };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" ? v : null);
const label = (p: HiveProduct) => `${str(p.state?.name) ?? "(no name)"} (${String(p.id)})`;

/** A signed-in connection to the configured heating and its hot water. */
export class HiveHeating {
  private constructor(
    private env: HiveEnv,
    private token: string,
  ) {}

  static async connect(): Promise<HiveHeating> {
    const env = hiveEnv();
    if (!env) throw new HiveError("Hive isn't set up for this deployment (the HIVE_* settings are missing).");
    return new HiveHeating(env, await signIn(env));
  }

  private async request(method: "GET" | "POST", path: string, body?: unknown) {
    const res = await fetch(`${this.env.apiBase}${path}`, {
      method,
      headers: { Authorization: this.token, "Content-Type": "application/json", Accept: "*/*" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new HiveError(`Hive returned ${res.status} for ${method} ${path.split("?")[0]}.`);
    const text = await res.text();
    return text ? (JSON.parse(text) as unknown) : null;
  }

  private async products(): Promise<HiveProduct[]> {
    const all = (await this.request("GET", "/nodes/all?products=true&devices=true")) as { products?: HiveProduct[] } | null;
    return all?.products ?? [];
  }

  private heating(products: HiveProduct[]): Found {
    const p = products.find((x) => x.id === this.env.heatingId);
    if (!p) throw new HiveError("The heating set in HIVE_HEATING_ID wasn't found on the Hive account.");
    const type = str(p.type);
    if (type !== "heating" && type !== "trvcontrol") throw new HiveError(`HIVE_HEATING_ID points at a Hive "${type}", not heating.`);
    return { ...p, id: this.env.heatingId, type };
  }

  /**
   * The hot water: the one named in HIVE_HOT_WATER_ID, or else the only hot
   * water on the same Hive receiver as the heating. Never a guess between
   * several, because one Hive account can control more than one home.
   */
  private hotWater(products: HiveProduct[], heating: Found): Found {
    const all = products.filter((p) => p.type === "hotwater" && typeof p.id === "string");
    if (this.env.hotWaterId) {
      const p = all.find((x) => x.id === this.env.hotWaterId);
      if (!p) throw new HiveError("The hot water set in HIVE_HOT_WATER_ID wasn't found on the Hive account.");
      return { ...p, id: p.id as string, type: "hotwater" };
    }
    const sameReceiver = heating.parent ? all.filter((p) => p.parent === heating.parent) : [];
    if (sameReceiver.length === 1) return { ...sameReceiver[0], id: sameReceiver[0].id as string, type: "hotwater" };
    if (!all.length) throw new HiveError("No hot water found on the Hive account.");
    throw new HiveError(
      `Couldn't tell which hot water goes with this heating. Add HIVE_HOT_WATER_ID in Vercel, set to the ID of one of: ${all.map(label).join(", ")}.`,
    );
  }

  async status(): Promise<HiveStatus> {
    const products = await this.products();
    const h = this.heating(products);
    const heating: HeatingStatus = {
      id: h.id,
      name: str(h.state?.name),
      mode: str(h.state?.mode),
      target: num(h.state?.target) ?? num(h.state?.heat),
      temperature: num(h.props?.temperature),
      schedule: parseHeatingSchedule(h.state?.schedule),
    };
    try {
      const w = this.hotWater(products, h);
      const working = w.props?.working ?? w.state?.status;
      return {
        heating,
        hotWater: {
          id: w.id,
          name: str(w.state?.name),
          mode: str(w.state?.mode),
          on: typeof working === "boolean" ? working : working === "ON" ? true : working === "OFF" ? false : null,
          schedule: parseHotWaterSchedule(w.state?.schedule),
        },
        hotWaterError: null,
      };
    } catch (err) {
      if (!(err instanceof HiveError)) throw err;
      return { heating, hotWater: null, hotWaterError: err.message };
    }
  }

  private async update(p: Found, body: Record<string, unknown>) {
    await this.request("POST", `/nodes/${p.type}/${encodeURIComponent(p.id)}`, body);
  }

  async setHeatingSchedule(schedule: HeatingSchedule) {
    const clean = parseHeatingSchedule(schedule);
    if (!clean) throw new HiveError("The saved heating schedule isn't valid, so it wasn't sent to Hive.");
    await this.update(this.heating(await this.products()), { schedule: clean });
  }

  async setHeatingMode(mode: "SCHEDULE" | "OFF") {
    await this.update(this.heating(await this.products()), { mode });
  }

  async setHotWaterSchedule(schedule: HotWaterSchedule) {
    const clean = parseHotWaterSchedule(schedule);
    if (!clean) throw new HiveError("The saved hot water schedule isn't valid, so it wasn't sent to Hive.");
    const products = await this.products();
    await this.update(this.hotWater(products, this.heating(products)), { schedule: clean });
  }

  async setHotWaterMode(mode: "SCHEDULE" | "OFF") {
    const products = await this.products();
    await this.update(this.hotWater(products, this.heating(products)), { mode });
  }
}
