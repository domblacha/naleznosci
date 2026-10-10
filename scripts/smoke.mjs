// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const email = `smoke-${Date.now()}@example.com`;
const emailB = `smoke-b-${Date.now()}@example.com`;
const password = "Smoke-Test-Passw0rd!";
const jar = new Map();
const jarB = new Map();
const stamp = Date.now();

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(response, jar) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired) jar.delete(name.trim());
    else jar.set(name.trim(), rest.join("="));
  }
}

async function request(path, { method = "GET", form, json, jar: cookies = jar } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(cookies),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(json ? { "Content-Type": "application/json" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : json ? JSON.stringify(json) : undefined,
  });
  storeCookies(response, cookies);
  const text = await response.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON (HTML page or empty body): keep the text
  }
  return { status: response.status, location: response.headers.get("location") ?? "", body };
}

const nameA = `Smoke Sp. z o.o. ${stamp}`;
const nameNoNip = `Acme Smoke ${stamp}`;
const clientIds = {};
const clientJson = (jar, json) => ({ method: "POST", json, jar });
const created = (key) => (actual) => {
  clientIds[key] = actual.body?.client?.id;
  return Boolean(clientIds[key]);
};

function clientSteps() {
  const post = (jar, json) => () => request("/api/clients", clientJson(jar, json));
  return [
    [
      "client A: create with NIP",
      post(jar, { name: nameA, nip: "1234563218", chargeCompensation: true }),
      { status: 201, check: created("a") },
    ],
    [
      "client A: same NIP in other notation -> duplicate_nip",
      post(jar, { name: `Inny ${stamp}`, nip: "PL 123-456-32-18" }),
      { status: 409, check: (a) => a.body?.error === "duplicate_nip" },
    ],
    ["client A: create without NIP", post(jar, { name: nameNoNip, nip: "" }), { status: 201, check: created("noNip") }],
    [
      "client A: same name, other case/spaces -> duplicate_name",
      post(jar, { name: nameNoNip.toLowerCase().replace(" ", "  "), nip: null }),
      { status: 409, check: (a) => a.body?.error === "duplicate_name" },
    ],
    [
      "client A: invalid NIP -> 400",
      post(jar, { name: `Zly NIP ${stamp}`, nip: "1234563219" }),
      { status: 400, check: (a) => a.body?.error === "invalid_input" && Boolean(a.body?.fieldErrors?.nip) },
    ],
    [
      "client A: update own client",
      () =>
        request(`/api/clients/${clientIds.a}`, {
          method: "PUT",
          json: { name: nameA, nip: "1234563218", chargeCompensation: false },
          jar,
        }),
      { status: 200, check: (a) => a.body?.client?.chargeCompensation === false },
    ],
    [
      "user B: signup",
      () => request("/api/auth/signup", { method: "POST", form: { email: emailB, password }, jar: jarB }),
      { status: 302, location: "/auth/confirm-email" },
    ],
    [
      "user B: signin",
      () => request("/api/auth/signin", { method: "POST", form: { email: emailB, password }, jar: jarB }),
      { status: 302, location: "/" },
    ],
    [
      "user B: cannot update client of A -> 404",
      () =>
        request(`/api/clients/${clientIds.a}`, {
          method: "PUT",
          json: { name: "Przejety", nip: null, chargeCompensation: true },
          jar: jarB,
        }),
      { status: 404, check: (a) => a.body?.error === "not_found" },
    ],
    [
      "user B: same NIP as A is allowed",
      post(jarB, { name: nameA, nip: "1234563218" }),
      { status: 201, check: created("b") },
    ],
  ];
}

function daysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

let invoiceIdA;

