import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Dowód hooków agenta (.claude/hooks): prawdziwe skrypty, git i jq na tymczasowym repo.
// Podstawione są tylko `npx` i `npm` (wolne narzędzia): flagują pliki ze znacznikami
// LINT_ERROR / TEST_FAIL / TYPE_ERROR.

const REAL_ROOT = path.resolve(import.meta.dirname, "../..");

const FAKE_NPX = `#!/usr/bin/env bash
# Atrapa npx: tryb --no-install, narzędzie wskazane w argumencie.
[ "$FAKE_NO_TOOLS" = "1" ] && { echo "npx: tool not installed" >&2; exit 1; }
shift # --no-install
tool=$1; shift
has_marker() { grep -l "$1" "$@" 2>/dev/null; }
case "$tool" in
  eslint)
    for f in "$@"; do
      case "$f" in -*) continue ;; esac
      if grep -q LINT_ERROR "$f" 2>/dev/null; then echo "$f: error no-unused-vars"; bad=1; fi
    done
    [ -n "$bad" ] && exit 1 ;;
  vitest)
    shift # related
    for f in "$@"; do
      case "$f" in -*) break ;; esac
      if grep -q TEST_FAIL "$f" 2>/dev/null; then echo "FAIL $f assertion"; exit 1; fi
    done ;;
  astro)
    if grep -rlq TYPE_ERROR --include=*.ts . 2>/dev/null; then echo "astro check: type error"; exit 1; fi ;;
esac
exit 0
`;

const FAKE_NPM = `#!/usr/bin/env bash
if grep -rlq TEST_FAIL --include=*.ts . 2>/dev/null; then echo "npm test: red"; exit 1; fi
exit 0
`;

let sandbox: string;
let stubBin: string;
let tmpHome: string;

function sh(cwd: string, cmd: string) {
  const r = spawnSync("sh", ["-c", cmd], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd}\n${r.stderr}`);
}

let repoCounter = 0;

function makeRepo(name: string) {
  // Licznik: it.each używa tej samej nazwy wielokrotnie.
  const dir = path.join(sandbox, `${name}-${String(repoCounter++)}`);
  mkdirSync(dir, { recursive: true });
  cpSync(path.join(REAL_ROOT, ".claude"), path.join(dir, ".claude"), { recursive: true });
  writeFileSync(path.join(dir, "ok.ts"), "export const ok = 1;\n");
  sh(dir, "git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm init");
  return realpathSync(dir);
}

function run(script: string, repo: string, payload: unknown, env: Record<string, string> = {}, cwd: string = repo) {
  const input = typeof payload === "string" ? payload : JSON.stringify(payload);
  const r = spawnSync(path.join(repo, ".claude/hooks", script), {
    cwd,
    input,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${stubBin}:${process.env.PATH ?? ""}`,
      TMPDIR: tmpHome,
      CLAUDE_PROJECT_DIR: repo,
      ...env,
    },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const edit = (repo: string, rel: string, extra: object = {}) => ({
  cwd: repo,
  tool_name: "Edit",
  tool_input: { file_path: path.join(repo, rel) },
  ...extra,
});

