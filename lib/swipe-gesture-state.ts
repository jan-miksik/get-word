// Tracks whether a card-deck swipe drag currently owns touch input. Window-level
// gesture listeners (ScratchCover) consult this so a horizontal card drag that
// crosses a scratch canvas doesn't also scratch it. Token-based so cleanup from
// a stale gesture can never clear a newer gesture's claim.

let currentOwner: symbol | null = null;

export function beginCardSwipe(): symbol {
  const token = Symbol('card-swipe');
  currentOwner = token;
  return token;
}

export function endCardSwipe(token: symbol): void {
  if (currentOwner === token) currentOwner = null;
}

export function isCardSwipeActive(): boolean {
  return currentOwner !== null;
}
