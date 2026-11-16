"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { forSale, forList } = require("./cashier-seat-reserve.cjs");

const session = { park: "LEMURIA", location: { slug: "saratov" } };
const availability = (booked, capacity = 15) => ({ capacity, booked, available: Math.max(0, capacity - booked) });

test("preserves nominal capacity while allowing three cashier seats after online seats run out", () => {
  for (const [sold, normal, reserve] of [[0, 15, 3], [14, 1, 3], [15, 0, 3], [16, 0, 2], [17, 0, 1], [18, 0, 0]]) {
    const seats = availability(sold);
    assert.deepEqual(forList(seats, session, session.location), {
      capacity: 15, sold, remaining: normal, reserveRemaining: reserve, soldOut: sold === 18,
    });
    assert.equal(forSale(seats, session).available, normal + reserve);
    assert.equal(seats.available, normal);
  }
});

test("keeps other parks, locations and capacity-limited sessions on their configured limit", () => {
  const seats = availability(15);
  assert.equal(forSale(seats, { ...session, park: "CHIRIK" }), seats);
  assert.equal(forSale(seats, { ...session, location: { slug: "other-city" } }), seats);
  const smaller = availability(10, 10);
  assert.equal(forSale(smaller, session), smaller);
  assert.equal(forSale(availability(19), session).available, 0);
});
