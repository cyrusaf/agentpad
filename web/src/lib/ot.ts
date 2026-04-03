import type { Operation } from "./types";

export function runeLength(text: string) {
  return Array.from(text).length;
}

export function toCodePointOffset(source: string, codeUnitOffset: number) {
  return Array.from(source.slice(0, codeUnitOffset)).length;
}

export function toCodeUnitOffset(source: string, codePointOffset: number) {
  if (codePointOffset <= 0) {
    return 0;
  }
  const runes = Array.from(source);
  return runes.slice(0, codePointOffset).join("").length;
}

export function sliceByCodePoint(source: string, start: number, end: number) {
  return Array.from(source).slice(start, end).join("");
}

export function transformPosition(position: number, prior: Operation, stickRight: boolean) {
  if (position < prior.position) {
    return position;
  }
  const insertLength = runeLength(prior.insert_text);
  const deleteStart = prior.position;
  const deleteEnd = prior.position + prior.delete_count;
  if (prior.delete_count === 0) {
    if (position > prior.position) {
      return position + insertLength;
    }
    return stickRight ? position + insertLength : position;
  }
  if (position > deleteEnd) {
    return position + insertLength - prior.delete_count;
  }
  if (position === deleteEnd) {
    return deleteStart + insertLength;
  }
  return stickRight ? deleteStart + insertLength : deleteStart;
}

export function transformAgainst(incoming: Operation, prior: Operation): Operation {
  const start = transformPosition(incoming.position, prior, false);
  const end = transformPosition(incoming.position + incoming.delete_count, prior, true);
  return {
    ...incoming,
    position: start,
    delete_count: Math.max(0, end - start),
  };
}

export function applyOperation(source: string, op: Operation) {
  const runes = Array.from(source);
  const insert = Array.from(op.insert_text);
  return [
    ...runes.slice(0, op.position),
    ...insert,
    ...runes.slice(op.position + op.delete_count),
  ].join("");
}
