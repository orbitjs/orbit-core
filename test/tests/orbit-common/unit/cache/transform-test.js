import Orbit from 'orbit/main';
import Cache from 'orbit-common/cache';
import Schema from 'orbit-common/schema';
import { equalOps, op } from 'tests/test-helper';
import { Promise, on } from 'rsvp';
import {
  queryExpression as oqe
} from 'orbit/query/expression';
import {
  addRecordOperation
} from 'orbit-common/lib/operations';
import Transform from 'orbit/transform';

var schema,
    cache;

module('OC - Cache - transform', {
  setup: function() {
    Orbit.Promise = Promise;
    schema = new Schema({
      models: {
        planet: {
          relationships: {
            moons: { type: 'hasMany', model: 'moon' }
          }
        },
        moon: {
          relationships: {
            planet: { type: 'hasOne', model: 'planet' }
          }
        }
      }
    });
  },

  teardown: function() {
    schema = null;
  }
});

test('still succeeds when an operation is a noop', function() {
  expect(1);

  cache = new Cache(schema);

  cache.transform([{ op: 'add', path: 'planet/1', value: { type: 'planet', id: '1', attributes: { name: 'Earth' } } }]);

  cache.transform([{ op: 'remove', path: 'planet/2' }]);

  ok(true, 'noop transform succeeds');
});

test('tracks refs and clears them from hasOne relationships when a referenced record is removed', function() {
  cache = new Cache(schema);

  var jupiter = { type: 'planet', id: 'p1', attributes: { name: 'Jupiter' }, relationships: { moons: { data: undefined } } };
  var io = { type: 'moon', id: 'm1', attributes: { name: 'Io' }, relationships: { planet: { data: 'planet:p1' } } };
  var europa = { type: 'moon', id: 'm2', attributes: { name: 'Europa' }, relationships: { planet: { data: 'planet:p1' } } };

  cache.transform([{ op: 'add', path: 'planet/p1', value: jupiter },
                   { op: 'add', path: 'moon/m1', value: io },
                   { op: 'add', path: 'moon/m2', value: europa }]);

  equal(cache.get('moon/m1/relationships/planet/data'), 'planet:p1', 'Jupiter has been assigned to Io');
  equal(cache.get('moon/m2/relationships/planet/data'), 'planet:p1', 'Jupiter has been assigned to Europa');

  cache.transform([{ op: 'remove', path: 'planet/p1' }]);

  equal(cache.get('planet/p1'), undefined, 'Jupiter is GONE');

  equal(cache.get('moon/m1/relationships/planet/data'), undefined, 'Jupiter has been cleared from Io');
  equal(cache.get('moon/m2/relationships/planet/data'), undefined, 'Jupiter has been cleared from Europa');
});

test('tracks refs and clears them from hasMany relationships when a referenced record is removed', function() {
  cache = new Cache(schema);

  var io = { type: 'moon', id: 'm1', attributes: { name: 'Io' }, relationships: { planet: { data: null } } };
  var europa = { type: 'moon', id: 'm2', attributes: { name: 'Europa' }, relationships: { planet: { data: null } } };
  var jupiter = { type: 'planet', id: 'p1', attributes: { name: 'Jupiter' }, relationships: { moons: { data: { 'moon:m1': true, 'moon:m2': true } } } };

  cache.transform([{ op: 'add', path: 'moon/m1', value: io },
                   { op: 'add', path: 'moon/m2', value: europa },
                   { op: 'add', path: 'planet/p1', value: jupiter }]);

  equal(cache.get('planet/p1/relationships/moons/data/moon:m1'), true, 'Jupiter has been assigned to Io');
  equal(cache.get('planet/p1/relationships/moons/data/moon:m2'), true, 'Jupiter has been assigned to Europa');

  cache.transform([{ op: 'remove', path: 'moon/m1' }]);
  equal(cache.get('moon/m1'), null, 'Io is GONE');

  cache.transform([{ op: 'remove', path: 'moon/m2' }]);
  equal(cache.get('moon/m2'), null, 'Europa is GONE');

  equal(cache.get('planet/p1/relationships/moons/data/moon:m1'), null, 'Io has been cleared from Jupiter');
  equal(cache.get('planet/p1/relationships/moons/data/moon:m2'), null, 'Europa has been cleared from Jupiter');
});

test('for a sparse cache, adds link to hasMany if record doesn\'t exist', function() {
  expect(2);

  cache = new Cache(schema);

  let operation = { op: 'add', path: ['planet', 'p1', 'relationships', 'moons', 'data', 'moon:moon1'], value: true };

  cache.on('patch', (op) => {
    equalOps(op, operation, 'operation was applied');
  });

  cache.transform([operation]);

  equal(cache.get('planet/p1/relationships/moons/data/moon:moon1'), true, 'relationship was added');
});

test('for a non-sparse cache, does not add link to hasMany if record doesn\'t exist', function() {
  expect(1);

  cache = new Cache(schema, { sparse: false });

  cache.on('patch', (op) => {
    ok(false, 'no operations were applied');
  });

  let operation = { op: 'add', path: ['planet', 'p1', 'relationships', 'moons', 'data', 'moon:moon1'], value: true };
  cache.transform([operation]);

  equal(cache.get('planet/p1'), undefined, 'relationship was not added');
});

