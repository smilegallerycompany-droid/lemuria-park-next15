"use strict";

// Cache only the public homepage render inputs. Booking and cashier reads are independent.
let pending;
let value;
let expiresAt = 0;
exports.read = function read(loader) {
  if (value && Date.now() < expiresAt) return Promise.resolve(value);
  if (!pending) {
    pending = Promise.resolve().then(loader).then((result) => {
      value = result;
      expiresAt = Date.now() + 15000;
      return result;
    }).finally(() => { pending = undefined; });
  }
  return pending;
};
