/* Shared data for the Road to 1,600 dashboard (index.html) AND the website counter (embed.html).

   ⭐ AS OF 2026-07-28 THIS FILE IS MOSTLY A FALLBACK.
   The member count, weekly signup batches, cart split, referral count, drop-off switcher count
   and channel mix are now fetched live from the "Dashboard Feed" tab of
   "Maggie's Master Confirmed Customer List" (published to web as CSV — aggregate counts only,
   never names, emails or addresses). The baked values below are the last-known-good snapshot:
   they render instantly and cover us if the fetch fails.

   You should no longer need to hand-edit MASTER every week. Brent updates the customer sheet
   every ~2 days and the dashboard picks it up on the next page load.
*/

// Weekly Log tab of Road_to_1600_Tracker, published to web as CSV.
// Still used for: net-adds pace, blue timeline bars, waitlist size, current-total fallback.
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRl4kwEpiLnOkxVcwaPJqoXO9beOaH_P9wb8uSkzPJCNpFkgH61I_Ml_Kg-y44BKKT3lfO3dtn3-065/pub?gid=1242657682&single=true&output=csv";

// "Dashboard Feed" tab of Maggie's Master Confirmed Customer List, published to web as CSV.
// Three columns: type,label,n — where type is one of scalar | batch | cart | channel | zip.
// Scalars: org_rows, provisioned_accounts, referred, dcc_yes, dcc_no, channel_answered, data_through.
// data_through is the latest Submission Date actually on file — NOT today's date, so the
// "as of" label tells the truth when a couple of days go by between exports.
// AGGREGATE COUNTS ONLY. Keep it that way: this tab is publicly readable.
// Published 2026-07-28. If this ever 404s, re-publish the tab and swap the URL — while it is
// empty or unreachable the dashboard silently uses the baked fallbacks below.
const CUSTOMER_FEED_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQqBESxBK-O7eDt7oDGPi3VUlbXDHvQivi3NRUPj09-ghnMDdSgD7rW5-dhmUc4p6VGbPby-xv0husk/pub?gid=1423205768&single=true&output=csv";

const GOAL = 1600;
const BASELINE = 213;             // verified July 1, 2026

// FALLBACK ONLY — live values come from the feed (scalars + type=batch rows).
// Last hand-verified 2026-07-28: 254 confirmed accounts (CCC 1–254) across 15 Wednesday
// onboarding batches. (The LIVE feed now sends signups per Wed–Tue week instead; this baked
// snapshot keeps the old onboarding shape and is only shown if the feed is unreachable.)
let MASTER = {
  asOf: "Jul 28",
  batches: [
    {week:"Apr 15", n:51, launch:true}, {week:"Apr 22", n:11}, {week:"Apr 29", n:31},
    {week:"May 6",  n:22}, {week:"May 13", n:17}, {week:"May 20", n:26}, {week:"May 27", n:9},
    {week:"Jun 3",  n:13}, {week:"Jun 11", n:11}, {week:"Jun 17", n:18}, {week:"Jun 24", n:5},
    {week:"Jul 1",  n:8},  {week:"Jul 8",  n:9},  {week:"Jul 15", n:7},  {week:"Jul 22", n:16}
  ]
};
let MASTER_TOTAL = MASTER.batches.reduce((s,b)=>s+b.n,0);

/* ============================================================
   CUSTOMER FEED — parsing + normalisation
   ============================================================ */

// Cart labels arrive in two naming conventions in the source sheet
// ("35GallonToter" from the original import, "35-gallon — $25/mo" from the current form).
// Both normalise to one bucket. 96-gallon is a typo variant of 95.
function normaliseCart(label){
  const m = String(label).match(/(\d{2})/);
  if(!m) return null;
  const g = m[1] === "96" ? "95" : m[1];
  return ["35","65","95"].includes(g) ? g + "-gallon" : null;
}

// "Where did you first hear about this program?" is free text on the form, so it gets
// keyword-bucketed into the SAME channel names the target ranges already use.
// Returns null on purpose for referral and drop-off answers: those two levers are counted
// from their own dedicated columns (Referred / existing DCC?), and adding the free-text
// answers on top would credit the same person to the same lever twice.
function bucketChannel(label){
  const s = String(label).toLowerCase();
  if(/facebook|instagram|\bads?\b|ad on|social media/.test(s))                              return "Meta ads";
  if(/drop.?off|current (compost club|member)|compost club m|already a member|already using/.test(s)) return null;
  if(/hillside email|newsletter|eco.?club/.test(s))                                          return "Other";
  if(/news|paper|podcast|article|press|radio|\btv\b/.test(s))                                return "Press / podcast";
  if(/booth|dundee days|earth day|event|\btalk\b|fair|market/.test(s))                       return "Speaking";
  if(/search|online|google|website|internet/.test(s))                                        return "Other";
  if(/friend|neighbo|word of mouth|know you|daughter|\bson\b|family|cart|truck|\bcan\b|sign/.test(s)) return "Organic / WOM";
  return "Other";
}

