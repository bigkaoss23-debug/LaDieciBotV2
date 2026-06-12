// Unit test puro della order state machine (core/orders/stateMachine.js).
// Solo logica: nessun React, nessuna API, nessun DB, nessun componente.
// Runner: CRA jest (il modulo è ESM → import, non require come gli util CJS).
// Esecuzione mirata:
//   CI=true npx react-scripts test --watchAll=false src/core/orders/stateMachine.test.js
//
// Copre: matrice transizioni valide/illegali, terminali, same-state, normalize,
// helper isTerminalState/nextStates/isDeliveryState + helper delivery su order obj.

import {
  ORDER_STATES,
  VALID_ORDER_TRANSITIONS,
  canTransition,
  nextStates,
  isTerminalState,
  isDeliveryState,
  isWaitingDriverState,
  isDriverOnTheWayState,
  isDeliveryActiveState,
} from "./stateMachine";

const {
  POR_CONFIRMAR,
  EN_COCINA,
  LISTO,
  EN_ENTREGA,
  RETIRADO,
  COMPLETATO,
  CHIUSO_FORZATO,
} = ORDER_STATES;

describe("VALID_ORDER_TRANSITIONS — matrice transizioni valide", () => {
  const matrix = {
    [POR_CONFIRMAR]: [EN_COCINA, CHIUSO_FORZATO],
    [EN_COCINA]: [LISTO, EN_ENTREGA, RETIRADO, CHIUSO_FORZATO],
    [LISTO]: [EN_COCINA, EN_ENTREGA, RETIRADO, CHIUSO_FORZATO],
    [EN_ENTREGA]: [RETIRADO, CHIUSO_FORZATO],
    [RETIRADO]: [RETIRADO],
  };

  for (const [from, targets] of Object.entries(matrix)) {
    test(`${from} consente esattamente [${targets.join(", ")}]`, () => {
      // nextStates combacia con la matrice attesa (set-equality)
      expect([...nextStates(from)].sort()).toEqual([...targets].sort());
      // ogni target dichiarato è una transizione legale
      for (const to of targets) {
        expect(canTransition(from, to)).toBe(true);
      }
    });
  }

  test("la tabella del modulo coincide con la matrice attesa", () => {
    for (const [from, targets] of Object.entries(matrix)) {
      expect([...VALID_ORDER_TRANSITIONS[from]].sort()).toEqual([...targets].sort());
    }
  });
});

describe("Stati terminali", () => {
  test("COMPLETATO e CHIUSO_FORZATO non hanno transizioni in uscita", () => {
    expect([...nextStates(COMPLETATO)]).toEqual([]);
    expect([...nextStates(CHIUSO_FORZATO)]).toEqual([]);
  });

  test("isTerminalState true per RETIRADO/COMPLETATO/CHIUSO_FORZATO, false per gli attivi", () => {
    expect(isTerminalState(RETIRADO)).toBe(true);
    expect(isTerminalState(COMPLETATO)).toBe(true);
    expect(isTerminalState(CHIUSO_FORZATO)).toBe(true);
    for (const s of [POR_CONFIRMAR, EN_COCINA, LISTO, EN_ENTREGA]) {
      expect(isTerminalState(s)).toBe(false);
    }
  });

  test("nessuna transizione esce da un terminale verso uno stato attivo", () => {
    const activos = [POR_CONFIRMAR, EN_COCINA, LISTO, EN_ENTREGA];
    for (const term of [COMPLETATO, CHIUSO_FORZATO]) {
      for (const to of activos) {
        expect(canTransition(term, to)).toBe(false);
      }
    }
    // RETIRADO consente solo self, mai uno stato attivo
    for (const to of activos) {
      expect(canTransition(RETIRADO, to)).toBe(false);
    }
  });
});

describe("Transizioni illegali", () => {
  const illegal = [
    // salti dallo stato iniziale
    [POR_CONFIRMAR, LISTO],
    [POR_CONFIRMAR, EN_ENTREGA],
    [POR_CONFIRMAR, RETIRADO],
    // riapertura da terminale RETIRADO
    [RETIRADO, EN_COCINA],
    [RETIRADO, LISTO],
    [RETIRADO, EN_ENTREGA],
    [RETIRADO, POR_CONFIRMAR],
    // ritorni illegali da EN_ENTREGA
    [EN_ENTREGA, LISTO],
    [EN_ENTREGA, EN_COCINA],
    [EN_ENTREGA, POR_CONFIRMAR],
    // altri indietro non previsti
    [EN_COCINA, POR_CONFIRMAR],
    [LISTO, POR_CONFIRMAR],
  ];

  for (const [from, to] of illegal) {
    test(`${from} -> ${to} è illegale`, () => {
      expect(canTransition(from, to)).toBe(false);
    });
  }
});