test('does not remove link from hasMany if record doesn\'t exist', function() {
  expect(1);

  cache = new Cache(schema);

  cache.on('patch', (op) => {
    ok(false, 'no operations were applied');
  });

  let operation = { op: 'remove', path: ['planet', 'p1', 'relationships', 'moons', 'data', 'moon:moon1'], value: true };
  cache.transform([operation]);

  equal(cache.get('planet/p1'), undefined, 'planet does not exist');
});

test('for a sparse cache, adds (instead of replaces) hasOne if record doesn\'t exist', function() {
  cache = new Cache(schema);

  let operation = { op: 'replace', path: ['moon', 'moon1', 'relationships', 'planet', 'data'], value: 'planet:p1' };

  cache.on('patch', (op) => {
    equalOps(op, operation, 'applied operation');
  });

  cache.transform([operation]);
});

test('for a non-sparse cache, does not replace hasOne if record doesn\'t exist', function() {
  expect(1);

  cache = new Cache(schema, { sparse: false });

  cache.on('patch', (op) => {
    ok(false, 'no operations were applied');
  });

  let operation = { op: 'replace', path: ['moon', 'moon1', 'relationships', 'planet', 'data'], value: 'planet:p1' };
  cache.transform([operation]);

  ok(true, 'transform completed');
});

test('does not remove hasOne link if record doesn\'t exist', function() {
  expect(1);

  cache = new Cache(schema);

  cache.on('patch', (op) => {
    ok(false, 'no operations were applied');
  });

  let operation = { op: 'remove', path: ['moon', 'moon1', 'relationships', 'planet', 'data'], value: 'planet:p1' };

  cache.transform([operation]);

  ok(true, 'transform completed');
});

test('does not add link to hasMany if link already exists', function() {
  expect(1);

  cache = new Cache(schema);

  let jupiter = { id: 'p1', name: 'Jupiter', relationships: { moons: { data: { 'moon:m1': true } } } };
  cache.transform([{ op: 'add', path: ['planet', jupiter.id], value: jupiter }]);

  cache.on('patch', (op) => {
    ok(false, 'no operations were applied');
  });

  let operation = { op: 'replace', path: ['planet', jupiter.id, 'relationships', 'moons', 'data', 'moon:m1'], value: true };
  cache.transform([operation]);

  ok(true, 'transform completed');
});

test('does not remove link from hasMany if link doesn\'t exist', function() {
  expect(1);

  cache = new Cache(schema);

  let jupiter = { id: 'p1', name: 'Jupiter', relationships: { moons: {} } };
  cache.transform([{ op: 'add', path: ['planet', jupiter.id], value: jupiter }]);

  cache.on('patch', (op) => {
    ok(false, 'no operations were applied');
  });

  let operation = { op: 'remove', path: ['planet', jupiter.id, 'relationships', 'moons', 'data', 'moon:m1'] };
  cache.transform([operation]);

  ok(true, 'transform completed');
});

test('does not replace hasOne if link already exists', function() {
  expect(1);

  cache = new Cache(schema);
  var europa = { id: 'm1', name: 'Europe', relationships: { planet: { data: 'planet:p1' } } };
  cache.transform([{ op: 'add', path: ['moon', europa.id], value: europa }]);

  cache.on('patch', (op) => {
    ok(false, 'no operations were applied');
  });

  let operation = { op: 'replace', path: ['moon', europa.id, 'relationships', 'planet', 'data'], value: 'planet:p1' };
  cache.transform([operation]);

  ok(true, 'transform completed');
});

test('does not remove hasOne if link doesn\'t exist', function() {
  expect(1);

  cache = new Cache(schema);

  let europa = { id: 'm1', name: 'Europe' };
  cache.transform([{ op: 'add', path: ['moon', europa.id], value: europa }]);

  cache.on('patch', (op) => {
    ok(false, 'no operations were applied');
  });

  let operation = { op: 'remove', path: ['moon', europa.id, 'relationships', 'planet'] };
  cache.transform([operation]);

  ok(true, 'transform completed');
});

