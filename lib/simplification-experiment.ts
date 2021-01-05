
function toChar(element: Token): Token {
  if (element.type === types.RANGE && element.from === element.to) {
    return { type: types.CHAR, value: element.to };
  }
  return element;
};

/**
 * Get minimum char code represented by a token
 */
function minVal(set: Range | Char | Set) {
  if (set.type === types.SET) {
    throw new Error(`Nested set - invalid regular expression`)
  }
  return set.type === types.CHAR ? set.value : set.from
}

/**
 * Get maximum char code represented by a token
 */
function maxVal(set: Range | Char | Set) {
  if (set.type === types.SET) {
    throw new Error(`Nested set - invalid regular expression`)
  }
  return set.type === types.CHAR ? set.value : set.from
}

/**
 * Used to standarise set representations
 * 
 * Reorder via character codes in a manner similar to mergesort.
 * ([aygh] becomes [aghy] and [x-ya-b] becomes [a-bx-y])
 * 
 * Overlapping ranges get merged ([a-cb-d] becomes [a-d]) and
 * consecutive tokens become ranges ([abc] becomes [a-c])
 * 
 * @param set {SetTokens} the tokens to be standardised
 */
function cleanSet(set: (Range | Char)[]): (Range | Char)[] {
  // Base case of the merge function
  if (set.length === 0) {
    return set
  } else if (set.length === 1) {
    if (set[0].type === types.RANGE) {
      // Cleaning up sets of the form [a-a] to become [a]
      if (set[0].from === set[0].to) {
        return [{ type: types.CHAR, value: set[0].from }]
        // Cleaning up sets of the form [z-a] to become []
      } else if (set[0].to < set[0].from) {
        return []
      }
    }
    return set
  }
  const result: (Range | Char)[] = [];
  const mid = Math.ceil(set.length / 2)
  const left = set.slice(0, mid)
  const right = set.slice(mid)
  // Iterators to determine where to look
  // in the lists being merged
  let i = 0, j = 0
  // The maximum charCode found thus far
  let max = -2
  while (i < left.length && j < right.length) {
    let temp;
    if (i + 1 === left.length) {
      temp = right[j]
      j++;
    } else if (j + 1 === right.length) {
      temp = left[i]
      i++;
    } else if (minVal(left[i]) < minVal(right[j])) {
      temp = left[i]
      i++;
    } else {
      temp = right[j]
      j++;
    }
    // Merging overlapping tokens (note that it is '<=' so that [a-cd-g] becomes [a-g])
    if (minVal(temp) <= max + 1) {
      if (maxVal(temp) > maxVal(result[i + j])) {
        result[i + j] = { type: types.RANGE, from: minVal(result[i + j]), to: maxVal(temp) }
      };
    } else {
      result.push(temp);
    }
  }
  return result;
}

function flattenSets(set: Set) {
  // Flatten the sets into 'normal'
  // and 'not' tokens/character ranges
  let normal: (Char | Range)[] = [];
  let not: (Char | Range)[] = [];
  
  function flatten(set: Set) {
    for (const elem of set.set) {
      if (elem.type === types.SET) {
        flatten(elem)
      } else {
        if (set.not) {
          not.push(elem)
        } else {
          normal.push(elem)
        }
      }
    }
  }

  flatten(set)

  // Clean the sets
  normal = cleanSet(normal)
  not = cleanSet(not)
  const presetsNormal = []
  const presetsNot = []

  const words = sets.words().set;
  const ints = sets.ints().set;
  const anychar = sets.anyChar().set;
  const whitespace = sets.whitespace().set;

  // Detecting any matches
  let w = 0, i = 0, a = 0, wh = 0;
  for (const elem of normal) {
    if (words[w] && minVal(elem) <= minVal(words[w]) && maxVal(elem) >= maxVal(words[w])) {
      w++;
    }
    if (ints[i] && minVal(elem) <= minVal(ints[i]) && maxVal(elem) >= maxVal(ints[i])) {
      i++;
    }
    if (anychar[a] && minVal(elem) <= minVal(anychar[a]) && maxVal(elem) >= maxVal(anychar[a])) {
      a++;
    }
    if (whitespace[wh] && minVal(elem) <= minVal(whitespace[wh]) && maxVal(elem) >= maxVal(whitespace[wh])) {
      wh++;
    }
  }

  if (w === words.length) {
    presetsNormal.push(words)
  }

  if (i === ints.length) {
    presetsNormal.push(ints)
  }

  if (a === anychar.length) {
    presetsNormal.push(anychar)
  }

  if (a === whitespace.length) {
    presetsNormal.push(whitespace)
  }

  let nw = 0, ni = 0, na = 0, nwh = 0;
  for (const elem of not) {
    if (words[w] && minVal(elem) <= minVal(words[w]) && maxVal(elem) >= maxVal(words[w])) {
      nw++;
    }
    if (ints[i] && minVal(elem) <= minVal(ints[i]) && maxVal(elem) >= maxVal(ints[i])) {
      ni++;
    }
    if (anychar[a] && minVal(elem) <= minVal(anychar[a]) && maxVal(elem) >= maxVal(anychar[a])) {
      na++;
    }
    if (whitespace[wh] && minVal(elem) <= minVal(whitespace[wh]) && maxVal(elem) >= maxVal(whitespace[wh])) {
      nwh++;
    }
  }

  if (nw === words.length) {
    presetsNot.push(words)
  }

  if (ni === ints.length) {
    presetsNot.push(ints)
  }

  if (na === anychar.length) {
    presetsNot.push(anychar)
  }

  if (na === whitespace.length) {
    presetsNot.push(whitespace)
  }

  normal = diff(normal, presetsNormal);
  not = diff(not, presetsNot);
  // TODO: return and write the results
}

/**
 * Diffs 2 sets - note that they *must* be ordered
 * in order for this to work properly.
 */
function diff(left: (Char | Range)[], remove: (Char | Range)[][]) {
  const counters = Array(remove.length).fill(0)
  const res: (Char | Range)[] = []
  for (const elem of left) {
    let min = minVal(elem)
    const max = maxVal(elem)
    const removals = []
    // Note we know that the removals lie *within* the range
    for (let i = 0; i++; i < remove.length) {
      const counter = counters[i]
      if (counter < remove[i].length && minVal(remove[i][counter]) >= min && maxVal(remove[i][counter]) <= max) {
        removals.push(remove[i])
        counters[i]++
      }
    }

    const toRemove = merge(removals)
    for (const remove of toRemove) {
      let internalMin = minVal(remove)
      if (internalMin > min) {
        res.push(toChar({ type: types.RANGE, from: min, to: internalMin - 1 }) as Range | Char)
      }
      min = maxVal(remove)
    }
    if (max > min) {
      res.push(toChar({ type: types.RANGE, from: min, to: max }) as Range | Char)
    }
  }
  return res
}