describe("Same-state (X -> X)", () => {
  test("ogni stato conosciuto consente la transizione verso se stesso", () => {
    for (const s of Object.values(ORDER_STATES)) {
      expect(canTransition(s, s)).toBe(true);
    }
  });
});

describe("normalizeOrderState dentro canTransition", () => {
  test("case-insensitive: lowercase trattato come uppercase", () => {
    expect(canTransition("listo", "en_entrega")).toBe(true);
    expect(canTransition("EN_COCINA", "listo")).toBe(true);
  });

  test("trim: spazi attorno allo stato non rompono il match", () => {
    expect(canTransition("  EN_COCINA  ", "LISTO")).toBe(true);
    expect(canTransition("LISTO", "  RETIRADO ")).toBe(true);
  });

  test("null/undefined/'' → nessuna transizione valida", () => {
    expect(canTransition(null, LISTO)).toBe(false);
    expect(canTransition(EN_COCINA, null)).toBe(false);
    expect(canTransition(undefined, LISTO)).toBe(false);
    expect(canTransition("", LISTO)).toBe(false);
    expect(canTransition(LISTO, "")).toBe(false);
  });

  test("stato sconosciuto → false (e nextStates vuoto)", () => {
    expect(canTransition("UNKNOWN", EN_COCINA)).toBe(false);
    expect(canTransition(EN_COCINA, "PIZZA")).toBe(false);
    expect([...nextStates("UNKNOWN")]).toEqual([]);
  });
});

describe("isDeliveryState (stringa)", () => {
  test("true per EN_COCINA/LISTO/EN_ENTREGA", () => {
    expect(isDeliveryState(EN_COCINA)).toBe(true);
    expect(isDeliveryState(LISTO)).toBe(true);
    expect(isDeliveryState(EN_ENTREGA)).toBe(true);
  });
  test("false per POR_CONFIRMAR e RETIRADO", () => {
    expect(isDeliveryState(POR_CONFIRMAR)).toBe(false);
    expect(isDeliveryState(RETIRADO)).toBe(false);
  });
});

describe("Helper delivery su order object (estado + tipo_consegna)", () => {
  test("isWaitingDriverState: DOMICILIO + LISTO → true; RITIRO o altro stato → false", () => {
    expect(isWaitingDriverState({ estado: LISTO, tipo_consegna: "DOMICILIO" })).toBe(true);
    expect(isWaitingDriverState({ estado: LISTO, tipo_consegna: "RITIRO" })).toBe(false);
    expect(isWaitingDriverState({ estado: EN_ENTREGA, tipo_consegna: "DOMICILIO" })).toBe(false);
  });

  test("isDriverOnTheWayState: DOMICILIO + EN_ENTREGA → true; altrimenti false", () => {
    expect(isDriverOnTheWayState({ estado: EN_ENTREGA, tipo_consegna: "DOMICILIO" })).toBe(true);
    expect(isDriverOnTheWayState({ estado: EN_ENTREGA, tipo_consegna: "RITIRO" })).toBe(false);
    expect(isDriverOnTheWayState({ estado: LISTO, tipo_consegna: "DOMICILIO" })).toBe(false);
  });

  test("isDeliveryActiveState: DOMICILIO non terminale → true; terminale o RITIRO → false", () => {
    expect(isDeliveryActiveState({ estado: EN_COCINA, tipo_consegna: "DOMICILIO" })).toBe(true);
    expect(isDeliveryActiveState({ estado: EN_ENTREGA, tipo_consegna: "DOMICILIO" })).toBe(true);
    expect(isDeliveryActiveState({ estado: RETIRADO, tipo_consegna: "DOMICILIO" })).toBe(false);
    expect(isDeliveryActiveState({ estado: EN_COCINA, tipo_consegna: "RITIRO" })).toBe(false);
  });

  test("tipo_consegna assente → helper delivery false", () => {
    expect(isWaitingDriverState({ estado: LISTO })).toBe(false);
    expect(isDriverOnTheWayState({ estado: EN_ENTREGA })).toBe(false);
    expect(isDeliveryActiveState({ estado: EN_COCINA })).toBe(false);
  });
});
