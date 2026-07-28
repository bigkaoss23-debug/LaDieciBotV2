// S2-7D6E5 — the canonical PIN pad, tested for real (react-dom + act, no
// @testing-library, same house style as economiaLedgerGate.test.js).
//
// This is the ONE component every PIN entry point in the app must render
// through. These tests pin the contract every caller (login, admin step-up,
// new/confirm PIN rotation) relies on: digits 0-9, masked dots, backspace,
// clear, no device keyboard, submit gating, loading/error treatment.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

global.IS_REACT_ACT_ENVIRONMENT = true;

import PinPad from './PinPad';

function Harness({ minLength = 6, maxLength = 12, ...rest }) {
  const [value, setValue] = React.useState('');
  return (
    <PinPad
      title="Test PIN" value={value} onChange={setValue}
      minLength={minLength} maxLength={maxLength}
      {...rest}
    />
  );
}

async function mount(props = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<Harness {...props} />); });
  return { container, root };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

function digitButtons(container) {
  return Array.from(container.querySelectorAll('button')).filter((b) => /^[0-9]$/.test(b.textContent));
}
function pressDigits(container, digits) {
  const btns = digitButtons(container);
  for (const d of String(digits)) {
    const btn = btns.find((b) => b.textContent === d);
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  }
}
function findByText(container, text) {
  return Array.from(container.querySelectorAll('button')).find((b) => b.textContent === text);
}
function click(el) { act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); }
function dots(container) { return container.querySelectorAll('[data-testid="pinpad-dots"] > div').length; }

describe('PinPad — no device keyboard, ever', () => {
  test('renders zero <input> elements', async () => {
    const { container, root } = await mount();
    expect(container.querySelectorAll('input').length).toBe(0);
    unmount(container, root);
  });

  test('exactly ten digit buttons (0-9) plus backspace and clear', async () => {
    const { container, root } = await mount();
    expect(digitButtons(container).length).toBe(10);
    expect(container.querySelectorAll('button[aria-label="Borrar"]').length).toBe(1);
    expect(container.querySelectorAll('button[aria-label="Vaciar"]').length).toBe(1);
    unmount(container, root);
  });
});

describe('PinPad — digit entry and masking', () => {
  test('pressing digits builds the value, shown only as masked dots', async () => {
    const { container, root } = await mount({ minLength: 6, maxLength: 6 });
    pressDigits(container, '284739');
    expect(dots(container)).toBe(6);
    expect(container.textContent).not.toMatch(/284739/);
    unmount(container, root);
  });

  test('dot count grows past minLength for legacy longer PINs', async () => {
    const { container, root } = await mount({ minLength: 6, maxLength: 12 });
    pressDigits(container, '123456789');
    expect(dots(container)).toBe(9);
    unmount(container, root);
  });

  test('input is capped at maxLength — an 11th digit on a 10-digit cap is ignored', async () => {
    const { container, root } = await mount({ minLength: 6, maxLength: 10 });
    pressDigits(container, '12345678901');
    expect(dots(container)).toBe(10);
    unmount(container, root);
  });
});

describe('PinPad — backspace and clear', () => {
  // minLength: 0 here so the dot count reflects the raw value length exactly —
  // the "dots pad up to minLength" behavior has its own test above.
  test('backspace removes exactly the last digit', async () => {
    const { container, root } = await mount({ minLength: 0, maxLength: 6 });
    pressDigits(container, '2847');
    click(container.querySelector('button[aria-label="Borrar"]'));
    expect(dots(container)).toBe(3);
    unmount(container, root);
  });

  test('clear empties the whole value in one action', async () => {
    const { container, root } = await mount({ minLength: 0, maxLength: 6 });
    pressDigits(container, '284739');
    click(container.querySelector('button[aria-label="Vaciar"]'));
    expect(dots(container)).toBe(0);
    unmount(container, root);
  });
});

describe('PinPad — submit gating, no auto-submit', () => {
  test('submit is disabled below minLength', async () => {
    const onSubmit = jest.fn();
    const { container, root } = await mount({ minLength: 6, maxLength: 12, submitLabel: 'Entrar', onSubmit });
    pressDigits(container, '2847');
    const btn = findByText(container, 'Entrar');
    expect(btn.disabled).toBe(true);
    unmount(container, root);
  });

  test('reaching minLength enables submit but never fires it automatically', async () => {
    const onSubmit = jest.fn();
    const { container, root } = await mount({ minLength: 6, maxLength: 12, submitLabel: 'Entrar', onSubmit });
    pressDigits(container, '284739');
    const btn = findByText(container, 'Entrar');
    expect(btn.disabled).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
    click(btn);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    unmount(container, root);
  });

  test('a fixed-length pad (minLength === maxLength) disables submit until exactly complete', async () => {
    const onSubmit = jest.fn();
    const { container, root } = await mount({ minLength: 6, maxLength: 6, submitLabel: 'Continuar', onSubmit });
    pressDigits(container, '28473');
    expect(findByText(container, 'Continuar').disabled).toBe(true);
    pressDigits(container, '9');
    expect(findByText(container, 'Continuar').disabled).toBe(false);
    unmount(container, root);
  });
});

describe('PinPad — loading and error states', () => {
  test('loading disables every digit/backspace/clear button and shows the loading label', async () => {
    const { container, root } = await mount({ loading: true, loadingLabel: 'Guardando…' });
    expect(container.textContent).toMatch(/Guardando…/);
    expect(digitButtons(container).every((b) => b.disabled)).toBe(true);
    expect(container.querySelector('button[aria-label="Borrar"]').disabled).toBe(true);
    expect(container.querySelector('button[aria-label="Vaciar"]').disabled).toBe(true);
    unmount(container, root);
  });

  test('an error message renders, and the dots themselves never carry any digit text', async () => {
    const { container, root } = await mount({ error: 'PIN incorrecto' });
    pressDigits(container, '123456');
    expect(container.textContent).toMatch(/PIN incorrecto/);
    // The keypad legitimately labels its own buttons 1-9 — that is not a PIN echo.
    // The actual guarantee is that the dot indicators carry no text at all.
    expect(container.querySelector('[data-testid="pinpad-dots"]').textContent).toBe('');
    unmount(container, root);
  });
});

describe('PinPad — cancel', () => {
  test('cancel button fires onCancel and is omitted entirely when no handler is given', async () => {
    const onCancel = jest.fn();
    const { container, root } = await mount({ cancelLabel: 'Cancelar', onCancel });
    click(findByText(container, 'Cancelar'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    unmount(container, root);

    const { container: c2, root: r2 } = await mount({ onCancel: undefined });
    expect(findByText(c2, 'Cancelar')).toBeUndefined();
    unmount(c2, r2);
  });
});