beforeAll(() => {
  sandbox = realpathSync(mkdtempSync(path.join(tmpdir(), "agent-hooks-")));
  tmpHome = path.join(sandbox, "tmp");
  stubBin = path.join(sandbox, "bin");
  mkdirSync(tmpHome);
  mkdirSync(stubBin);
  for (const [name, body] of [
    ["npx", FAKE_NPX],
    ["npm", FAKE_NPM],
  ]) {
    writeFileSync(path.join(stubBin, name), body);
    chmodSync(path.join(stubBin, name), 0o755);
  }
});

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe("PostToolUse lint-edited-file.sh", () => {
  it("blocks with exit 2 and names the file when lint fails", () => {
    const repo = makeRepo("lint-broken");
    writeFileSync(path.join(repo, "bad.ts"), "const x = 1; // LINT_ERROR\n");
    const r = run("lint-edited-file.sh", repo, edit(repo, "bad.ts"));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("bad.ts");
    expect(r.stderr).toContain("no-unused-vars");
  });

  it("passes on a clean file", () => {
    const repo = makeRepo("lint-clean");
    const r = run("lint-edited-file.sh", repo, edit(repo, "ok.ts"));
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
  });

  it("lints .astro files too", () => {
    const repo = makeRepo("lint-astro");
    writeFileSync(path.join(repo, "page.astro"), "<p>LINT_ERROR</p>\n");
    expect(run("lint-edited-file.sh", repo, edit(repo, "page.astro")).code).toBe(2);
  });

  it("skips file types the linter does not cover", () => {
    const repo = makeRepo("lint-skip");
    writeFileSync(path.join(repo, "README.md"), "LINT_ERROR\n");
    expect(run("lint-edited-file.sh", repo, edit(repo, "README.md")).code).toBe(0);
  });

  it("passes when the edited file does not exist", () => {
    const repo = makeRepo("lint-missing");
    expect(run("lint-edited-file.sh", repo, edit(repo, "gone.ts")).code).toBe(0);
  });

  it.each(["{}", "not json", "", '{"tool_input":{}}'])("passes on an empty or invalid payload (%j)", (payload) => {
    const repo = makeRepo("lint-payload");
    expect(run("lint-edited-file.sh", repo, payload).code).toBe(0);
  });

  it("fails visibly when the linter is not installed", () => {
    const repo = makeRepo("lint-no-tool");
    const r = run("lint-edited-file.sh", repo, edit(repo, "ok.ts"), { FAKE_NO_TOOLS: "1" });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("not installed");
  });

  it("resolves a relative path against the payload cwd", () => {
    const repo = makeRepo("lint-relative");
    writeFileSync(path.join(repo, "bad.ts"), "LINT_ERROR\n");
    const payload = { cwd: repo, tool_input: { file_path: "bad.ts" } };
    expect(run("lint-edited-file.sh", repo, payload, {}, tmpHome).code).toBe(2);
  });

  it("checks the checkout of the edited file, not CLAUDE_PROJECT_DIR", () => {
    const repo = makeRepo("lint-checkout");
    const other = makeRepo("lint-checkout-other");
    writeFileSync(path.join(other, "bad.ts"), "LINT_ERROR\n");
    const r = run("lint-edited-file.sh", repo, edit(repo, "ok.ts"), { CLAUDE_PROJECT_DIR: other });
    expect(r.code).toBe(0);
  });

  it("skips a file that belongs to another repository", () => {
    const repo = makeRepo("lint-foreign");
    const foreign = makeRepo("lint-foreign-other");
    writeFileSync(path.join(foreign, "bad.ts"), "LINT_ERROR\n");
    const payload = { cwd: repo, tool_input: { file_path: path.join(foreign, "bad.ts") } };
    expect(run("lint-edited-file.sh", repo, payload).code).toBe(0);
  });
});

describe("PostToolUse related-tests.sh", () => {
  it("blocks with exit 2 when a related test fails", () => {
    const repo = makeRepo("rel-broken");
    writeFileSync(path.join(repo, "bad.ts"), "// TEST_FAIL\n");
    const r = run("related-tests.sh", repo, edit(repo, "bad.ts"));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("bad.ts");
  });

  it("passes on a clean file", () => {
    const repo = makeRepo("rel-clean");
    expect(run("related-tests.sh", repo, edit(repo, "ok.ts")).code).toBe(0);
  });

  it("skips uncovered types and invalid payloads", () => {
    const repo = makeRepo("rel-skip");
    writeFileSync(path.join(repo, "README.md"), "TEST_FAIL\n");
    expect(run("related-tests.sh", repo, edit(repo, "README.md")).code).toBe(0);
    expect(run("related-tests.sh", repo, edit(repo, "gone.ts")).code).toBe(0);
    expect(run("related-tests.sh", repo, "not json").code).toBe(0);
    expect(run("related-tests.sh", repo, {}).code).toBe(0);
  });

  it("fails visibly when the test runner is not installed", () => {
    const repo = makeRepo("rel-no-tool");
    expect(run("related-tests.sh", repo, edit(repo, "ok.ts"), { FAKE_NO_TOOLS: "1" }).code).toBe(2);
  });
});

