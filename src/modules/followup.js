"use strict";

const path = require("path");
const fs = require("fs");
const { generateIcebreaker } = require("../ai");
const { clean, nameCase } = require("../utils/clean");

const FOLLOWUP_PATH = path.resolve(__dirname, "..", "..", "data", "followup.json");

function loadDB() {
  try {
    if (fs.existsSync(FOLLOWUP_PATH)) return JSON.parse(fs.readFileSync(FOLLOWUP_PATH, "utf-8"));
  } catch { /* corrupted */ }
  return { leads: [], interactions: [] };
}

function saveDB(db) {
  const dir = path.dirname(FOLLOWUP_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FOLLOWUP_PATH, JSON.stringify(db, null, 2));
}

function recordInteraction(entry) {
  const db = loadDB();
  let lead = db.leads.find((l) => l.linkedinUrl === entry.linkedinUrl);
  if (!lead) {
    lead = {
      id: `lead_${Date.now()}`,
      name: nameCase(entry.name),
      company: clean(entry.company, { oneLine: true, max: 80 }),
      linkedinUrl: entry.linkedinUrl,
      firstContact: new Date().toISOString(),
      totalInteractions: 0,
      lastResponse: null,
      status: "cold",
      tags: [],
    };
    db.leads.push(lead);
  }
  const interaction = {
    id: `int_${Date.now()}`,
    leadId: lead.id,
    timestamp: new Date().toISOString(),
    type: entry.type,
    note: clean(entry.note, { oneLine: true, max: 240 }),
    response: clean(entry.response, { max: 400 }),
  };
  db.interactions.push(interaction);
  lead.totalInteractions++;
  lead.lastInteraction = interaction.timestamp;
  if (entry.response) lead.lastResponse = interaction.response;
  if (entry.type === "replied") lead.status = "warm";
  if (lead.totalInteractions >= 3) lead.status = "engaged";
  saveDB(db);
  return interaction;
}

function getStaleLeads(days = 7) {
  const db = loadDB();
  const cutoff = Date.now() - days * 86400000;
  return db.leads.filter((lead) => {
    if (!lead.lastInteraction) return true;
    return new Date(lead.lastInteraction).getTime() < cutoff;
  });
}

function getLeadContext(linkedinUrl) {
  const db = loadDB();
  const lead = db.leads.find((l) => l.linkedinUrl === linkedinUrl);
  if (!lead) return null;
  const interactions = db.interactions
    .filter((i) => i.leadId === lead.id)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return {
    lead,
    recentInteractions: interactions.slice(0, 5),
    daysSinceLastContact: lead.lastInteraction
      ? Math.floor((Date.now() - new Date(lead.lastInteraction).getTime()) / 86400000)
      : Infinity,
  };
}

async function generateFollowupMessage(linkedinUrl) {
  const ctx = getLeadContext(linkedinUrl);
  const fallback = "Cześć — wracam z propozycją wymiany doświadczeń wokół AI i automatyzacji procesów. Masz 15 minut w przyszłym tygodniu?";
  if (!ctx) return fallback;

  try {
    const lastNote = ctx.recentInteractions[0]?.note || "";
    const msg = await generateIcebreaker({
      name: ctx.lead.name,
      title: ctx.lead.status,
      company: ctx.lead.company,
      lastPost: ctx.lead.lastResponse || lastNote || "brak ostatniej interakcji",
    });
    return clean(msg, { oneLine: true, max: 200 }) || fallback;
  } catch {
    return fallback;
  }
}

module.exports = { recordInteraction, getStaleLeads, getLeadContext, generateFollowupMessage, loadDB };
