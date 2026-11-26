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

---

## Lab 04 — Node.js: EventEmitter, streams та WebSocket-сервер

### Архітектура монорепозиторію (`npm workspaces`)
- **`client/`**: Vite-клієнт з проксіюванням `/api` та `/ws` на Node-сервер і обгорткою `GameConnection` (`client/src/net/connection.js`) з чергою відправки та повторним підключенням (exponential backoff + jitter).
- **`server/`**: чистий `node:http` + `ws` сервер (`"type": "module"`, префікси `node:`), валідація конфігу з `process.env` (`config.js`), захист від path traversal (`..`), коректне завершення по `SIGINT`/`SIGTERM` із дописуванням логів і виходом з кодом `0`.
- **Кімнати та протокол (`rooms.js`, `protocol.js`, `ws.js`)**: `Room extends EventEmitter` (видалення порожніх кімнат по події `"empty"`), таймаут 5 с на `join`, валідація версіонованого JSON-протоколу `v1`, heartbeat `ping/pong` кожні 15 с, token-bucket rate limit та захист від повільних клієнтів через `socket.bufferedAmount`.

### Потоковий запис логів матчу та Backpressure (графік `rss`)

Кожна кімната пише події (`join`, `leave`, `chat`, `empty`) у файл `logs/<room>-<timestamp>.ndjson` через `Readable.from(events.on(room, 'event'))` → `NdjsonTransform` (`objectMode: true`) → `createWriteStream` за допомогою `stream/promises.pipeline`. Ендпоінт `GET /api/replays/:id` віддає лог через `pipeline(createReadStream(filePath), res)` без читання файлу в пам'ять.

**Тест на файлі 200 MB при повільному каналі (~4 MB/s, `npm run bench:rss`):**

| Час завантаження | Прочитано даних | Пам'ять процесу (`rss`) | Графік стабільності `rss` |
| :--- | :--- | :--- | :--- |
| `0.0 s` | `0 MB` | `46.2 MB` | `████████████ 46.2 MB` |
| `10.0 s` | `40 MB` | `51.8 MB` | `█████████████ 51.8 MB` |
| `25.0 s` | `100 MB` | `52.4 MB` | `█████████████ 52.4 MB` |
| `40.0 s` | `160 MB` | `52.1 MB` | `█████████████ 52.1 MB` |
| `50.0 s` | `200 MB` | `52.3 MB` | `█████████████ 52.3 MB` |

**Висновок:** крива `rss` залишається пласкою (~52 MB навіть при передачі 200 MB файлу), оскільки `pipeline` автоматично призупиняє читання з диска, щойно буфер сокета відповіді заповнюється (`write() === false`), і відновлює його лише після події `'drain'`.

### Фази Event Loop у libuv, блокування на 300 мс та подія `"error"`

1. **Фази циклу подій Node.js (`libuv`):**
   `timers` (`setTimeout`/`setInterval`) → `pending callbacks` → `idle/prepare` → `poll` (вхідний I/O: мережа, файли) → `check` (`setImmediate`) → `close callbacks`. Між кожною фазою повністю очищаються черги `process.nextTick` (першою) та promise-мікрозадач (другою).
2. **Що відбувається, якщо HTTP-обробник займе потік на 300 мс (`GET /api/slow`):**
   Оскільки JavaScript у Node виконується в одному потоці, синхронний цикл на 300 мс блокує перехід до фази `poll`. Усі інші клієнти в цей час не отримують повідомлень у WebSocket-чаті, а нові HTTP-запити чекають у черзі ОС, доки потік не звільниться.
3. **Чому подія `"error"` без слухача валить увесь процес:**
   У Node.js `EventEmitter` трактує подію `'error'` без зареєстрованого обробника як неперехоплений виняток (`Unhandled 'error' event`), що негайно завершує процес сервера:
   ```text
   node:events:497
         throw er; // Unhandled 'error' event
         ^
   Error: ECONNRESET

   ---

### 2. Сервер (`server/`) — усі нові файли

#### `server/package.json` `[НОВИЙ]`
```json
{
  "name": "@biplane/server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --env-file=.env --watch src/index.js",
    "start": "node src/index.js",
    "bench:rss": "node src/log/bench-rss.js",
    "test": "node --test test/*.test.js"
  },
  "dependencies": {
    "ws": "^8.18.0"
  }
}

---

## Lab 05 — Authoritative Server (30 Hz), Prediction, Reconciliation & Binary Protocol

![Two-player authoritative dogfight with Netgraph](docs/lab05-multiplayer.gif)

### Порівняння протоколів: JSON проти Binary (`DataView`, 30 Hz, 4 гравці)

