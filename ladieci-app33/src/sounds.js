const BASE = "/sounds/";

const _audio = {};
const _load = (key, file) => {
  if (_audio[key]) return _audio[key];
  const a = new Audio(BASE + file);
  a.preload = "auto";
  _audio[key] = a;
  return a;
};

const _play = (key, file, volume = 1.0) => {
  try {
    const a = _load(key, file);
    const clone = a.cloneNode();
    clone.volume = volume;
    clone.play().catch(() => {});
  } catch (e) {}
};

const Suoni = {
  preload() {
    _load("bell",       "bell.mp3");
    _load("notifica_wa","notifica_wa.mp3");
    _load("preguntas",  "preguntas.mp3");
    _load("conferma",   "conferma.mp3");
    _load("alarm10",    "alarm10.mp3");
    _load("consegna",   "consegna.mp3");
  },

  campanellaDieci()   { _play("alarm10",    "alarm10.mp3",    1.0); },
  nuovoOrdineWA()     { _play("notifica_wa","notifica_wa.mp3",1.0); },
  nuovaPreguntaWA()   { _play("preguntas",  "preguntas.mp3",  0.9); },
  conferma()          { _play("conferma",    "conferma.mp3",   1.0); },
  confermaSoft()      { _play("notifica_wa", "notifica_wa.mp3", 0.03); }, // sblocco audio — quasi impercettibile
  consegnaSoft()      { _play("consegna",    "consegna.mp3",    0.03); }, // sblocco consegna.mp3 — quasi impercettibile
  consegnaEffettuata(){ _play("consegna",   "consegna.mp3",   1.0); },
  nuovoOrdineDelivery(){ _play("consegna",  "consegna.mp3",   1.0); },
  errore()            { _play("alarm10",    "alarm10.mp3",    1.0); },
};

export default Suoni;
