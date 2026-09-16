import { helper } from '@ember/component/helper';

export function arrayIncludes([value, array]) {
  return Array.isArray(array) && array.includes(value);
}

export default helper(arrayIncludes);
