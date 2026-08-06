// AUTH_BOOTSTRAP_ORDERS_RETRY_BUG — source-contract tests.
//
// App.jsx has never been render-tested (no WebSocket/Supabase realtime mock
// harness exists for it in this repo), and building one from scratch is out
// of proportion to this fix. These are static, source-level assertions —
// the same convention already used across this repo (authV2Cutover.static.
// test.js, the backend's migration .static.test.js files) for contracts that
// are cheap and reliable to prove from source text but expensive to render.
// The actual runtime behavior (order appears in Cocina after a real login,
// no duplicate fetch, no loop) is verified live against real staging in the
// deploy report for this fix, not simulated here.
const fs = require("fs");
const path = require("path");
const appSrc = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");

// Isolate the Realtime+initial-load effect's CODE (starting at the real
// `useEffect(()=>{`, not the explanatory comment above it -- the comment
// itself mentions api.getOrdenes() in prose, which would otherwise be
// matched first) so assertions can't accidentally match an unrelated effect
// elsewhere in this large file.
const markerIdx = appSrc.indexOf("Supabase Realtime + initial load");
const effectStart = appSrc.indexOf("useEffect(()=>{", markerIdx);
const effectEnd = appSrc.indexOf("},[pinUnlocked]);", effectStart);
const effectBody = appSrc.slice(effectStart, effectEnd + "},[pinUnlocked]);".length);

describe("1. mount before a token exists never fetches orders at all", () => {
  test("the effect returns immediately when pinUnlocked is false, before any api.getOrdenes() call", () => {
    const gateIdx = effectBody.indexOf("if (!pinUnlocked) return undefined;");
    const fetchIdx = effectBody.indexOf("api.getOrdenes()");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(fetchIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(fetchIdx);
  });
});

describe("2-3. the fetch re-runs exactly once when auth becomes ready, via React's own effect re-run, not an artificial timer", () => {
  test("pinUnlocked is a real effect dependency, so login (setPinUnlocked(true)) re-triggers this effect", () => {
    expect(effectBody.endsWith("},[pinUnlocked]);")).toBe(true);
  });

  test("no artificial delay/poll was added to coordinate the retry with auth", () => {
    // The pre-existing 5s fallback poll (WebSocket-down recovery) is untouched
    // and is not what fixes this bug -- the retry comes from the dependency
    // array alone. Assert no NEW setTimeout/setInterval was introduced beyond
    // the two that already existed (heartbeat, fallbackPoll).
    const setTimeoutCount = (effectBody.match(/setTimeout\(/g) || []).length;
    const setIntervalCount = (effectBody.match(/setInterval\(/g) || []).length;
    expect(setIntervalCount).toBe(2); // heartbeat + fallbackPoll, both pre-existing
    expect(setTimeoutCount).toBe(1); // reconnect backoff on ws.onclose, pre-existing
  });
});

describe("6. no duplicate fetch or leaked timers across a pinUnlocked transition", () => {
  test("the effect's cleanup tears down the websocket, heartbeat, and fallback poll on every re-run", () => {
    const cleanupIdx = effectBody.lastIndexOf("return () => {");
    const cleanupBody = effectBody.slice(cleanupIdx);
    expect(cleanupBody).toMatch(/ws\.close\(\)/);
    expect(cleanupBody).toMatch(/clearInterval\(heartbeat\)/);
    expect(cleanupBody).toMatch(/clearInterval\(fallbackPoll\)/);
  });
});

describe("7. logout resets the order state, not just the token", () => {
  test("doOperationalLogout clears ordenes and flips pinUnlocked back to false", () => {
    const idx = appSrc.indexOf("const doOperationalLogout");
    const body = appSrc.slice(idx, appSrc.indexOf("}, []);", idx));
    expect(body).toMatch(/setPinUnlocked\(false\)/);
    expect(body).toMatch(/setOrdenes\(\[\]\)/);
  });
});
