export function brakesForDirection(brakes, even, category) {
  const direction = even ? 'even' : 'odd';
  return (brakes || []).filter(brake => brake.direction === direction && brake.train_kind === category);
}
