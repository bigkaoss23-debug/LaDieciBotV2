import assert from "node:assert";
import { resolveItemProductNames } from "../itemDisplay.js";

assert.deepEqual(
  resolveItemProductNames({ classicName: "Prosciutto e funghi", fantasyName: "El Último 10", n: "ignored" }),
  { primary: "Prosciutto e funghi", secondary: "El Último 10" }
);
assert.deepEqual(
  resolveItemProductNames({ classicName: "Margherita", n: "margherita" }),
  { primary: "Margherita", secondary: "" }
);
assert.deepEqual(
  resolveItemProductNames({ n: "El Pelusa" }),
  { primary: "El Pelusa", secondary: "" }
);
assert.deepEqual(
  resolveItemProductNames({ sub: "Napoletana", n: "Napoli" }),
  { primary: "Napoli", secondary: "" }
);
assert.deepEqual(
  resolveItemProductNames({}),
  { primary: "", secondary: "" }
);
assert.deepEqual(
  resolveItemProductNames(null),
  { primary: "", secondary: "" }
);
assert.deepEqual(
  resolveItemProductNames({ sub: "cortar en 4" }),
  { primary: "", secondary: "" }
);
assert.deepEqual(
  resolveItemProductNames({ sub: "+Kinder ×2", n: "KitKat" }),
  { primary: "KitKat", secondary: "" }
);
assert.deepEqual(
  resolveItemProductNames({ snapshotVersion: 1, sub: "+Olive", fantasyName: "El Pelusa" }),
  { primary: "El Pelusa", secondary: "" }
);

console.log("itemProductNames: 9 passed");