function invoiceSteps() {
  const number = `FV/1/${stamp}`;
  const dueDate = daysAgo(40);
  const post = (jar, json) => () => request("/api/invoices", { method: "POST", json, jar });
  return [
    [
      "invoices API rejects anonymous user",
      post(new Map(), { clientId: clientIds.noNip, number, amount: "1", dueDate }),
      { status: 401 },
    ],
    [
      "invoice A: create 40 days overdue",
      () => post(jar, { clientId: clientIds.noNip, number, amount: "1 234,56", dueDate })(),
      {
        status: 201,
        check: (a) => {
          invoiceIdA = a.body?.invoice?.id;
          return a.body?.invoice?.amountGrosze === 123456 && Boolean(invoiceIdA);
        },
      },
    ],
    [
      "invoice A: same number, other case -> duplicate_number",
      () => post(jar, { clientId: clientIds.noNip, number: number.toLowerCase(), amount: "1", dueDate })(),
      { status: 409, check: (a) => a.body?.error === "duplicate_number" },
    ],
    [
      "invoice A: zero amount -> 400",
      () => post(jar, { clientId: clientIds.noNip, number: `FV/2/${stamp}`, amount: "0", dueDate })(),
      { status: 400, check: (a) => a.body?.error === "invalid_input" && Boolean(a.body?.fieldErrors?.amount) },
    ],
    [
      "invoice B: client of A -> client_not_found",
      () => post(jarB, { clientId: clientIds.a, number: `FV/3/${stamp}`, amount: "1", dueDate })(),
      { status: 404, check: (a) => a.body?.error === "client_not_found" },
    ],
    [
      "invoice B: same number as A is allowed",
      () => post(jarB, { clientId: clientIds.b, number, amount: "1", dueDate })(),
      { status: 201 },
    ],
    ...paymentSteps(),
    ...editAndCancelSteps(),
    ...pauseSteps(),
    ...deactivationSteps(),
  ];
}

function paymentSteps() {
  const put = (jar, id, paidOn) => () =>
    request(`/api/invoices/${id}/payment`, { method: "PUT", json: { paidOn }, jar });
  const remove = (jar, id) => () => request(`/api/invoices/${id}/payment`, { method: "DELETE", jar });
  const tomorrow = daysAgo(-2);
  return [
    ["payment API rejects anonymous user", () => put(new Map(), invoiceIdA, daysAgo(0))(), { status: 401 }],
    [
      "payment A: future date -> 400",
      () => put(jar, invoiceIdA, tomorrow)(),
      { status: 400, check: (a) => a.body?.error === "invalid_input" && Boolean(a.body?.fieldErrors?.paidOn) },
    ],
    [
      "payment A: mark paid today",
      () => put(jar, invoiceIdA, daysAgo(0))(),
      { status: 200, check: (a) => a.body?.invoice?.paidOn === daysAgo(0) },
    ],
    ["payment B: cannot mark invoice of A -> 404", () => put(jarB, invoiceIdA, daysAgo(0))(), { status: 404 }],
    ["payment B: cannot reopen invoice of A -> 404", () => remove(jarB, invoiceIdA)(), { status: 404 }],
    [
      "payment A: change date",
      () => put(jar, invoiceIdA, daysAgo(5))(),
      { status: 200, check: (a) => a.body?.invoice?.paidOn === daysAgo(5) },
    ],
    [
      "payment A: reopen",
      () => remove(jar, invoiceIdA)(),
      { status: 200, check: (a) => a.body?.invoice?.paidOn === null },
    ],
    ["payment A: reopening an open invoice -> 404", () => remove(jar, invoiceIdA)(), { status: 404 }],
    ["payment A: invalid id -> 404", () => put(jar, "nie-uuid", daysAgo(0))(), { status: 404 }],
  ];
}

