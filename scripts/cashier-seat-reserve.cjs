"use strict";

const normalCapacity = 15;
const reserve = 3;

function getReserveRemaining(availability, session, location = session?.location) {
  if (availability.capacity !== normalCapacity || session?.park !== "LEMURIA" ||
      location?.slug !== "saratov" || !Number.isSafeInteger(availability.booked)) return 0;
  return Math.min(reserve, Math.max(0, normalCapacity + reserve - availability.booked));
}

function forSale(availability, session) {
  const remaining = getReserveRemaining(availability, session);
  return remaining > 0 ? { ...availability, available: availability.available + remaining } : availability;
}

function forList(availability, session, location) {
  const reserveRemaining = getReserveRemaining(availability, session, location);
  return {
    capacity: availability.capacity, sold: availability.booked, remaining: availability.available,
    soldOut: availability.available + reserveRemaining <= 0, reserveRemaining,
  };
}

module.exports = { forSale, forList };
