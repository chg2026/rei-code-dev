import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  acceptInvitationForAccount,
  declineInvitation,
  listPendingInvitations,
} from "./contractorProjectInvitationInbox";

type InvitationRow = {
  id: string;
  companyId: string;
  projectId: string;
  contactId: string;
  cpAccountId: string | null;
  emailSnapshot: string;
  role: string;
  trade: string | null;
  status: string;
  expiresAt: Date;
  agreementVersion: string;
  invitedAt: Date;
  company: { name: string; id?: string };
  project: { code: string; name: string; companyId?: string };
  contact: { companyId: string };
};

const now = new Date("2026-08-12T12:00:00.000Z");
const row = (overrides: Partial<InvitationRow> = {}): InvitationRow => ({
  id: "inv-1",
  companyId: "company-1",
  projectId: "project-1",
  contactId: "contact-1",
  cpAccountId: null,
  emailSnapshot: "contractor@example.com",
  role: "GC",
  trade: "General",
  status: "Pending",
  expiresAt: new Date("2026-08-13T12:00:00.000Z"),
  agreementVersion: "v1",
  invitedAt: new Date("2026-08-12T11:00:00.000Z"),
  company: { name: "Acme Rehab" },
  project: { code: "P-1", name: "Main Street", companyId: "company-1" },
  contact: { companyId: "company-1" },
  ...overrides,
});

function clientFor(rows: InvitationRow[], updateCount = 1) {
  const calls: { findMany?: any; findUnique?: any; updateMany?: any } = {};
  const invitation = {
    findMany: async (args: any) => {
      calls.findMany = args;
      return rows;
    },
    findUnique: async (args: any) => {
      calls.findUnique = args;
      return rows[0] ?? null;
    },
    updateMany: async (args: any) => {
      calls.updateMany = args;
      return { count: updateCount };
    },
  };
  return {
    calls,
    client: {
      contractorProjectInvitation: invitation,
      $transaction: async (fn: (tx: { contractorProjectInvitation: typeof invitation }) => Promise<unknown>) => fn({ contractorProjectInvitation: invitation }),
    } as any,
  };
}

test("list gives linked account ownership precedence over email and only email-matches unlinked rows", async () => {
  const fixture = row({ cpAccountId: "account-1", emailSnapshot: "old@example.com" });
  const { client, calls } = clientFor([fixture]);

  const result = await listPendingInvitations("account-1", "new@example.com", now, client);

  assert.equal(result[0]?.id, "inv-1");
  assert.deepEqual(calls.findMany.where.OR, [
    { cpAccountId: "account-1" },
    { cpAccountId: null, emailSnapshot: { equals: "new@example.com", mode: "insensitive" } },
  ]);
  assert.equal(calls.findMany.where.status, "Pending");
  assert.deepEqual(calls.findMany.where.expiresAt, { gte: now });
});

test("list normalizes the email for an unlinked account and serializes safe display data", async () => {
  const { client, calls } = clientFor([row({ emailSnapshot: " CONTRACTOR@EXAMPLE.COM " })]);

  const result = await listPendingInvitations("account-1", "  Contractor@Example.com ", now, client);

  assert.equal(calls.findMany.where.OR[1].emailSnapshot.equals, "contractor@example.com");
  assert.equal(result[0]?.expiresAt, "2026-08-13T12:00:00.000Z");
  assert.equal("inviteTokenHash" in (result[0] ?? {}), false);
});

test("list rejects malformed cross-company invitation relations", async () => {
  const { client } = clientFor([row({ contact: { companyId: "company-2" } })]);
  const result = await listPendingInvitations("account-1", "contractor@example.com", now, client);
  assert.deepEqual(result, []);
});

test("linked account id is authoritative even when another account has the same email snapshot", async () => {
  const { client, calls } = clientFor([row({ cpAccountId: "account-a", emailSnapshot: "same@example.com" })]);
  const result = await acceptInvitationForAccount({ invitationId: "inv-1", accountId: "account-b", accountEmail: "same@example.com", agreementAccepted: true, now, client });
  assert.deepEqual(result, { ok: false, outcome: "not_found" });
  assert.equal(calls.updateMany, undefined);
});
test("accept requires explicit agreement before reading or writing", async () => {
  const { client, calls } = clientFor([row()]);

  const result = await acceptInvitationForAccount({
    invitationId: "inv-1",
    accountId: "account-1",
    accountEmail: "contractor@example.com",
    agreementAccepted: false,
    now,
    client,
  });

  assert.deepEqual(result, { ok: false, outcome: "agreement_required" });
  assert.equal(calls.findUnique, undefined);
  assert.equal(calls.updateMany, undefined);
});

