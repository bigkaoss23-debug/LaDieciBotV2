import { equalShares } from "./TabMessa";

const fs = require("fs");
const path = require("path");
const source = fs.readFileSync(path.join(__dirname, "TabMessa.jsx"), "utf8");

describe("Mesa equal split preview", () => {
  test("splits 50 euro across five covers", () => {
    expect(equalShares(50, 5)).toEqual([10, 10, 10, 10, 10]);
  });

  test("keeps uneven cents exact and deterministic", () => {
    const shares = equalShares(50, 3);
    expect(shares).toEqual([16.67, 16.67, 16.66]);
    expect(Math.round(shares.reduce((sum, share) => sum + share, 0) * 100)).toBe(5000);
  });

  test("handles an early payer by dividing only the residual", () => {
    expect(equalShares(38, 4)).toEqual([9.5, 9.5, 9.5, 9.5]);
  });
});

describe("Mesa closed-account boundary", () => {
  test("full payment closes without an intermediate occupied-table workflow", () => {
    expect(source).toContain('outstandingAfter === 0 ? "Cuenta cerrada."');
    expect(source).not.toContain("paid_occupied");
    expect(source).not.toContain("Mesa libre");
    expect(source).not.toContain("Abrir cuenta nueva");
    expect(source).not.toContain("sigue ocupada");
  });
});
