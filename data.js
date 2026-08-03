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

  return { master, masterTotal: total, insights: newInsights, zips: newZips, scalars, staleDays };
}

// Shared fetch helper — resolves to parsed rows, or null on any failure (never throws).
function fetchCustomerFeed(parse){
  if(!CUSTOMER_FEED_CSV) return Promise.resolve(null);
  return fetch(CUSTOMER_FEED_CSV, { cache: "no-store" })
    .then(r => { if(!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
    .then(t => parse(t))
    .catch(() => null);
}
