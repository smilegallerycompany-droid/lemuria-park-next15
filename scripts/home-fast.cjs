"use strict";

let pending;
let cached;
let freshUntil = 0;

exports.read = function read(load) {
  if (cached && Date.now() < freshUntil) return Promise.resolve(cached);
  if (!pending) {
    pending = Promise.resolve().then(load).then(result => {
      cached = result;
      freshUntil = Date.now() + 15000;
      return result;
    }).finally(() => { pending = undefined; });
  }
  return pending;
};
