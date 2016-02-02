import {
  queryExpression as oqe
} from './expression';
import {
  splitPath
} from '../lib/paths';

const andOperator = {
  evaluate(context, args) {
    for (let arg of args) {
      if (!context.evaluate(arg)) {
        return false;
      }
    }
    return true;
  }
};

const orOperator = {
  evaluate(context, args) {
    for (let arg of args) {
      if (!!context.evaluate(arg)) { return true; }
    }
    return false;
  }
};

const equalOperator = {
  evaluate(context, args) {
    let value;
    let valueSet = false;

    for (let arg of args) {
      if (!valueSet) {
        value = context.evaluate(arg);
        valueSet = true;
      } else if (value !== context.evaluate(arg)) {
        return false;
      }
    }

    return true;
  }
};

const getOperator = {
  evaluate(context, args) {
    let path = splitPath(args[0]);
    if (context.basePath) {
      path = context.basePath.concat(path);
    }
    return context.evaluator.target.get(path);
  }
};

const filterOperator = {
  evaluate(context, args) {
    const path = splitPath(args[0]);
    const where = args[1];
    const values = context.evaluate(oqe('get', path));
    let matches = {};

    for (let value of Object.keys(values)) {
      context.basePath = path.concat(value);

      if (context.evaluate(where)) {
        matches[value] = values[value];
      }
    }

    return matches;
  }
};

export {
  andOperator,
  orOperator,
  equalOperator,
  getOperator,
  filterOperator
};