function editAndCancelSteps() {
  const dueA = daysAgo(40);
  const dueFuture = daysAgo(-10);
  const dueFuture2 = daysAgo(-12);
  const numberNew = `FV/10/${stamp}`;
  const renamedA = `FV/1-ed/${stamp}`;
  // Number of invoice A changes in the "change only the number" step; later steps use the current one.
  let numberA = `FV/1/${stamp}`;
  let invoiceIdNew;
  const edit = (jar, id, json) => () => request(`/api/invoices/${id}`, { method: "PUT", json, jar });
  const cancel = (jar, id) => () => request(`/api/invoices/${id}/cancellation`, { method: "PUT", jar });
  const restore = (jar, id) => () => request(`/api/invoices/${id}/cancellation`, { method: "DELETE", jar });
  const payload = (number, amount, dueDate) => ({ clientId: clientIds.noNip, number, amount, dueDate });
  return [
    [
      "edit: create invoice due in 10 days",
      () => request("/api/invoices", { method: "POST", json: payload(numberNew, "10", dueFuture), jar }),
      {
        status: 201,
        check: (a) => {
          invoiceIdNew = a.body?.invoice?.id;
          return Boolean(invoiceIdNew);
        },
      },
    ],
    [
      "edit: change amount and due date of not-yet-due invoice",
      () => edit(jar, invoiceIdNew, payload(numberNew, "20,50", dueFuture2))(),
      {
        status: 200,
        check: (a) => a.body?.invoice?.amountGrosze === 2050 && a.body?.invoice?.dueDate === dueFuture2,
      },
    ],
    [
      "edit A (overdue): change amount -> locked",
      () => edit(jar, invoiceIdA, payload(numberA, "999", dueA))(),
      { status: 409, check: (a) => a.body?.error === "locked" },
    ],
    [
      "edit A (overdue): change only number",
      () => edit(jar, invoiceIdA, payload(renamedA, "1 234,56", dueA))(),
      {
        status: 200,
        check: (a) => {
          if (a.body?.invoice?.number === renamedA) numberA = renamedA;
          return a.body?.invoice?.number === renamedA && a.body?.invoice?.amountGrosze === 123456;
        },
      },
    ],
    [
      "edit B: cannot edit invoice of A -> 404",
      () => edit(jarB, invoiceIdA, payload(numberA, "1 234,56", dueA))(),
      { status: 404 },
    ],
    [
      "cancel A",
      () => cancel(jar, invoiceIdA)(),
      { status: 200, check: (a) => a.body?.invoice?.cancelledOn === daysAgo(0) },
    ],
    ["cancel B: cannot cancel invoice of A -> 404", () => cancel(jarB, invoiceIdA)(), { status: 404 }],
    ["restore B: cannot restore invoice of A -> 404", () => restore(jarB, invoiceIdA)(), { status: 404 }],
    [
      "payment A: cancelled invoice cannot be marked paid -> 404",
      () => request(`/api/invoices/${invoiceIdA}/payment`, { method: "PUT", json: { paidOn: daysAgo(0) }, jar }),
      { status: 404 },
    ],
    [
      "edit A: cancelled invoice cannot be edited -> 404",
      () => edit(jar, invoiceIdA, payload(numberA, "1 234,56", dueA))(),
      { status: 404 },
    ],
    [
      "invoice: number of cancelled A is free for a new invoice",
      () => request("/api/invoices", { method: "POST", json: payload(numberA, "5", dueFuture), jar }),
      {
        status: 201,
        check: (a) => {
          invoiceIdNew = a.body?.invoice?.id;
          return Boolean(invoiceIdNew);
        },
      },
    ],
    [
      "restore A while number is taken -> duplicate_number",
      () => restore(jar, invoiceIdA)(),
      { status: 409, check: (a) => a.body?.error === "duplicate_number" },
    ],
    ["cancel the new invoice", () => cancel(jar, invoiceIdNew)(), { status: 200 }],
    [
      "restore A",
      () => restore(jar, invoiceIdA)(),
      { status: 200, check: (a) => a.body?.invoice?.cancelledOn === null },
    ],
    ["cancel: invalid id -> 404", () => cancel(jar, "nie-uuid")(), { status: 404 }],
  ];
}

