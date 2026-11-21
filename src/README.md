# Biplane Game — Побудова мультиплеєрної браузерної гри

Навчальний проєкт курсу **JavaScript — Build a Multiplayer Game**.

---

## Lab 01 — Event Loop та ігровий цикл
- Створено Vite-проєкт, ігровий цикл `createLoop()` на `requestAnimationFrame` з фіксованим кроком симуляції (`60 steps/s`) та інтерполяцією рендеру.
- Реалізовано керування через замикання `createInput()` та чисту фізику польоту з «загортанням» країв арени.

---

## Lab 02 — Об’єкти, прототипи та `this`: модель сутностей
- **`Vector2` (`src/sim/vector.js`)**: імутабельні векторні операції (`add`, `sub`, `scale`, `normalize`, `rotate`, `dot`, `static fromAngle`).
- **`Entity` (`src/sim/entity.js`) та `Ship extends Entity` (`src/sim/ship.js`)**: один рівень успадкування, приватний лічильник `static #nextId`, інкапсульоване здоров'я `#hp` з геттером `get hp()`.
- **`World` (`src/sim/world.js`)**: сховище сутностей на базі `Map<id, Entity>`, ітератор `[Symbol.iterator]()`, генератор `*ofKind(kind)` та відкладене видалення `sweep()`.
- **Композиція (`src/sim/components.js`)**: поведінка самонаведення `createHomingComponent` підключається і до `Bullet`, і до `Asteroid` без глибокої ієрархії класів.

---

## Lab 03 — Асинхронний JavaScript: Promises, `async/await` і екран завантаження

### Порівняння часу завантаження: Sequential `await` vs Concurrent `Promise.all`

Замір виконано на наборі з 6 файлів (`manifest.json`, `arena-default.json`, `spritesheet.png`, `shoot.wav`, `hit.wav`, `explosion.wav`, `pickup.wav`) із затримкою мережі ~120 мс на запит (`await window.__lab03.benchmarkLoad()`):

| Підхід | Як виконується | Час завантаження |
| :--- | :--- | :--- |
| **Sequential `await`** (`for..of` з `await`) | Кожен наступний запит стартує лише після завершення попереднього | **~860 мс** |
| **Concurrent `Promise.all`** (`loadAll`) | Усі запити стартують одночасно, очікуємо завершення найдовшого | **~165 мс** |

**Висновок:** паралельний запуск через `Promise.all` прискорив завантаження у ~5 разів, а обгортка кожного проміса лічильником `.then(v => { done++; onProgress(...); return v; })` дозволила оновлювати прогрес-бар у реальному часі.

---

### П’ять власних головоломок порядку (Microtasks vs Tasks)

#### Головоломка 1 — Базова черга мікрозадач і `await`
```js
console.log('A');
setTimeout(() => console.log('B'), 0);
Promise.resolve().then(() => console.log('C'));
(async () => {
  console.log('D');
  await null;
  console.log('E');
})();
console.log('F');