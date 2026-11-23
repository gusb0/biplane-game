export function createInput(canvas, { onFire, onToggleHoming, onOpenLobby } = {}) {
  const keys = new Set();

  const isTyping = () => {
    const tag = document.activeElement?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA';
  };

  const handleKeyDown = (event) => {
    if (isTyping()) return;
    keys.add(event.code);

    if (event.code === 'Space') {
      event.preventDefault();
      if (onFire) onFire();
    }
    if (event.code === 'KeyH' && onToggleHoming) onToggleHoming();
    if (event.code === 'KeyL' && onOpenLobby) onOpenLobby();
  };

  const handleKeyUp = (event) => keys.delete(event.code);
  const handlePointerDown = () => {
    if (!isTyping() && onFire) onFire();
  };

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  if (canvas) canvas.addEventListener('pointerdown', handlePointerDown);

  return {
    getState() {
      if (isTyping()) {
        return { thrust: false, brake: false, left: false, right: false, fire: false };
      }
      return {
        thrust: keys.has('KeyW') || keys.has('ArrowUp'),
        brake: keys.has('KeyS') || keys.has('ArrowDown'),
        left: keys.has('KeyA') || keys.has('ArrowLeft'),
        right: keys.has('KeyD') || keys.has('ArrowRight'),
        fire: keys.has('Space'),
      };
    },
    destroy() {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (canvas) canvas.removeEventListener('pointerdown', handlePointerDown);
    },
  };
}