const useragent = require("express-useragent").default;
const geoip = require("geoip-lite");
const URL = require("node:url");

const { removeWww, getUseragentBrowser, getUseragentOS } = require("../utils");
const query = require("../queries");
const statsQuery = require("../queries/stats.queries");

module.exports = async function({ data }) {
  try {
    // Increment visit count first (lighter operation)
    await query.link.incrementVisit({ id: data.link.id });

    // Parse user agent
    // the following line is for backward compatibility
    // used to send the whole header to get the user agent
    const userAgent = data.userAgent || data.headers?.["user-agent"];
    if (!userAgent) {
      console.warn("No user agent provided for visit");
      return;
    }

    const agent = useragent.parse(userAgent);
    const browser = getUseragentBrowser(agent);
    const os = getUseragentOS(agent);

    // Parse referrer safely
    let referrer = "Direct";
    let referrerDomain = null;
    if (data.referrer) {
      try {
        const parsed = URL.parse(data.referrer);
        if (parsed.hostname) {
          referrerDomain = removeWww(parsed.hostname);
          referrer = referrerDomain.replace(/\./gi, "[dot]");
        }
      } catch (err) {
        console.warn("Failed to parse referrer:", data.referrer);
      }
    }

    // Get geo location
    const geoData = geoip.lookup(data.ip);
    const country = data.country || geoData?.country || "Unknown";

    // Parse UTM parameters from referrer
    let utmParams = {};
    if (data.referrer) {
      try {
        const parsed = new globalThis.URL(data.referrer);
        utmParams = {
          utm_source: parsed.searchParams.get("utm_source"),
          utm_medium: parsed.searchParams.get("utm_medium"),
          utm_campaign: parsed.searchParams.get("utm_campaign"),
          utm_term: parsed.searchParams.get("utm_term"),
          utm_content: parsed.searchParams.get("utm_content"),
        };
      } catch (err) {
        // URL parse failed, skip UTM
      }
    }

    // Add aggregated visit stats (for historical stats)
    await query.visit.add({
      browser,
      country,
      link_id: data.link.id,
      user_id: data.link.user_id,
      os,
      referrer,
    });

    // Add detailed visit record (for real-time stats)
    await statsQuery.addDetailedVisit({
      link_id: data.link.id,
      user_id: data.link.user_id,
      ip_address: data.ip,
      country: country,
      city: geoData?.city,
      region: geoData?.region,
      browser: browser,
      browser_version: agent.version,
      os: os,
      os_version: agent.os,
      device_type: agent.isMobile ? "Mobile" : agent.isTablet ? "Tablet" : "Desktop",
      device_brand: null,
      device_model: null,
      referrer: data.referrer,
      referrer_domain: referrerDomain,
      utm_source: utmParams.utm_source,
      utm_medium: utmParams.utm_medium,
      utm_campaign: utmParams.utm_campaign,
      utm_term: utmParams.utm_term,
      utm_content: utmParams.utm_content,
      language: data.headers?.["accept-language"]?.split(",")[0],
      is_bot: agent.isBot || false,
      is_unique: false, // TODO: implement unique visitor detection
    });
  } catch (error) {
    console.error("Visit processing error:", error);
    throw error;
  }
};
