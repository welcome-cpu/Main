import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_URL = process.env.TEST_DATABASE_URL;
const enabled = Boolean(TEST_URL) && TEST_URL !== process.env.DATABASE_URL;

type Db = typeof import("@/lib/db/client");
type Webhook = typeof import("@/lib/payments/webhook");
type Gateway = import("@/lib/payments/gateway").PaymentGateway;

let dbMod: Db;
let webhook: Webhook;
// Print sales never touch the gateway; any call is a bug.
const gateway = new Proxy({}, { get: () => () => { throw new Error("gateway used"); } }) as Gateway;

const printEvent = (sessionId: string, paymentStatus = "paid") =>
  ({
    id: `evt_${randomUUID()}`,
    type: "checkout.session.completed",
    livemode: false,
    data: {
      object: {
        id: sessionId,
        payment_status: paymentStatus,
        amount_total: 7500,
        metadata: { kind: "print", print: "first-view-of-crovie" },
        customer_details: { email: "buyer@example.com", name: "Jo Buyer", phone: "+447700900000", address: null },
      },
    },
  }) as unknown as Stripe.Event;

describe.runIf(enabled)("print sales (database)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.CONTACT_MAILBOX = "owner@example.com";
    dbMod = await import("@/lib/db/client");
    webhook = await import("@/lib/payments/webhook");
  });
  afterAll(async () => {
    await dbMod?.db().end();
  });

  it("emails the buyer and the owner once", async () => {
    const sessionId = `cs_test_${randomUUID().replaceAll("-", "")}`;
    await webhook.handleStripeEvent(printEvent(sessionId), gateway);
    await webhook.handleStripeEvent(printEvent(sessionId), gateway); // a second delivery under a new event id

    const sent = await dbMod.db()<{ kind: string; recipient: string; textBody: string }[]>`
      SELECT kind, recipient, text_body FROM emails WHERE dedupe_key LIKE ${`%${sessionId}%`} ORDER BY kind
    `;
    expect(sent.map((e) => [e.kind, e.recipient])).toEqual([
      ["OWNER_PRINT_SOLD", "owner@example.com"],
      ["PRINT_RECEIPT", "buyer@example.com"],
      ["PRINT_REPLACE", "shaun@donaldson.co.uk"],
    ]);
    expect(sent[2].textBody).toContain("needs replacing at the next changeover");
    expect(sent[0].textBody).toContain("taking the print with them from Muckle View");
    expect(sent[0].textBody).toContain("£75.00");

    await dbMod.db()`DELETE FROM emails WHERE dedupe_key LIKE ${`%${sessionId}%`}`;
  });

  it("does nothing until the payment is actually paid", async () => {
    const sessionId = `cs_test_${randomUUID().replaceAll("-", "")}`;
    const outcome = await webhook.handleStripeEvent(printEvent(sessionId, "unpaid"), gateway);
    expect(outcome.ignored).toBe("print payment is unpaid");
    const [{ count }] = await dbMod.db()<{ count: number }[]>`
      SELECT count(*)::int AS count FROM emails WHERE dedupe_key LIKE ${`%${sessionId}%`}
    `;
    expect(count).toBe(0);
  });
});
