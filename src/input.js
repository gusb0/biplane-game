export function createInput(target = window) {
  const down = new Set();
  const justPressed = new Set();

  target.addEventListener('keydown', (e) => {
    if (!e.repeat) {
      if (!down.has(e.code)) justPressed.add(e.code);
      down.add(e.code);
    }
  });

  target.addEventListener('keyup', (e) => {
    down.delete(e.code);
  });

  return {
    isDown: (code) => down.has(code),
    consumeJustPressed: (code) => {
      const has = justPressed.has(code);
      if (has) justPressed.delete(code);
      return has;
    }
  };
}