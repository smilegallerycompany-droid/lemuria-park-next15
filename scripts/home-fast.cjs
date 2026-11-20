"use strict";
// Limit the time a public page can spend waiting for CMS and schedule queries.
const seed = require("./home-public-seed.json");
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
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(seed), 120);
    pending.then(value => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(seed); });
  });
};
