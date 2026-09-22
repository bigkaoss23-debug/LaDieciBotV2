/**
 * [HOTFIX 2026-09-22] `modificaOrden` esplodeva prima di qualsiasi request.
 *
 * `ServicioPage.jsx` chiamava `logLegacyBypass({...})` senza averlo importato da
 * `../core/orders`. A runtime: `ReferenceError: logLegacyBypass is not defined`,
 * lanciato DOPO `setOrdenModifica(null)` — quindi il modal "Modifica ordine" si
 * chiudeva (l'operatore credeva di aver salvato) e poi la funzione moriva prima
 * del patch ottimistico e prima delle due PATCH backend. Nessuna richiesta HTTP,
 * nessun toast, nessuna traccia in DB: ogni modifica di ordine (hora, items,
 * indirizzo, zona) veniva persa in silenzio.
 *
 * Introdotto da f44fbd9 (2026-09-22 09:12, delivery-refactor) e live tutto il
 * giorno. Il bundle compilava senza un fiato: `react-scripts build` non fa
 * type-check e la regola `no-undef` di ESLint è disattivata sui file JSX in CRA,
 * quindi nessun gate esistente poteva accorgersene.
 *
 * Questo test NON introduce un'architettura di lint: legge il sorgente di
 * ServicioPage.jsx ed estrae i soli helper del dominio ordini — la famiglia
 * `log*` / `build*` / `observe*`, cioè esattamente i simboli che il file importa
 * da `../core/orders` — verificando che ognuno di quelli USATI sia anche
 * DICHIARATO (importato o definito localmente). È un controllo su un file e su
 * una famiglia di nomi, non un linter generico.
 */
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "components/ServicioPage.jsx"), "utf8");
const coreOrders = require("../core/orders");

// Simboli portati in scope: import con graffe, import default, e const locali.
const dichiarati = new Set();
for (const m of src.matchAll(/import\s+\{([^}]+)\}\s+from/g)) {
  m[1].split(",").forEach(x => dichiarati.add(x.trim().split(/\s+as\s+/).pop()));
}
for (const m of src.matchAll(/import\s+(\w+)\s+from/g)) dichiarati.add(m[1]);
for (const m of src.matchAll(/(?:const|let|function)\s+(\w+)\s*[=(]/g)) dichiarati.add(m[1]);

// Helper del dominio ordini effettivamente CHIAMATI nel file.
const usati = [...new Set(
  [...src.matchAll(/\b((?:log|build|observe)[A-Z]\w*)\s*\(/g)].map(m => m[1])
)];

describe("ServicioPage: ogni helper del dominio ordini usato è in scope", () => {
  test("nessun simbolo log*/build*/observe* usato senza essere importato o definito", () => {
    const mancanti = usati.filter(u => !dichiarati.has(u));
    // Messaggio esplicito: è il modo in cui il bug si sarebbe manifestato.
    expect({ mancanti, spiegazione: "a runtime diventerebbero ReferenceError" })
      .toEqual({ mancanti: [], spiegazione: "a runtime diventerebbero ReferenceError" });
  });

  test("il file usa davvero questi helper (il test non è vacuo)", () => {
    expect(usati.length).toBeGreaterThan(3);
  });
});

describe("il caso specifico che ha rotto la produzione", () => {
  test("logLegacyBypass è usato in ServicioPage", () => {
    expect(src).toMatch(/logLegacyBypass\s*\(/);
  });

  test("logLegacyBypass è importato da ../core/orders", () => {
    const riga = src.split("\n").find(l => l.includes("from '../core/orders'"));
    expect(riga).toBeDefined();
    expect(riga).toMatch(/\blogLegacyBypass\b/);
  });

  test("core/orders lo esporta davvero come funzione", () => {
    expect(typeof coreOrders.logLegacyBypass).toBe("function");
  });

  test("ogni helper importato da core/orders esiste nel modulo (nessun import fantasma)", () => {
    const riga = src.split("\n").find(l => l.includes("from '../core/orders'"));
    const importati = riga.match(/\{([^}]+)\}/)[1].split(",").map(s => s.trim().split(/\s+as\s+/).pop());
    const inesistenti = importati.filter(n => coreOrders[n] === undefined);
    expect(inesistenti).toEqual([]);
  });
});
