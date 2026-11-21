// Окрема система колізій коло–коло: приймає world, повертає масив пар [a, b].
// У Lab 7 цю функцію можна замінити на spatial hash без зміни World.step().
export function detectCollisions(world) {
  const entities = [];
  for (const e of world) {
    if (e.alive && e.radius > 0) {
      entities.push(e);
    }
  }

  const pairs = [];
  for (let i = 0; i < entities.length; i++) {
    const a = entities[i];
    for (let j = i + 1; j < entities.length; j++) {
      const b = entities[j];
      const radiiSum = a.radius + b.radius;
      const distSq = a.pos.sub(b.pos).lengthSq();

      if (distSq <= radiiSum * radiiSum) {
        pairs.push([a, b]);
      }
    }
  }

  return pairs;
}