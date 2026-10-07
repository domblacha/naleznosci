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
    ["payment A: invalid id -> 404", () => put(jar, "nie-uuid", daysAgo(0))(), { status: 404 }],
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