// Runs after editAndCancelSteps(): invoice A is open again, 40 days overdue, with the renamed number.
function pauseSteps() {
  const dueA = daysAgo(40);
  const numberA = `FV/1-ed/${stamp}`;
  const pause = (jar, id) => () => request(`/api/invoices/${id}/pause`, { method: "PUT", jar });
  const resume = (jar, id) => () => request(`/api/invoices/${id}/pause`, { method: "DELETE", jar });
  const edit = (amount) => () =>
    request(`/api/invoices/${invoiceIdA}`, {
      method: "PUT",
      json: { clientId: clientIds.noNip, number: numberA, amount, dueDate: dueA },
      jar,
    });
  const pausedToday = { status: 200, check: (a) => a.body?.invoice?.pausedOn === daysAgo(0) };
  const notPaused = (extra = () => true) => ({
    status: 200,
    check: (a) => a.body?.invoice?.pausedOn === null && extra(a.body.invoice),
  });
  return [
    ["pause API rejects anonymous user", () => pause(new Map(), invoiceIdA)(), { status: 401 }],
    ["pause A", () => pause(jar, invoiceIdA)(), pausedToday],
    ["pause A again -> 404", () => pause(jar, invoiceIdA)(), { status: 404 }],
    ["pause B: cannot pause invoice of A -> 404", () => pause(jarB, invoiceIdA)(), { status: 404 }],
    ["resume B: cannot resume invoice of A -> 404", () => resume(jarB, invoiceIdA)(), { status: 404 }],
    [
      "edit A (paused, overdue): change amount",
      edit("999"),
      { status: 200, check: (a) => a.body?.invoice?.amountGrosze === 99900 },
    ],
    ["resume A", () => resume(jar, invoiceIdA)(), notPaused()],
    ["resume A again -> 404", () => resume(jar, invoiceIdA)(), { status: 404 }],
    [
      "edit A (resumed, overdue): change amount -> locked",
      edit("1 234,56"),
      { status: 409, check: (a) => a.body?.error === "locked" },
    ],
    ["pause A before payment", () => pause(jar, invoiceIdA)(), pausedToday],
    [
      "payment A: marking paid clears the pause",
      () => request(`/api/invoices/${invoiceIdA}/payment`, { method: "PUT", json: { paidOn: daysAgo(0) }, jar }),
      notPaused((invoice) => invoice.paidOn === daysAgo(0)),
    ],
    [
      "payment A: reopened invoice is not paused",
      () => request(`/api/invoices/${invoiceIdA}/payment`, { method: "DELETE", jar }),
      notPaused((invoice) => invoice.paidOn === null),
    ],
    ["pause A before cancel", () => pause(jar, invoiceIdA)(), pausedToday],
    [
      "cancel A: cancelling clears the pause",
      () => request(`/api/invoices/${invoiceIdA}/cancellation`, { method: "PUT", jar }),
      notPaused((invoice) => invoice.cancelledOn === daysAgo(0)),
    ],
    ["pause A: cancelled invoice cannot be paused -> 404", () => pause(jar, invoiceIdA)(), { status: 404 }],
    [
      "restore A after pause",
      () => request(`/api/invoices/${invoiceIdA}/cancellation`, { method: "DELETE", jar }),
      notPaused((invoice) => invoice.cancelledOn === null),
    ],
    ["pause: invalid id -> 404", () => pause(jar, "nie-uuid")(), { status: 404 }],
  ];
}

