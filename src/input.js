export function createInput(canvas, { onFire, onToggleHoming } = {}) {
  const keys = new Set();

  const handleKeyDown = (event) => {
    keys.add(event.code);

    if (event.code === 'Space') {
      event.preventDefault();
      // Викликаємо безпечно переданий колбек (з правильним this)
      if (onFire) onFire();
    }

    if (event.code === 'KeyH' && onToggleHoming) {
      onToggleHoming();
    }
  };

  const handleKeyUp = (event) => {
    keys.delete(event.code);
  };

  const handlePointerDown = () => {
    if (onFire) onFire();
  };

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  if (canvas) {
    canvas.addEventListener('pointerdown', handlePointerDown);
  }

  return {
    getState() {
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
      if (canvas) {
        canvas.removeEventListener('pointerdown', handlePointerDown);
      }
    },
  };
}