describe("Stop end-of-turn.sh", () => {
  const stop = (repo: string, extra: object = {}) => ({
    session_id: "s1",
    cwd: repo,
    stop_hook_active: false,
    ...extra,
  });

  it("passes on a clean tree without running any check", () => {
    const repo = makeRepo("stop-clean");
    // Brak zmian: nawet z niedostępnymi narzędziami hook nic nie uruchamia.
    const r = run("end-of-turn.sh", repo, stop(repo), { FAKE_NO_TOOLS: "1" });
    expect(r.code).toBe(0);
  });

  it("blocks on a lint error written without the per-edit hook", () => {
    const repo = makeRepo("stop-bypass");
    writeFileSync(path.join(repo, "shell.ts"), "LINT_ERROR\n");
    const r = run("end-of-turn.sh", repo, stop(repo));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("shell.ts");
  });

  it("blocks on a failing unit test and on a type error", () => {
    const repo = makeRepo("stop-tests");
    writeFileSync(path.join(repo, "t.ts"), "// TEST_FAIL\n");
    expect(run("end-of-turn.sh", repo, stop(repo)).stderr).toContain("Unit tests fail");
    const repo2 = makeRepo("stop-types");
    writeFileSync(path.join(repo2, "t.ts"), "// TYPE_ERROR\n");
    expect(run("end-of-turn.sh", repo2, stop(repo2)).stderr).toContain("astro check fails");
  });

  it("passes when changed files are clean", () => {
    const repo = makeRepo("stop-green");
    writeFileSync(path.join(repo, "new.ts"), "export const a = 1;\n");
    expect(run("end-of-turn.sh", repo, stop(repo)).code).toBe(0);
  });

  it("lets the agent finish when stop_hook_active is set", () => {
    const repo = makeRepo("stop-retry");
    writeFileSync(path.join(repo, "shell.ts"), "LINT_ERROR\n");
    expect(run("end-of-turn.sh", repo, stop(repo, { stop_hook_active: true })).code).toBe(0);
  });

  it("lets the agent finish when a Cursor loop_count is set", () => {
    const repo = makeRepo("stop-loop");
    writeFileSync(path.join(repo, "shell.ts"), "LINT_ERROR\n");
    expect(run("end-of-turn.sh", repo, stop(repo, { loop_count: 1 })).code).toBe(0);
  });

  it.each(["{}", "not json", ""])("does not crash on an empty or invalid payload (%j)", (payload) => {
    const repo = makeRepo("stop-payload");
    expect(run("end-of-turn.sh", repo, payload, {}, repo).code).toBe(0);
  });

  it("fails visibly when the linter is not installed", () => {
    const repo = makeRepo("stop-no-tool");
    writeFileSync(path.join(repo, "new.ts"), "export const a = 1;\n");
    const r = run("end-of-turn.sh", repo, stop(repo), { FAKE_NO_TOOLS: "1" });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("ESLint errors");
  });

  it("sweeps a sibling worktree registered by the per-edit hook", () => {
    const repo = makeRepo("stop-main");
    const sibling = path.join(sandbox, "stop-sibling");
    sh(repo, `git worktree add -q ${sibling} -b sibling`);
    writeFileSync(path.join(sibling, "bad.ts"), "LINT_ERROR\n");
    // Hook per-edit rejestruje checkout siostrzanego worktree dla tej sesji.
    run("lint-edited-file.sh", repo, edit(sibling, "bad.ts", { cwd: repo, session_id: "sibling-session" }));
    const r = run("end-of-turn.sh", repo, stop(repo, { session_id: "sibling-session" }));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("bad.ts");
  });
});

describe("settings.json commands", () => {
  it("reaches an executable script from a worktree even when CLAUDE_PROJECT_DIR is stale", () => {
    const repo = makeRepo("cfg-main");
    const worktree = path.join(sandbox, "cfg-worktree");
    sh(repo, `git worktree add -q ${worktree} -b cfg`);
    const settings = JSON.parse(readFileSync(path.join(REAL_ROOT, ".claude/settings.json"), "utf8")) as {
      hooks: Record<string, { hooks: { command: string }[] }[]>;
    };
    const commands = Object.values(settings.hooks).flatMap((groups) =>
      groups.flatMap((g) => g.hooks.map((h) => h.command)),
    );
    expect(commands).toHaveLength(3);
    for (const command of commands) {
      const r = spawnSync("sh", ["-c", command], {
        cwd: worktree,
        input: "{}",
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${stubBin}:${process.env.PATH ?? ""}`,
          TMPDIR: tmpHome,
          CLAUDE_PROJECT_DIR: "/nonexistent",
        },
      });
      // 127 = skrypt nie został znaleziony, 126 = brak uprawnień do wykonania.
      expect(r.status, `${command}\n${r.stderr}`).toBe(0);
    }
  });
});