// Own client with a NIP, so the groups above (clientIds.noNip) are not affected.
function deactivationSteps() {
  const nip = "9876543210";
  const dueDate = daysAgo(40);
  const clientName = `Usuwany Smoke ${stamp}`;
  const number = `FV/D1/${stamp}`;
  let clientId;
  let invoiceId;
  const deactivation = (jar, method) => () => request(`/api/clients/${clientId}/deactivation`, { method, jar });
  const invoiceCall = (method, suffix) => () => request(`/api/invoices/${invoiceId}/${suffix}`, { method, jar });
  const blocked = { status: 409, check: (a) => a.body?.error === "has_open_invoices" };
  const inactive = { status: 409, check: (a) => a.body?.error === "client_inactive" };
  return [
    [
      "deactivation: create client with NIP",
      () => request("/api/clients", { method: "POST", json: { name: clientName, nip, chargeCompensation: true }, jar }),
      {
        status: 201,
        check: (a) => {
          clientId = a.body?.client?.id;
          return Boolean(clientId) && a.body?.client?.deactivatedOn === null;
        },
      },
    ],
    [
      "deactivation: create open invoice",
      () => request("/api/invoices", { method: "POST", json: { clientId, number, amount: "10", dueDate }, jar }),
      {
        status: 201,
        check: (a) => {
          invoiceId = a.body?.invoice?.id;
          return Boolean(invoiceId);
        },
      },
    ],
    ["deactivation: open invoice blocks -> has_open_invoices", () => deactivation(jar, "PUT")(), blocked],
    ["deactivation: pause the invoice", () => invoiceCall("PUT", "pause")(), { status: 200 }],
    ["deactivation: paused invoice blocks -> has_open_invoices", () => deactivation(jar, "PUT")(), blocked],
    ["deactivation: cancel the invoice", () => invoiceCall("PUT", "cancellation")(), { status: 200 }],
    [
      "deactivation: client without open invoices is deactivated",
      () => deactivation(jar, "PUT")(),
      { status: 200, check: (a) => a.body?.client?.deactivatedOn === daysAgo(0) },
    ],
    [
      "deactivation: restoring invoice of deactivated client -> client_inactive",
      () => invoiceCall("DELETE", "cancellation")(),
      inactive,
    ],
    [
      "deactivation: new invoice for deactivated client -> client_inactive",
      () =>
        request("/api/invoices", {
          method: "POST",
          json: { clientId, number: `FV/D2/${stamp}`, amount: "10", dueDate },
          jar,
        }),
      inactive,
    ],
    [
      "deactivation: same NIP as deactivated client -> duplicate_nip_inactive",
      () =>
        request("/api/clients", {
          method: "POST",
          json: { name: `Inny Usuwany ${stamp}`, nip, chargeCompensation: true },
          jar,
        }),
      { status: 409, check: (a) => a.body?.error === "duplicate_nip_inactive" },
    ],
    [
      "deactivation: deactivated client cannot be edited -> 404",
      () =>
        request(`/api/clients/${clientId}`, {
          method: "PUT",
          json: { name: clientName, nip, chargeCompensation: false },
          jar,
        }),
      { status: 404 },
    ],
    ["deactivation B: cannot deactivate client of A -> 404", () => deactivation(jarB, "PUT")(), { status: 404 }],
    ["deactivation B: cannot restore client of A -> 404", () => deactivation(jarB, "DELETE")(), { status: 404 }],
    [
      "deactivation: restore client",
      () => deactivation(jar, "DELETE")(),
      { status: 200, check: (a) => a.body?.client?.deactivatedOn === null },
    ],
    ["deactivation: restoring an active client -> 404", () => deactivation(jar, "DELETE")(), { status: 404 }],
    [
      "deactivation: restore the cancelled invoice",
      () => invoiceCall("DELETE", "cancellation")(),
      { status: 200, check: (a) => a.body?.invoice?.cancelledOn === null },
    ],
    [
      "deactivation: mark the invoice paid",
      () => request(`/api/invoices/${invoiceId}/payment`, { method: "PUT", json: { paidOn: daysAgo(0) }, jar }),
      { status: 200 },
    ],
    ["deactivation: client with only a paid invoice is deactivated", () => deactivation(jar, "PUT")(), { status: 200 }],
    [
      "deactivation: reopening paid invoice of deactivated client -> client_inactive",
      () => invoiceCall("DELETE", "payment")(),
      inactive,
    ],
    ["deactivation: restore client again", () => deactivation(jar, "DELETE")(), { status: 200 }],
    [
      "deactivation: invalid id -> 404",
      () => request("/api/clients/nie-uuid/deactivation", { method: "PUT", jar }),
      { status: 404 },
    ],
  ];
}

