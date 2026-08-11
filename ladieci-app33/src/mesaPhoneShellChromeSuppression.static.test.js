// MOBILE_SHELL_POLISH_01 — source-contract tests for the App.jsx <-> ServicioPage
// wiring that lets the Mesa phone shell suppress the global "P" avatar/health
// badge and ServiceStateGate's status/incidents banners. App.jsx and
// ServicioPage.jsx have no mount harness in this project (both are huge,
// heavily-stateful top-level screens) -- same reasoning as
// ServicioPageListosUnificadoWiring.static.test.js and
// ServicioPageMesaBuilderWiring.static.test.js, which this file sits
// alongside. The actual rendered behavior of the piece that DOES have a
// harness (ServiceStateGate's own hideStatusChrome prop) is covered
// separately in serviceStateGateHideStatusChrome.test.js.
const fs = require('fs');
const path = require('path');

const APP = fs.readFileSync(path.join(__dirname, 'App.jsx'), 'utf8');
const SERVICIO_PAGE = fs.readFileSync(path.join(__dirname, 'components/ServicioPage.jsx'), 'utf8');

describe('App.jsx owns mesaPhoneShellActive and reads it everywhere the global chrome renders', () => {
  test('state is declared', () => {
    expect(APP).toMatch(/const \[mesaPhoneShellActive, setMesaPhoneShellActive\] = useState\(false\)/);
  });
  test('OpsHealthBadge is gated on it', () => {
    expect(APP).toMatch(/screen !== "splash" && !mesaPhoneShellActive && <OpsHealthBadge\/>/);
  });
  test('OperationalMenu (the "P" avatar) is gated on it', () => {
    expect(APP).toMatch(/screen !== "splash" && screen !== "booting" && !mesaPhoneShellActive && <OperationalMenu/);
  });
  test('ServiceStateGate receives it as hideStatusChrome', () => {
    expect(APP).toMatch(/<ServiceStateGate[\s\S]{0,300}hideStatusChrome=\{mesaPhoneShellActive\}/);
  });
  test('ServicioPage receives the setter, not the raw value -- it is the one component that actually knows its own width/tab state', () => {
    expect(APP).toMatch(/onMesaPhoneShellActiveChange=\{setMesaPhoneShellActive\}/);
  });
});

describe('ServicioPage.jsx reports showMesaPhoneShell upward instead of only using it locally', () => {
  test('accepts the callback prop', () => {
    expect(SERVICIO_PAGE).toMatch(/onMesaPhoneShellActiveChange/);
  });
  test('reports the current value on every change', () => {
    expect(SERVICIO_PAGE).toMatch(/onMesaPhoneShellActiveChange\?\.\(showMesaPhoneShell\)/);
  });
  test('resets to false on unmount, so leaving Servicio entirely cannot leave the global avatar stuck hidden on other screens', () => {
    expect(SERVICIO_PAGE).toMatch(/return \(\) => onMesaPhoneShellActiveChange\?\.\(false\)/);
  });
});