// "2026-07-27" → "Jul 27". Anything unparseable is passed through unchanged.
function shortDate(iso){
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return String(iso);
  return new Date(+m[1], +m[2]-1, +m[3]).toLocaleDateString("en-US",{month:"short",day:"numeric"});
}

function batchDate(raw){
  const p = String(raw).split(".");
  if(p.length !== 3) return new Date(0);
  const yr = p[2].length === 2 ? 2000 + parseInt(p[2],10) : parseInt(p[2],10);
  return new Date(yr, parseInt(p[0],10) - 1, parseInt(p[1],10));
}

// Turn the feed's type,label,n rows into the shapes the dashboard already renders.
// Returns null if the feed is missing, malformed or empty, so callers fall back to baked values.
function applyCustomerFeed(rows, insights, zips){
  if(!rows || rows.length < 2) return null;
  const head = rows[0].map(h => String(h).trim().toLowerCase());
  if(head[0] !== "type" || head[1] !== "label" || head[2] !== "n") return null;

  const scalars = {}, batches = [], carts = {}, channels = {}, zipMembers = {};
  for(const r of rows.slice(1)){
    const type  = String(r[0] || "").trim();
    const label = String(r[1] || "").trim();
    const raw   = String(r[2] || "").trim();
    // Strict numeric test on purpose: a loose parseFloat turns the "2026-07-27" date stamp
    // into the number 2026, which is how "updated Jul 27" once rendered as "updated 2026".
    const n     = /^-?\d+(\.\d+)?$/.test(raw.replace(/,/g,"")) ? parseFloat(raw.replace(/,/g,"")) : NaN;
    if(!type || !label) continue;
    if(type === "scalar"){ scalars[label] = isNaN(n) ? raw : n; continue; }
    if(isNaN(n)) continue;
    if(type === "batch")        batches.push({ raw: label, n });
    else if(type === "cart")    { const k = normaliseCart(label);  if(k) carts[k]      = (carts[k]      || 0) + n; }
    else if(type === "channel") { const k = bucketChannel(label);  if(k) channels[k]   = (channels[k]   || 0) + n; }
    else if(type === "zip")           zipMembers[label] = (zipMembers[label] || 0) + n;
  }

  // "Brent's Organized Sheet" is the source of truth (Jotform exports pasted in every ~2 days),
  // so org_rows leads. But it can't undercount households already being serviced, and it was
  // still catching up on history as of 28 Jul (230 rows vs 254 provisioned accounts) — so the
  // headline takes whichever is higher. Once the exports pass 254 this becomes org_rows alone
  // and provisioned_accounts stops mattering, with no code change needed.
  const org  = typeof scalars.org_rows === "number" ? scalars.org_rows : 0;
  const prov = typeof scalars.provisioned_accounts === "number" ? scalars.provisioned_accounts : 0;
  const total = Math.max(org, prov);
  if(total <= 0) return null;   // feed present but unusable

  // Batch labels are "M.D.YY" strings. AS OF 2026-08-03 they are Wednesday WEEK-STARTS:
  // the feed buckets the Organized Sheet's Submission Dates into Wed→Tue weeks (Omaha's
  // weekly convention), so every one of Brent's ~2-day pastes updates the timeline with no
  // team step. (Before this they were onboarding-batch stamps scraped from Customer Upload
  // col P — that tab is no longer read for the timeline; weeks with zero signups don't appear.)
  batches.sort((a,b) => batchDate(a.raw) - batchDate(b.raw));
  const master = {
    asOf: scalars.data_through ? shortDate(scalars.data_through) :MASTER.asOf,
    batches: batches.map((b,i) => ({
      week: batchDate(b.raw).toLocaleDateString("en-US",{month:"short",day:"numeric"}),
      n: b.n,
      launch: i === 0
    }))
  };

  const cartOrder = ["35-gallon","65-gallon","95-gallon"];
  const cartList  = cartOrder.filter(k => carts[k]).map(k => ({ label: k, n: carts[k] }));

  const seed = Object.assign({}, channels);
  if(scalars.referred > 0) seed["Referral"]       = scalars.referred;
  if(scalars.dcc_yes  > 0) seed["Drop-off email"] = scalars.dcc_yes;

  const sample = scalars.org_rows || total;
  const newInsights = {
    asOf: scalars.data_through ? shortDate(scalars.data_through) :insights.asOf,
    n: sample,
    answered: scalars.channel_answered || 0,
    referred: scalars.referred || 0,
    dropoffSwitchers: scalars.dcc_yes || 0,
    // A blank drop-off answer means unknown, not "no" — so the switcher % is taken
    // out of the people who actually answered that question.
    dropoffAnswered: (scalars.dcc_yes || 0) + (scalars.dcc_no || 0),
    channelSeed: seed,
    carts: cartList.length ? cartList : insights.carts
  };

  // Zip table: refresh the Members column only. Qualified/Waitlist still come from the
  // intake sheet, so the table's row set is left exactly as it is.
  const newZips = zips.map(z => ({ ...z, m: (z.zip in zipMembers) ? zipMembers[z.zip] : z.m }));

  // Days since the newest signup on file. Drives the staleness badge: the whole point of a
  // self-updating dashboard is that nobody eyeballs it before the team quotes it, so the page
  // has to say so itself when the exports stop coming.
  let staleDays = null;
  const dt = String(scalars.data_through || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(dt){
    const then = new Date(+dt[1], +dt[2]-1, +dt[3]);
    const now  = new Date();
    staleDays = Math.floor((new Date(now.getFullYear(),now.getMonth(),now.getDate()) - then)/86400000);
  }

  // zipMembers is exposed raw as well: since 2026-08-03 index.html crosses it with the live
  // per-zip qualified/waitlist counts (zip_q_/zip_w_ rows in the Live counts tab) to build
  // the demand table as a union of zips, instead of refreshing the baked Jul 18 row set.
  return { master, masterTotal: total, insights: newInsights, zips: newZips, zipMembers, scalars, staleDays };
}

// Shared fetch helper — resolves to parsed rows, or null on any failure (never throws).
function fetchCustomerFeed(parse){
  if(!CUSTOMER_FEED_CSV) return Promise.resolve(null);
  return fetch(CUSTOMER_FEED_CSV, { cache: "no-store" })
    .then(r => { if(!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
    .then(t => parse(t))
    .catch(() => null);
}

/* ============================================================
   ROUTE WEIGHTS — live from Airtable "Soil Dynamics Load Log"
   ============================================================ */
// SOURCE OF TRUTH (changed 2026-08-19): Airtable base app5xT5W9Osockx3j, table
// "Loads" (tblROMIvXZWvHZsFD). Rows where Material = "Food/Yard CCC"
// (choice selkyCFdrpQCRjaec). Weight = "Scale Ticket Net Weight (lbs)"
// (fldQtUraZuPNZ1gYt); stops = "Homes picked up" (fldZB0lVusOoXtWoB).
//
// Airtable has no public read URL, so the dashboard cannot fetch it in the browser.
// Instead WEIGHT_DAYS below is refreshed by the monthly "CCC weights — Airtable pull"
// scheduled task (18th of each month, Omaha time), which rewrites this array and
// redeploys. Rows dated before 6/1/2026 are the pre-Airtable history from the old
// Google "Weekly Collection Tracker" and must be preserved on every refresh.
//
// The old published-CSV feed is retired: the tracker sheet stops at 7/6 and would
// overwrite richer Airtable data. Left blank deliberately — do not repopulate.
const WEIGHTS_CSV_URL = "";

// WEIGHING IS A SAMPLE, NOT A CENSUS. The team scale-tickets roughly one route week
// a month; every other collection day is logged with a home count but no weight.
// So: lbs === null means "collected, not weighed" (NOT zero). Loads entered at 0 lbs
// with a "No ticket" note are stored as null here for the same reason.
// Totals are therefore PROJECTED: every logged stop x the measured average lbs/stop.
// stops === null means the day was weighed but the home count was never entered.
const WEIGHT_DAYS = [
    {d:"4/27/2026",stops:61,lbs:2380},{d:"5/4/2026",stops:91,lbs:4840},{d:"5/11/2026",stops:113,lbs:3180},
    {d:"5/18/2026",stops:56,lbs:1500},{d:"5/19/2026",stops:74,lbs:1760},{d:"5/26/2026",stops:62,lbs:1960},
    {d:"6/1/2026",stops:46,lbs:1800},{d:"6/2/2026",stops:101,lbs:2360},{d:"6/8/2026",stops:74,lbs:2560},
    {d:"6/9/2026",stops:105,lbs:2600},{d:"6/15/2026",stops:79,lbs:2880},{d:"6/16/2026",stops:88,lbs:3400},
    {d:"6/22/2026",stops:70,lbs:3300},{d:"6/23/2026",stops:91,lbs:2380},{d:"6/24/2026",stops:36,lbs:2400},
    {d:"6/29/2026",stops:88,lbs:2460},{d:"6/30/2026",stops:92,lbs:2300},{d:"7/1/2026",stops:null,lbs:1120},
    {d:"7/6/2026",stops:93,lbs:2400},{d:"7/7/2026",stops:null,lbs:2220},{d:"7/8/2026",stops:null,lbs:1080},
    {d:"7/13/2026",stops:99,lbs:null},{d:"7/14/2026",stops:105,lbs:null},{d:"7/15/2026",stops:43,lbs:null},
    {d:"7/20/2026",stops:89,lbs:null},{d:"7/21/2026",stops:105,lbs:null},{d:"7/22/2026",stops:44,lbs:null},
    {d:"7/27/2026",stops:48,lbs:null},{d:"7/28/2026",stops:110,lbs:null},{d:"7/29/2026",stops:47,lbs:null},
    {d:"7/30/2026",stops:17,lbs:null},{d:"8/3/2026",stops:101,lbs:null},{d:"8/4/2026",stops:114,lbs:null},
    {d:"8/5/2026",stops:47,lbs:null},{d:"8/6/2026",stops:6,lbs:null},{d:"8/10/2026",stops:99,lbs:3860},
    {d:"8/11/2026",stops:96,lbs:3500},{d:"8/12/2026",stops:44,lbs:1760},{d:"8/13/2026",stops:11,lbs:500},
    {d:"8/17/2026",stops:106,lbs:null},{d:"8/18/2026",stops:111,lbs:null}
];

// Pre-6/1/2026 rows came from the retired Google tracker; kept so launch-to-date
// tracking survives the move to Airtable.
const WEIGHTS_PRE_AIRTABLE_THROUGH = "5/26/2026";
const WEIGHTS_AS_OF = "Aug 18, 2026";

// Back-compat shim: older code paths referenced WEIGHTS_BAKED / fetchWeights.
const WEIGHTS_BAKED = { asOf: WEIGHTS_AS_OF, days: WEIGHT_DAYS };
function fetchWeights(){ return Promise.resolve(null); }

// Rolls WEIGHT_DAYS into the numbers the dashboard shows.
// measuredLbs / measuredStops come ONLY from days that have both a weight and a
// stop count, so the average is never diluted by unweighed or uncounted days.
function weightStats(days){
  const rows = days.map(x => ({ ...x, dt: new Date(x.d) })).sort((a,b) => a.dt - b.dt);
  const sampled = rows.filter(x => x.lbs > 0 && x.stops > 0);
  const measuredLbs   = sampled.reduce((s,x) => s + x.lbs, 0);
  const measuredStops = sampled.reduce((s,x) => s + x.stops, 0);
  const perStop = measuredStops > 0 ? measuredLbs / measuredStops : 0;
  const totalStops = rows.reduce((s,x) => s + (x.stops || 0), 0);
  // A few days were weighed but never got a home count. Their pounds are real, so add
  // them on top of the stop-based projection instead of losing them.
  const orphanLbs = rows.filter(x => x.lbs > 0 && !(x.stops > 0))
                        .reduce((s,x) => s + x.lbs, 0);
  const projectedLbs = totalStops * perStop + orphanLbs;

  // Monday-start route weeks. Each week gets projected lbs (stops x perStop) and a
  // flag for whether any of its days were actually weighed.
  const weeks = new Map();
  for(const x of rows){
    const mon = new Date(x.dt);
    mon.setDate(mon.getDate() - (mon.getDay() + 6) % 7);
    const k = mon.toISOString().slice(0,10);
    if(!weeks.has(k)) weeks.set(k, { mon, stops: 0, lbs: 0, weighed: false });
    const w = weeks.get(k);
    w.stops += x.stops || 0;
    if(x.lbs > 0){ w.lbs += x.lbs; w.weighed = true; }
  }
  const wk = [...weeks.values()].sort((a,b) => a.mon - b.mon)
    // Never show a week as lighter than what actually crossed the scale.
    .map(w => ({ ...w, est: Math.max(w.stops * perStop, w.lbs) }));
  const last4 = wk.slice(-4);
  const avgWeekLbs = last4.reduce((s,w) => s + w.est, 0) / Math.max(last4.length, 1);

  return {
    rows, wk, perStop, totalStops, projectedLbs, measuredLbs, measuredStops,
    sampleDays: sampled.length, avgWeekLbs, tonsYr: avgWeekLbs * 52 / 2000,
    asOf: WEIGHTS_AS_OF
  };
}
