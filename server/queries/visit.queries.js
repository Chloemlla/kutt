const { isAfter } = require("date-fns");

const utils = require("../utils");
const knex = require("../knex");
const helpers = require("../handlers/helpers.handler");
const redis = require("../redis");
const env = require("../env");
const { now: tzNow, formatDateForDB } = require("../utils/timezone");

async function add(params) {
  const data = {
    ...params,
    country: params.country.toLowerCase(),
    referrer: params.referrer.toLowerCase()
  };

  const nowUTC = formatDateForDB();
  const truncatedNow = nowUTC.substring(0, 10) + " " + nowUTC.substring(11, 14) + "00:00";

  return knex.transaction(async (trx) => {
    // Create a subquery first that truncates the
    const subquery = trx("visits")
      .select("visits.*")
      .select({ created_at_hours: utils.truncatedCreatedAtHour })
      .where({ link_id: data.link_id })
      .as("subquery");

    const visit = await trx
      .select("*")
      .from(subquery)
      .where("created_at_hours", "=", truncatedNow)
      .forUpdate()
      .first();
      
    if (visit) {
      const countries = typeof visit.countries === "string" ? JSON.parse(visit.countries) : visit.countries;
      const referrers = typeof visit.referrers === "string" ? JSON.parse(visit.referrers) : visit.referrers;
      await trx("visits")
        .where({ id: visit.id })
        .increment(`br_${data.browser}`, 1)
        .increment(`os_${data.os}`, 1)
        .increment("total", 1)
        .update({
          updated_at: tzNow(),
          countries: JSON.stringify({
            ...countries,
            [data.country]: (countries[data.country] ?? 0) + 1
          }),
          referrers: JSON.stringify({
            ...referrers,
             [data.referrer]: (referrers[data.referrer] ?? 0) + 1
          })
        });
    } else {
      // This must also happen in the transaction to avoid concurrency
      await trx("visits").insert({
        [`br_${data.browser}`]: 1,
        countries: JSON.stringify({ [data.country]: 1 }),
        referrers: JSON.stringify({ [data.referrer]: 1 }),
        [`os_${data.os}`]: 1,
        total: 1,
        link_id: data.link_id,
        user_id: data.user_id,
      });
    }

    return visit;
  });
}

async function find(match, total) {
  if (match.link_id && env.REDIS_ENABLED) {
    const key = redis.key.stats(match.link_id);
    const cached = await redis.client.get(key);
    if (cached) return JSON.parse(cached);
  }

  const stats = {
    lastDay: {
      stats: utils.getInitStats(),
      views: new Array(24).fill(0),
      total: 0
    },
    lastWeek: {
      stats: utils.getInitStats(),
      views: new Array(7).fill(0),
      total: 0
    },
    lastMonth: {
      stats: utils.getInitStats(),
      views: new Array(30).fill(0),
      total: 0
    },
    lastYear: {
      stats: utils.getInitStats(),
      views: new Array(12).fill(0),
      total: 0
    }
  };

  const visitsStream = knex("visits").where(match).stream();
  const now = new Date(); // Keep as Date object for date-fns calculations

  const periods = utils.getStatsPeriods(now);

  try {
    for await (const visit of visitsStream) {
      periods.forEach(([type, fromDate]) => {
        const isIncluded = isAfter(utils.parseDatetime(visit.created_at), fromDate);
        if (!isIncluded) return;
        
        const diffFunction = utils.getDifferenceFunction(type);
        const diff = diffFunction(now, utils.parseDatetime(visit.created_at));
        const index = stats[type].views.length - diff - 1;
        const period = stats[type].stats;
        
        const countries = typeof visit.countries === "string" ? JSON.parse(visit.countries) : visit.countries;
        const referrers = typeof visit.referrers === "string" ? JSON.parse(visit.referrers) : visit.referrers;
        
        // Mutate existing objects instead of creating new ones (memory optimization)
        period.browser.chrome += visit.br_chrome;
        period.browser.edge += visit.br_edge;
        period.browser.firefox += visit.br_firefox;
        period.browser.ie += visit.br_ie;
        period.browser.opera += visit.br_opera;
        period.browser.other += visit.br_other;
        period.browser.safari += visit.br_safari;
        
        period.os.android += visit.os_android;
        period.os.ios += visit.os_ios;
        period.os.linux += visit.os_linux;
        period.os.macos += visit.os_macos;
        period.os.other += visit.os_other;
        period.os.windows += visit.os_windows;
        
        // Merge countries
        Object.entries(countries).forEach(([country, count]) => {
          period.country[country] = (period.country[country] || 0) + count;
        });
        
        // Merge referrers
        Object.entries(referrers).forEach(([referrer, count]) => {
          period.referrer[referrer] = (period.referrer[referrer] || 0) + count;
        });
        
        stats[type].views[index] += visit.total;
        stats[type].total += visit.total;
      });
    }
  } catch (error) {
    // Ensure stream is destroyed on error
    visitsStream.destroy();
    throw error;
  } finally {
    // Clean up stream if not already ended
    if (!visitsStream.destroyed) {
      visitsStream.destroy();
    }
  }

  const response = {
    lastYear: {
      stats: utils.statsObjectToArray(stats.lastYear.stats),
      views: stats.lastYear.views,
      total: stats.lastYear.total
    },
    lastDay: {
      stats: utils.statsObjectToArray(stats.lastDay.stats),
      views: stats.lastDay.views,
      total: stats.lastDay.total
    },
    lastMonth: {
      stats: utils.statsObjectToArray(stats.lastMonth.stats),
      views: stats.lastMonth.views,
      total: stats.lastMonth.total
    },
    lastWeek: {
      stats: utils.statsObjectToArray(stats.lastWeek.stats),
      views: stats.lastWeek.views,
      total: stats.lastWeek.total
    },
    updatedAt: new Date() // Keep as Date object for response
  };

  if (match.link_id && env.REDIS_ENABLED) {
    const key = redis.key.stats(match.link_id);
    redis.client.set(key, JSON.stringify(response), "EX", 60);
  }

  return response;
};


module.exports = {
  add,
  find
};