/**
 * [DEADLINE-HORA 2026-09-22] La preview di Nuevo Pedido manda `hora`.
 *
 * Contratto di prodotto: delivery_deadline_at = max(ts + 55', hora promessa).
 * Perché l'operatore veda in anteprima lo STESSO límite che il backend scriverà,
 * la preview deve ricevere la hora che sta digitando.
 *
 * Tre invarianti che questo gate difende:
 *   1. `hora` viaggia nel payload della preview;
 *   2. NON parte una request per ogni tasto (debounce + solo HH:MM valida);
 *   3. nessun feedback loop: la preview può scrivere `hora` una sola volta e mai
 *      dopo che l'operatore l'ha toccata.
 *
 * La risoluzione Madrid / mezzanotte / DST NON deve comparire nel frontend: vive
 * solo in core/delivery/deadline.js lato backend. Il punto 4 lo verifica.
 */
const fs = require("fs");
const path = require("path");
const read = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

const modalSrc = read("components/NuevoPedidoModal.jsx");
const apiSrc = read("api.js");

describe("1 — hora nel payload della preview", () => {
  test("previewDeliveryV1 viene chiamata con zona E hora", () => {
    expect(modalSrc).toMatch(/api\.previewDeliveryV1\(\{\s*zona:\s*fdv1Zona,\s*hora:\s*fdv1HoraDebounced\s*\|\|\s*undefined\s*\}\)/);
  });

  test("api.previewDeliveryV1 inoltra il body intero (hora inclusa)", () => {
    expect(apiSrc).toMatch(/previewDeliveryV1:\s*function\(body = \{\}\)\s*\{\s*return proxyPost\(\{ action: "previewDeliveryV1", \.\.\.body \}\);/);
  });

  test("hora è nelle dipendenze dell'effetto: cambiarla rilancia la preview", () => {
    const deps = modalSrc.match(/\}, \[visible, isFdv1Delivery, fdv1Zona[^\]]*\]/);
    expect(deps).not.toBeNull();
    expect(deps[0]).toContain("fdv1HoraDebounced");
  });
});

describe("2 — nessuna request per ogni tasto", () => {
  test("solo una HH:MM valida finisce nel payload", () => {
    expect(modalSrc).toMatch(/const fdv1HoraValida = \/\^\(\[01\]\?\\d\|2\[0-3\]\):\[0-5\]\\d\$\/\.test/);
  });

  test("esiste un debounce fra 300 e 400 ms sulla hora", () => {
    const m = modalSrc.match(/setTimeout\(\(\) => setFdv1HoraDebounced\(fdv1HoraValida\), (\d+)\)/);
    expect(m).not.toBeNull();
    const ms = Number(m[1]);
    expect(ms).toBeGreaterThanOrEqual(300);
    expect(ms).toBeLessThanOrEqual(400);
  });

  test("il timer del debounce viene ripulito (nessun leak fra digitazioni)", () => {
    expect(modalSrc).toMatch(/return \(\) => clearTimeout\(t\);\s*\n\s*\}, \[fdv1HoraValida\]\)/);
  });

  // Simulazione della regola di validità: solo gli orari completi passano.
  const valida = (h) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(h || "").trim());
  test("orari a metà digitazione non generano payload", () => {
    ["", "2", "21", "21:", "21:6", "abc", "25:00", "21:99"].forEach(h => expect(valida(h)).toBe(false));
    ["21:30", "9:05", "00:00", "23:59"].forEach(h => expect(valida(h)).toBe(true));
  });
});

describe("3 — nessun feedback loop preview → hora → preview", () => {
  test("la preview scrive hora solo una volta e solo se l'operatore non l'ha toccata", () => {
    expect(modalSrc).toMatch(
      /if \(res\.hora_preview && !fdv1HoraPrefilled\.current && !horaCustom\.current && !horaTouchedByOperator\)/
    );
  });

  test("la guardia di prefill viene armata prima di scrivere hora", () => {
    const blocco = modalSrc.match(/if \(res\.hora_preview && !fdv1HoraPrefilled[\s\S]{0,200}?\}/)[0];
    expect(blocco.indexOf("fdv1HoraPrefilled.current = true")).toBeLessThan(blocco.indexOf("setHora(res.hora_preview)"));
  });

  test("la guardia si resetta solo alla chiusura del modal", () => {
    expect(modalSrc).toMatch(/useEffect\(\(\) => \{ if \(!visible\) fdv1HoraPrefilled\.current = false; \}, \[visible\]\)/);
  });

  // Il punto fisso: una volta che hora ≥ now+55, max(now+55, hora) === hora.
  // La preview non può quindi far oscillare il campo, nemmeno senza le guardie.
  test("max(now+55, hora) è un punto fisso una volta superato il pavimento", () => {
    const nowMs = Date.parse("2026-09-22T16:00:00Z");
    const floor = nowMs + 55 * 60000;
    const promessa = Date.parse("2026-09-22T19:30:00Z"); // 21:30 Madrid
    const step = (h) => Math.max(floor, h);
    expect(step(promessa)).toBe(promessa);
    expect(step(step(promessa))).toBe(promessa); // idempotente: nessuna oscillazione
  });
});

describe("4 — la risoluzione oraria resta nel backend", () => {
  test("il frontend non duplica la risoluzione Madrid/mezzanotte/DST della deadline", () => {
    // Nessun calcolo di deadline dalla hora nel modal: solo invio del valore grezzo.
    expect(modalSrc).not.toMatch(/madridWallToInstant|legacyDeadlineFromHora|effectiveDeadline/);
    // E nessuna aritmetica locale sui 55 minuti per derivare il límite.
    expect(modalSrc).not.toMatch(/55\s*\*\s*60000/);
  });

  test("il límite mostrato viene sempre dalla risposta del backend", () => {
    expect(modalSrc).toMatch(/fdv1Preview\.hora_preview/);
  });
});
