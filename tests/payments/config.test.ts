import { afterEach, describe, expect, it } from "vitest";
import { isPaymentConfigured, paymentConfigProblem } from "@/lib/payments/gateway";

const saved = { key: process.env.STRIPE_SECRET_KEY, env: process.env.VERCEL_ENV };
afterEach(() => {
  process.env.STRIPE_SECRET_KEY = saved.key;
  process.env.VERCEL_ENV = saved.env;
  if (saved.key === undefined) delete process.env.STRIPE_SECRET_KEY;
  if (saved.env === undefined) delete process.env.VERCEL_ENV;
});

describe("payment configuration", () => {
  it("refuses a live Stripe key anywhere but production", () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_abc";
    for (const env of ["preview", "development", undefined]) {
      if (env === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = env;
      expect(paymentConfigProblem()).toBe("LIVE_KEY_OUTSIDE_PRODUCTION");
      expect(isPaymentConfigured()).toBe(false);
    }
  });

  it("allows a live key in production and a test key anywhere", () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_abc";
    process.env.VERCEL_ENV = "production";
    expect(isPaymentConfigured()).toBe(true);
    process.env.STRIPE_SECRET_KEY = "sk_test_abc";
    process.env.VERCEL_ENV = "preview";
    expect(isPaymentConfigured()).toBe(true);
  });

  it("reports a missing key", () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(paymentConfigProblem()).toBe("MISSING");
  });
});