// Needs user B (signed in by clientSteps). Restores the defaults at the end so other groups are not affected.
function settingsSteps() {
  const put = (jar, json) => () => request("/api/settings", { method: "PUT", json, jar });
  const input = (thresholds, annualRate, compensation) => ({
    threshold1: thresholds[0],
    threshold2: thresholds[1],
    threshold3: thresholds[2],
    threshold4: thresholds[3],
    annualRate,
    compensation1: compensation[0],
    compensation2: compensation[1],
    compensation3: compensation[2],
  });
  const settingsA = input(["1", "2", "3", "4"], "10,5", ["100", "200", "300,50"]);
  const settingsB = input(["5", "10", "20", "40"], "8", ["0", "1 000", "2000,01"]);
  const defaults = input(["3", "7", "14", "30"], "13,75", ["170", "297,50", "425"]);
  const saved = (thresholds, annualRateBp, compensationGrosze) => ({
    status: 200,
    check: (a) => JSON.stringify(a.body?.settings) === JSON.stringify({ thresholds, annualRateBp, compensationGrosze }),
  });
  return [
    ["settings API rejects anonymous user", put(new Map(), settingsA), { status: 401 }],
    [
      "settings A: non-increasing thresholds -> 400",
      put(jar, { ...settingsA, threshold2: "1" }),
      { status: 400, check: (a) => a.body?.error === "invalid_input" && Boolean(a.body?.fieldErrors?.threshold2) },
    ],
    ["settings A: save", put(jar, settingsA), saved([1, 2, 3, 4], 1050, [10000, 20000, 30050])],
    ["settings B: save own settings", put(jarB, settingsB), saved([5, 10, 20, 40], 800, [0, 100000, 200001])],
    [
      "settings A: B's save did not change A",
      put(jar, { ...settingsA, annualRate: "10,50" }),
      saved([1, 2, 3, 4], 1050, [10000, 20000, 30050]),
    ],
    ["settings A: restore defaults", put(jar, defaults), saved([3, 7, 14, 30], 1375, [17000, 29750, 42500])],
    ["settings B: restore defaults", put(jarB, defaults), saved([3, 7, 14, 30], 1375, [17000, 29750, 42500])],
  ];
}

const steps = [
  [
    "clients API rejects anonymous user",
    () => request("/api/clients", { method: "POST", json: { name: "x" }, jar: new Map() }),
    { status: 401 },
  ],
  [
    "clients page redirects anonymous user",
    () => request("/clients", { jar: new Map() }),
    { status: 302, location: "/auth/signin" },
  ],
  [
    "history page redirects anonymous user",
    () => request("/history", { jar: new Map() }),
    { status: 302, location: "/auth/signin" },
  ],
  ["home redirects anonymous user", () => request("/"), { status: 302, location: "/auth/signin" }],
  ["signin page renders", () => request("/auth/signin"), { status: 200 }],
  [
    "signup rejects empty password",
    () => request("/api/auth/signup", { method: "POST", form: { email, password: "" } }),
    { status: 302, location: "/auth/signup?error=invalid_input" },
  ],
  [
    "signup creates account",
    () => request("/api/auth/signup", { method: "POST", form: { email, password } }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "signin rejects wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=invalid_credentials" },
  ],
  [
    "signin accepts correct password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/" },
  ],
  ["home renders for signed-in user", () => request("/"), { status: 200 }],
  ["history renders for signed-in user", () => request("/history"), { status: 200 }],
  ["signin page redirects signed-in user", () => request("/auth/signin"), { status: 302, location: "/" }],
  ...clientSteps(),
  ...invoiceSteps(),
  ...settingsSteps(),
  [
    "signout clears session",
    () => request("/api/auth/signout", { method: "POST" }),
    { status: 302, location: "/auth/signin" },
  ],
  ["home redirects after signout", () => request("/"), { status: 302, location: "/auth/signin" }],
];

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || actual.location.startsWith(expected.location)) &&
    (expected.check === undefined || expected.check(actual));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok && typeof actual.body === "object") console.log(`      body ${JSON.stringify(actual.body)}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? ""}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
