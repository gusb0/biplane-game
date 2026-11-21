function createAbortError(message = 'Operation aborted') {
  return new DOMException(message, 'AbortError');
}

function sleep(ms, signal) {
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// Спільний хелпер fetchJson: перевіряє response.ok, кидає помилку зі статусом (4xx / 5xx)
export async function fetchJson(url, { signal } = {}) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    const err = new Error(`HTTP ${response.status} (${response.statusText}) for ${url}`);
    err.status = response.status;
    throw err;
  }
  return await response.json();
}

export function loadJson(url, { signal } = {}) {
  return fetchJson(url, { signal });
}

// Обгортка callback-API (Image) у Promise з підтримкою AbortSignal
export function loadImage(url, { signal } = {}) {
  if (signal?.aborted) {
    return Promise.reject(createAbortError(`Aborted image load: ${url}`));
  }

  return new Promise((resolve, reject) => {
    const img = new Image();

    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      cleanup();
      img.src = '';
      reject(createAbortError(`Aborted image load: ${url}`));
    };

    img.onload = () => {
      cleanup();
      resolve(img);
    };

    img.onerror = () => {
      cleanup();
      const err = new Error(`Failed to load image (404 or decode error): ${url}`);
      err.status = 404;
      reject(err);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    img.src = url;
  });
}

// Завантаження та декодування аудіобуфера для Web Audio
export async function loadAudio(audioCtx, url, { signal } = {}) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    const err = new Error(`HTTP ${response.status} while loading audio: ${url}`);
    err.status = response.status;
    throw err;
  }
  const arrayBuffer = await response.arrayBuffer();
  if (signal?.aborted) {
    throw createAbortError(`Aborted audio decode: ${url}`);
  }
  return await audioCtx.decodeAudioData(arrayBuffer);
}

// Повтор з exponential backoff + jitter; ніколи не повторює 4xx або AbortError
export async function withRetry(fn, { attempts = 3, baseMs = 200, signal } = {}) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (signal?.aborted) {
      throw createAbortError();
    }

    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (err?.name === 'AbortError' || (err?.status >= 400 && err?.status < 500)) {
        throw err;
      }

      if (attempt < attempts - 1) {
        const backoff = baseMs * 2 ** attempt;
        const jitter = Math.floor(Math.random() * 100);
        await sleep(backoff + jitter, signal);
      }
    }
  }

  throw lastError;
}

// Паралельне завантаження всіх ассетів через Promise.all із прогресом по кожному файлу
export async function loadAll(manifestUrl, { audioCtx, onProgress, signal } = {}) {
  onProgress?.({ done: 0, total: 1, ratio: 0.05, label: 'manifest.json' });

  const manifest = await withRetry(() => loadJson(manifestUrl, { signal }), {
    attempts: 3,
    baseMs: 200,
    signal,
  });

  const soundEntries = Object.entries(manifest.sounds || {});
  const total = 2 + soundEntries.length;
  let done = 0;

  const track = (promise, label) =>
    promise.then((value) => {
      done += 1;
      onProgress?.({
        done,
        total,
        ratio: done / total,
        label,
      });
      return value;
    });

  const arenaPromise = track(
    withRetry(() => loadJson(manifest.arena, { signal }), { attempts: 3, baseMs: 200, signal }),
    manifest.arena
  );

  const sheetPromise = track(
    withRetry(() => loadImage(manifest.sprites.sheet, { signal }), {
      attempts: 3,
      baseMs: 200,
      signal,
    }),
    manifest.sprites.sheet
  );

  const soundPromises = soundEntries.map(([name, url]) =>
    track(
      withRetry(() => loadAudio(audioCtx, url, { signal }), {
        attempts: 3,
        baseMs: 200,
        signal,
      }).then((buffer) => [name, buffer]),
      url
    )
  );

  const [arena, sheet, ...decodedSounds] = await Promise.all([
    arenaPromise,
    sheetPromise,
    ...soundPromises,
  ]);

  return {
    manifest,
    arena,
    sprites: {
      sheet,
      frames: manifest.sprites.frames,
    },
    sounds: Object.fromEntries(decodedSounds),
  };
}

// Послідовний варіант для заміру різниці часу (sequential await vs Promise.all)
export async function loadAllSequential(manifestUrl, { audioCtx, signal } = {}) {
  const manifest = await loadJson(manifestUrl, { signal });
  const arena = await loadJson(manifest.arena, { signal });
  const sheet = await loadImage(manifest.sprites.sheet, { signal });
  const sounds = {};
  for (const [name, url] of Object.entries(manifest.sounds || {})) {
    sounds[name] = await loadAudio(audioCtx, url, { signal });
  }
  return { manifest, arena, sprites: { sheet, frames: manifest.sprites.frames }, sounds };
}