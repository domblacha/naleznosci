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
    ["user B: same NIP as A is allowed", post(jarB, { name: nameA, nip: "1234563218" }), { status: 201 }],
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
  ["signin page redirects signed-in user", () => request("/auth/signin"), { status: 302, location: "/" }],
  ...clientSteps(),
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
