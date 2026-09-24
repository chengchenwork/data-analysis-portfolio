((root, factory) => {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TeacherMetrics = api;
})(typeof window !== "undefined" ? window : globalThis, () => {
  "use strict";

  function safeDivide(numerator, denominator) {
    return denominator ? numerator / denominator : 0;
  }

  function schemaIndex(schema) {
    return Object.fromEntries(schema.map((name, index) => [name, index]));
  }

  function pearsonFromMoments(moment) {
    const { n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0 } = moment || {};
    if (n < 3) return null;
    const numerator = n * sxy - sx * sy;
    const xVariance = n * sxx - sx * sx;
    const yVariance = n * syy - sy * sy;
    if (xVariance <= 0 || yVariance <= 0) return null;
    const value = numerator / Math.sqrt(xVariance * yVariance);
    return Math.max(-1, Math.min(1, value));
  }

  function filterRecords(records, schema, state, dimensions = {}) {
    const index = schemaIndex(schema);
    const rooms = dimensions.rooms || [];
    const categories = dimensions.categories || [];
    return records.filter((record) => {
      if (index.semester !== undefined && record[index.semester] !== state.semester) return false;
      if (
        index.week !== undefined &&
        state.week !== "all" &&
        record[index.week] !== Number(state.week)
      ) return false;
      if (
        index.holiday !== undefined &&
        state.holidayMode === "adjusted" &&
        record[index.holiday] === 1
      ) return false;

      const room = index.room === undefined ? null : rooms[record[index.room]];
      const recordCategory = index.category === undefined
        ? room?.category
        : categories[record[index.category]];
      if (state.category !== "all" && recordCategory !== state.category) return false;
      if (state.type !== "all" && room?.type !== state.type) return false;
      if (state.location !== "all" && room?.code !== state.location) return false;
      return true;
    });
  }

  function summariseGhosts(records) {
    const summary = records.reduce(
      (result, record) => {
        result.eligible += Number(record.eligible || 0);
        result.ghost += Number(record.ghost || 0);
        return result;
      },
      { eligible: 0, ghost: 0 },
    );
    return { ...summary, share: safeDivide(summary.ghost, summary.eligible) };
  }

  function summariseEnergy(records) {
    const summary = records.reduce(
      (result, record) => {
        result.emptySeatHours += Number(record.emptySeatHours || 0);
        result.availableSeatHours += Number(record.availableSeatHours || 0);
        return result;
      },
      { emptySeatHours: 0, availableSeatHours: 0 },
    );
    return {
      ...summary,
      rate: safeDivide(summary.emptySeatHours, summary.availableSeatHours),
    };
  }

  function summariseBuildings(records) {
    const concurrent = new Map();
    records.forEach((record) => {
      const key = [
        record.building,
        record.semester,
        record.week,
        record.date,
        record.hour,
      ].join("|");
      const item = concurrent.get(key) || {
        building: record.building,
        headcount: 0,
        capacity: 0,
      };
      item.headcount += Number(record.headcount || 0);
      item.capacity += Number(record.capacity || 0);
      concurrent.set(key, item);
    });

    const buildings = new Map();
    concurrent.forEach((record) => {
      if (record.capacity <= 0) return;
      const rate = record.headcount / record.capacity;
      const item = buildings.get(record.building) || {
        building: record.building,
        rateSum: 0,
        hours: 0,
        max: -Infinity,
        peakHeadcount: 0,
        peakCapacity: 0,
      };
      item.rateSum += rate;
      item.hours += 1;
      if (rate > item.max) {
        item.max = rate;
        item.peakHeadcount = record.headcount;
        item.peakCapacity = record.capacity;
      }
      buildings.set(record.building, item);
    });

    return [...buildings.values()]
      .map((item) => ({
        building: item.building,
        average: safeDivide(item.rateSum, item.hours),
        max: Number.isFinite(item.max) ? item.max : 0,
        peakHeadcount: item.peakHeadcount,
        peakCapacity: item.peakCapacity,
        hours: item.hours,
      }))
      .sort((left, right) => left.building - right.building);
  }

  function sumMoments(records) {
    return records.reduce(
      (result, record) => {
        result.n += Number(record.n || 0);
        result.sx += Number(record.sx || 0);
        result.sy += Number(record.sy || 0);
        result.sxx += Number(record.sxx || 0);
        result.syy += Number(record.syy || 0);
        result.sxy += Number(record.sxy || 0);
        result.ratioSum += Number(record.ratioSum || 0);
        result.ghost += Number(record.ghost || 0);
        return result;
      },
      { n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0, ratioSum: 0, ghost: 0 },
    );
  }

  function recordsToObjects(records, schema) {
    const index = schemaIndex(schema);
    return records.map((record) =>
      Object.fromEntries(Object.entries(index).map(([name, position]) => [name, record[position]])),
    );
  }

  return Object.freeze({
    safeDivide,
    schemaIndex,
    pearsonFromMoments,
    filterRecords,
    summariseGhosts,
    summariseEnergy,
    summariseBuildings,
    sumMoments,
    recordsToObjects,
  });
});