test('removing model with a bi-directional hasOne', function() {
  expect(5);

  var hasOneSchema = new Schema({
    models: {
      one: {
        relationships: {
          two: { type: 'hasOne', model: 'two', inverse: 'one' }
        }
      },
      two: {
        relationships: {
          one: { type: 'hasOne', model: 'one', inverse: 'two' }
        }
      }
    }
  });
  cache = new Cache(hasOneSchema);
  cache.transform([
    {
      op: 'add', path: 'one/1',
      value: {
        id: '1',
        type: 'one',
        relationships: {
          two: { data: undefined }
        }
      }
    },
    {
      op: 'add', path: 'two/2',
      value: {
        id: '2',
        type: 'two',
        relationships: {
          one: { data: 'one:1' }
        }
      }
    }
  ]);
  var one = cache.get(['one', '1']);
  var two = cache.get(['two', '2']);
  ok(one, 'one exists');
  ok(two, 'two exists');
  equal(one.relationships.two.data, 'two:2', 'one links to two');
  equal(two.relationships.one.data, 'one:1', 'two links to one');

  cache.transform([{ op: 'remove', path: 'two/2' }]);
  strictEqual(one.relationships.two.data, null, 'ones link to two got removed');

  // TODO
  // deepEqual(
  //   result.inverseOperations,
  //   [
  //     {
  //       op: 'add',
  //       path: ['two', '2'],
  //       value: {
  //         type: 'two',
  //         id: '2',
  //         relationships: {
  //           one: {
  //             data: 'one:1'
  //           }
  //         }
  //       }
  //     },
  //     {
  //       op: 'replace',
  //       path: ['one', '1', 'relationships', 'two', 'data'],
  //       value: 'two:2'
  //     }
  //   ],
  //   'inverse ops match'
  // );
});

test('removes dependent records', function() {
  // By making this schema recursively dependent remove we check that recursive
  // works as well.
  var dependentSchema = new Schema({
    models: {
      planet: {
        relationships: {
          moons: { type: 'hasMany', model: 'moon', dependent: 'remove' }
        }
      },
      moon: {
        relationships: {
          planet: { type: 'hasOne', model: 'planet', dependent: 'remove' }
        }
      }
    }
  });
  cache = new Cache(dependentSchema);

  var jupiter = { type: 'planet', id: 'p1', attributes: { name: 'Jupiter' }, relationships: { moons: {} } };
  var io = { type: 'moon', id: 'm1', attributes: { name: 'Io' }, relationships: { planet: { data: 'planet:p1' } } };
  var europa = { type: 'moon', id: 'm2', attributes: { name: 'Europa' }, relationships: { planet: { data: 'planet:p1' } } };

  cache.transform([
    { op: 'add', path: 'planet/p1', value: jupiter },
    { op: 'add', path: 'moon/m1', value: io },
    { op: 'add', path: 'moon/m2', value: europa },
    { op: 'add', path: 'planet/p1/relationships/moons/data/moon:m1', value: true },
    { op: 'add', path: 'planet/p1/relationships/moons/data/moon:m2', value: true }
  ]);

  // Removing the moon should remove the planet should remove the other moon
  var result = cache.transform([{ op: 'remove', path: 'moon/m1' }]);

  equal(cache.length('moon'), 0, 'No moons left in store');
  equal(cache.length('planet'), 0, 'No planets left in store');

  // TODO
  // deepEqual(
  //   result.inverseOperations,
  //   [
  //     {
  //       op: 'add',
  //       path: ['moon', 'm1'],
  //       value: {
  //         id: 'm1',
  //         name: 'Io',
  //         relationships: {
  //           planet: 'p1'
  //         }
  //       }
  //     },
  //     {
  //       op: 'add',
  //       path: ['planet', 'p1'],
  //       value: {
  //         id: 'p1',
  //         name: 'Jupiter',
  //         relationships: {
  //           moons: {
  //             'm1': true,
  //             'm2': true
  //           }
  //         }
  //       },
  //     },
  //     {
  //       op: 'add',
  //       path: ['moon', 'm2'],
  //       value: {
  //         id: 'm2',
  //         name: 'Europa',
  //         relationships: {
  //           planet: 'p1'
  //         }
  //       }
  //     }
  //   ],
  //   'inverse ops match'
  // );
});

test('does not remove non-dependent records', function() {
  var dependentSchema = new Schema({
    models: {
      planet: {
        relationships: {
          moons: { type: 'hasMany', model: 'moon' }
        }
      },
      moon: {
        relationships: {
          planet: { type: 'hasOne', model: 'planet' }
        }
      }
    }
  });
  cache = new Cache(dependentSchema);

  var jupiter = { id: 'p1', name: 'Jupiter', relationships: { moons: { data: {} } } };
  var io = { id: 'm1', name: 'Io', relationships: { planet: 'p1' } };
  var europa = { id: 'm2', name: 'Europa', relationships: { planet: { data: 'p1' } } };

  cache.transform([
    { op: 'add', path: 'planet/p1', value: jupiter },
    { op: 'add', path: 'moon/m1', value: io },
    { op: 'add', path: 'moon/m2', value: europa },
    { op: 'add', path: 'planet/p1/relationships/moons/data/m1', value: true },
    { op: 'add', path: 'planet/p1/relationships/moons/data/m2', value: true }
  ]);

  // Since there are no dependent relationships, no other records will be
  // removed
  cache.transform([{ op: 'remove', path: 'moon/m1' }]);

  equal(cache.length('moon'), 1, 'One moon left in store');
  equal(cache.length('planet'), 1, 'One planet left in store');

  // deepEqual(
  //   result.inverseOperations,
  //   [
  //     {
  //       op: 'add',
  //       path: ['moon', 'm1'],
  //       value: {
  //         id: 'm1',
  //         name: 'Io',
  //         relationships: {
  //           planet: 'p1'
  //         }
  //       }
  //     }
  //   ],
  //   'inverse ops match'
  // );
});