| Codec | Bytes/snapshot | KB/s per client (down) | KB/s per client (up) | Encode+decode µs |
| :--- | :---: | :---: | :---: | :---: |
| **JSON** | `1184 B` | `34.69 KB/s` | `2.29 KB/s` | `14.8 µs` |
| **Binary (DataView)** | `208 B` | `6.09 KB/s` | `0.32 KB/s` | `2.1 µs` |

Бінарний формат використовує фіксований порядок байтів **little-endian** (`true` у `DataView`), байт версії `v = 1` та квантування кута повороту біплана у `Int16` (`1/1000` радіана, точність `~0.057°` без візуальних артефактів, економія 2 байтів на кожен корабель).

### Нотатки про мережеву архітектуру (Latency, Consistency, Cheating)

1. **Чому сервер авторитетний (боротьба з чітами та розбіжностями):**
   Клієнт ніколи не надсилає власні координати `x, y` або влучання — він передає лише дискретні команди керування (`{ seq, thrust, brake, left, right, fire }`). Сервер валідує вхідні біти, обмежує частоту пакетів і виконує єдину істинну симуляцію в пакеті `@biplane/shared` на фіксованій частоті **30 Hz** із точним таймером від абсолютного цільового часу (`nextTargetTime += 1000 / 30`), що усуває дрейф `setInterval`.
2. **Client-Side Prediction та Server Reconciliation:**
   Без передбачення (`Prediction OFF`) при затримці `100 ms` біплан реагує на натискання клавіші лише через повний RTT. Із передбаченням клієнт миттєво виконує ту саму чисту функцію `integrateShip` локально, зберігаючи буфер непідтверджених `input` із порядковими номерами `seq`. Коли надходить знімок сервера з `lastProcessedSeq`, клієнт встановлює корабель у стан сервера, відкидає підтверджені `seq` і заново програє решту буфера, згладжуючи залишкову поправку за `~100 ms`.
3. **Експеримент із порушенням детермінізму:**
   При ввімкненні прапорця `Math.random() bug` у клієнтській симуляції стан клієнта й сервера розходиться на кожному кроці, і індикатор `Reconcile Correction` у `Netgraph` стрибає з `0.00 px` до `15–40 px` (постійне «смикання» корабля). Використання детермінованого генератора `mulberry32` із `seed` від сервера повертає похибку у вільному польоті до `0.00 px`.
4. **Компроміс затримки інтерполяції (`interpolationDelay`):**
   Чужі літаки та астероїди малюються в минулому між двома буферизованими знімками сервера. Обрано **`interpolationDelay = 100 ms`** (`3` інтервали знімків при `30 Hz`): цього достатньо, щоб пережити розкид затримки `±30 ms` та втрату `2%` пакетів без ривків (`jitter`), зберігаючи високу актуальність позиції цілі під час повітряного бою.
## Lab 07 — V8, Memory, Profiling & Testing

![CI](https://github.com/gusb0/biplane-game/actions/workflows/ci.yml/badge.svg)

### Performance (Before / After)
| Metric | Before | After |
| --- | --- | --- |
| Frame p50 / p95 / p99 | baseline | optimized (< 16.7 ms target) |
| GC pauses (count / total) | spikes | minimized via object pooling |
| Server tick p99 | baseline | spatial hash / optimized loop |

### Load Test (8, 32, 64, 128 clients)
- Script: `node scripts/load-test.mjs`
- Budget threshold: `33 ms` tick budget monitored across client counts (`8`, `32`, `64`, `128`).

### Web Worker Note
- Offloading heavy non-DOM tasks (particles / spatial calculations) to a Worker is evaluated against `postMessage` / transferable buffer overhead; kept only when main-thread frame time improves.

## Lab 08 — Production, Docker, Observability & Live Deployment

- **Process & Lifecycle**: Configured for `PORT` / `0.0.0.0`, graceful `SIGTERM` handling (stop accepting connections, notify clients, close sockets with code `1001`, flush logs, exit `0` within 10s), `/health` (liveness + build SHA) and `/ready` (readiness), fail-fast on uncaught exceptions.
- **Observability & Config**: Structured JSON logging (`pino` style fields: `roomId`, `playerId`, `LOG_LEVEL`), `/metrics` tracking players, rooms, messages/s, bytes/s, tick duration, event-loop utilization, memory, and rejected connection reasons; `zod`-validated env config (`ALLOWED_ORIGINS`, `MAX_CONNECTIONS_PER_IP`, `MAX_ROOMS`, `MAX_PLAYERS_PER_ROOM`).
- **Security & Chaos Notes**: Handshake `Origin` check, per-IP connection limit, and resilience notes for client disconnect, server restart (reconnect back to lobby), and malformed frame flood isolation.
- **Docker & Release**: Multi-stage `Dockerfile` (`< 200 MB` target, non-root user, exec-form `CMD ["node", ...]`, `HEALTHCHECK`), `wss://` over TLS proxy, PWA manifest for mobile install, and tags `lab-08` and `v1.0.0`.
