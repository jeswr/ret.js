import * as util from './util'
import { Group, types, Root, Token } from './types'
import * as sets from './sets'

export const regexTokenizer = (regex: RegExp): Root => {
  let root = tokenizer(regex.source)
  root.flags = regex.flags.split('')
  return root
}

export const tokenizer = (regexpStr: string): Root => {
  let i: number = 0, c: string;
  let start: Root = { type: types.ROOT, stack: [] };

  // Keep track of last clause/group and stack.
  let lastGroup: Group | Root = start;
  let last: Token[] = start.stack ?? [];
  let groupStack: (Group | Root)[] = [];


  const repeatErr = (i: number) => {
    util.error(regexpStr, `Nothing to repeat at column ${i - 1}`);
  };

  // Decode a few escaped characters.
  let str = util.strToChars(regexpStr);

  // Iterate through each character in string.
  while (i < str.length) {
    c = str[i++];

    switch (c) {
      // Handle escaped characters, inclues a few sets.
      case '\\':
        switch (c = str[i++]) {
          case 'b':
            last.push({ type: types.POSITION, value: 'b'});
            break;

          case 'B':
            last.push({ type: types.POSITION, value: 'B'});
            break;

          case 'w':
            last.push(sets.words());
            break;

          case 'W':
            last.push(sets.notWords());
            break;

          case 'd':
            last.push(sets.ints());
            break;

          case 'D':
            last.push(sets.notInts());
            break;

          case 's':
            last.push(sets.whitespace());
            break;

          case 'S':
            last.push(sets.notWhitespace());
            break;

          default:
            // Check if c is integer.
            // In which case it's a reference.
            if (/\d/.test(c)) {
              last.push({ type: types.REFERENCE, value: parseInt(c, 10) });

            // Escaped character.
            } else {
              last.push({ type: types.CHAR, value: c.charCodeAt(0)});
            }
        }

        break;


      // Positionals.
      case '^':
        last.push({ type: types.POSITION, value: '^'});
        break;

      case '$':
        last.push({ type: types.POSITION, value: '$'});
        break;


      // Handle custom sets.
      case '[': {
        // Check if this class is 'anti' i.e. [^abc].
        let not;
        if (str[i] === '^') {
          not = true;
          i++;
        } else {
          not = false;
        }

        // Get all the characters in class.
        let classTokens = util.tokenizeClass(str.slice(i), regexpStr);

        // Increase index by length of class.
        i += classTokens[1];
        last.push({
          type: types.SET,
          set: classTokens[0],
          not,
        });

        break;
      }


      // Class of any character except \n.
      case '.':
        last.push(sets.anyChar());
        break;


      // Push group onto stack.
      case '(': {
        // Create group.
        let group = {
          type: types.GROUP,
          stack: [],
          remember: true,
        };

        // If if this is a special kind of group.
        if (str[i] === '?') {
          c = str[i + 1];
          i += 2;

          // Match if followed by.
          if (c === '=') {
            (group as Group).followedBy = true;

          // Match if not followed by.
          } else if (c === '!') {
            (group as Group).notFollowedBy = true;

          } else if (c !== ':') {
            util.error(regexpStr,
              `Invalid group, character '${c}'` +
              ` after '?' at column ${i - 1}`);
          }

          group.remember = false;
        }

        // Insert subgroup into current group stack.
        last.push(group as Group);

        // Remember the current group for when the group closes.
        groupStack.push(lastGroup);

        // Make this new group the current group.
        lastGroup = group as Group;
        last = group.stack;
        break;
      }


      // Pop group out of stack.
      case ')':
        if (groupStack.length === 0) {
          util.error(regexpStr, `Unmatched ) at column ${i - 1}`);
        }
        lastGroup = groupStack.pop() as Group;

        // Check if this group has a PIPE.
        // To get back the correct last stack.
        const lastTemp = lastGroup.options ?
        lastGroup.options[lastGroup.options.length - 1] : lastGroup.stack;
      if (lastTemp)
        last = lastTemp;
      else
        util.error(regexpStr, 'Invalid use of pipe');
        break;


      // Use pipe character to give more choices.
      case '|': {
        // Create array where options are if this is the first PIPE
        // in this clause.
        if (!lastGroup.options) {
          if (lastGroup.stack)
            lastGroup.options = [lastGroup.stack];
          else 
            util.error(regexpStr, 'last group does not contain stack');
          delete lastGroup.stack;
        }
        // Create a new stack and add to options for rest of clause.
        let stack: Token[] = [];
        if (lastGroup.options)
          lastGroup.options.push(stack);
        else
          util.error(regexpStr, 'last group does not contain options')
        last = stack;
        break;
      }


      // Repetition.
      // For every repetition, remove last element from last stack
      // then insert back a RANGE object.
      // This design is chosen because there could be more than
      // one repetition symbols in a regex i.e. `a?+{2,3}`.
      case '{': {
        let rs = /^(\d+)(,(\d+)?)?\}/.exec(str.slice(i)), min, max;
        if (rs !== null) {
          if (last.length === 0) {
            repeatErr(i);
          }
          min = parseInt(rs[1], 10);
          max = rs[2] ? rs[3] ? parseInt(rs[3], 10) : Infinity : min;
          i += rs[0].length;

          last.push({
            type: types.REPETITION,
            min,
            max,
            value: last.pop() as Group,
          });
        } else {
          last.push({
            type: types.CHAR,
            value: 123,
          });
        }
        break;
      }

      case '?':
        if (last.length === 0) {
          repeatErr(i);
        }
        last.push({
          type: types.REPETITION,
          min: 0,
          max: 1,
          value: last.pop() as Group,
        });
        break;

      case '+':
        if (last.length === 0) {
          repeatErr(i);
        }
        last.push({
          type: types.REPETITION,
          min: 1,
          max: Infinity,
          value: last.pop() as Group,
        });
        break;

      case '*':
        if (last.length === 0) {
          repeatErr(i);
        }
        last.push({
          type: types.REPETITION,
          min: 0,
          max: Infinity,
          value: last.pop() as Group,
        });
        break;


      // Default is a character that is not `\[](){}?+*^$`.
      default:
        last.push({
          type: types.CHAR,
          value: c.charCodeAt(0),
        });
    }

  }

  // Check if any groups have not been closed.
  if (groupStack.length !== 0) {
    util.error(regexpStr, 'Unterminated group');
  }

  return start;
};