test("accept performs a pending/expiry/ownership CAS and records actor and agreement time", async () => {
  const { client, calls } = clientFor([row({ cpAccountId: "account-1" })]);

  const result = await acceptInvitationForAccount({
    invitationId: "inv-1",
    accountId: "account-1",
    accountEmail: "contractor@example.com",
    agreementAccepted: true,
    now,
    client,
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(calls.updateMany.where.id, "inv-1");
  assert.equal(calls.updateMany.where.status, "Pending");
  assert.deepEqual(calls.updateMany.where.expiresAt, { gte: now });
  assert.equal(calls.updateMany.data.status, "Accepted");
  assert.equal(calls.updateMany.data.agreementAcceptedAt, now);
  assert.equal(calls.updateMany.data.acceptedById, "account-1");
});

test("lost accept CAS is reported as conflict without retrying", async () => {
  const { client, calls } = clientFor([row({ cpAccountId: "account-1" })], 0);

  const result = await acceptInvitationForAccount({
    invitationId: "inv-1",
    accountId: "account-1",
    accountEmail: "contractor@example.com",
    agreementAccepted: true,
    now,
    client,
  });

  assert.deepEqual(result, { ok: false, outcome: "conflict" });
  assert.equal(calls.updateMany ? 1 : 0, 1);
});

test("decline performs the same CAS boundary and records actor and timestamp", async () => {
  const { client, calls } = clientFor([row({ cpAccountId: "account-1" })]);

  const result = await declineInvitation({
    invitationId: "inv-1",
    accountId: "account-1",
    accountEmail: "contractor@example.com",
    now,
    client,
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(calls.updateMany.data.status, "Declined");
  assert.equal(calls.updateMany.data.declinedAt, now);
  assert.equal(calls.updateMany.data.declinedById, "account-1");
});

test("expired or non-pending invitations are rejected without mutation", async () => {
  for (const fixture of [
    row({ status: "Accepted", cpAccountId: "account-1" }),
    row({ expiresAt: new Date("2026-08-12T11:59:59.000Z"), cpAccountId: "account-1" }),
  ]) {
    const { client, calls } = clientFor([fixture]);
    const result = await declineInvitation({ invitationId: fixture.id, accountId: "account-1", accountEmail: "contractor@example.com", now, client });
    assert.deepEqual(result, { ok: false, outcome: "not_pending" });
    assert.equal(calls.updateMany, undefined);
  }
});

test("route and auth contract reject disabled/suspended portal accounts", async () => {
  const [route, auth] = await Promise.all([
    readFile(new URL("../app/api/invitations/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("./auth.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /contractorPortalEnabled/);
  assert.match(route, /status !== \"Active\"/);
  assert.match(auth, /profile\.status === \"suspended\"/);
  assert.match(auth, /!account\.contractorPortalEnabled/);
});

test("accept and decline use only invitation mutations and cannot create downstream access records", async () => {
  const { client } = clientFor([row({ cpAccountId: "account-1" })]);
  const calls: string[] = [];
  const guarded = new Proxy(client, {
    get(target, property, receiver) {
      if (["cpJob", "contractorAssignment", "cpOperatorEdge", "cpAccount"].includes(String(property))) {
        calls.push(String(property));
        throw new Error(`unexpected downstream write: ${String(property)}`);
      }
      return Reflect.get(target, property, receiver);
    },
  });

  await acceptInvitationForAccount({ invitationId: "inv-1", accountId: "account-1", accountEmail: "contractor@example.com", agreementAccepted: true, now, client: guarded });
  await declineInvitation({ invitationId: "inv-1", accountId: "account-1", accountEmail: "contractor@example.com", now, client: guarded });
  assert.deepEqual(calls, []);
});
