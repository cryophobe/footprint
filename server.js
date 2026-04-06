const express = require("express");
const fs = require("fs");
const axios = require("axios");
const app = express();
const PORT = 3000;

/* ===============================
   CORS — allow FootPrint frontend
================================ */
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});
app.use(express.json());

/* ===============================
   FOOTPRINT USERS REGISTRY
   Add more users here when needed
================================ */
const FOOTPRINT_USERS = [
  {
    id: 1655857131,
    name: "Blue",
    handle: "@peak_nonchalant",
  },
];

/* ===============================
   LOAD FILES ONCE (IMPORTANT)
================================ */
const messages = JSON.parse(fs.readFileSync("./messages.json", "utf8"));
const groups = JSON.parse(fs.readFileSync("./groups.json", "utf8"));

console.log(`Loaded ${messages.length} messages`);
console.log(`Loaded ${groups.length} groups`);

/* ===============================
   HELPERS
================================ */
function paginate(arr, page = 1, limit = 100) {
  page = Number(page);
  limit = Number(limit);
  const start = (page - 1) * limit;
  const end = start + limit;
  return {
    page,
    total: arr.length,
    pages: Math.ceil(arr.length / limit),
    data: arr.slice(start, end),
  };
}

function sortByDate(data, order = "newest") {
  return [...data].sort((a, b) =>
    order === "oldest"
      ? new Date(a.date) - new Date(b.date)
      : new Date(b.date) - new Date(a.date)
  );
}

function filterByDateRange(data, from, to) {
  return data.filter((m) => {
    const d = new Date(m.date);
    if (from && d < new Date(from)) return false;
    if (to && d > new Date(to)) return false;
    return true;
  });
}

/* ===============================
   ROUTE: FOOTPRINT USERS LIST
   GET /users
================================ */
app.get("/users", (req, res) => {
  res.json(FOOTPRINT_USERS);
});

/* ===============================
   ROUTE: SINGLE USER BY ID
   GET /users/:id
================================ */
app.get("/users/:id", (req, res) => {
  const id = Number(req.params.id);
  const user = FOOTPRINT_USERS.find((u) => u.id === id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

/* ===============================
   ROUTE: HEALTH CHECK
   GET /health
================================ */
app.get("/health", (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: "ok",
    uptime_seconds: Math.floor(process.uptime()),
    messages_loaded: messages.length,
    groups_loaded: groups.length,
    memory: {
      rss_mb: (mem.rss / 1024 / 1024).toFixed(2),
      heap_used_mb: (mem.heapUsed / 1024 / 1024).toFixed(2),
      heap_total_mb: (mem.heapTotal / 1024 / 1024).toFixed(2),
    },
  });
});

/* ===============================
   ROUTE: GLOBAL STATS
   GET /stats
================================ */
app.get("/stats", (req, res) => {
  const dates = messages.map((m) => new Date(m.date)).sort((a, b) => a - b);
  const mediaBreakdown = {};
  let replyCount = 0;
  let textCount = 0;
  let nullTextCount = 0;

  messages.forEach((m) => {
    if (m.mediaKind !== null && m.mediaKind !== undefined) {
      mediaBreakdown[m.mediaKind] = (mediaBreakdown[m.mediaKind] || 0) + 1;
    }
    if (m.isReply) replyCount++;
    if (m.text) textCount++;
    else nullTextCount++;
  });

  res.json({
    total_messages: messages.length,
    total_groups: groups.length,
    date_range: {
      oldest: dates[0]?.toISOString() || null,
      newest: dates[dates.length - 1]?.toISOString() || null,
    },
    reply_count: replyCount,
    text_only_count: textCount,
    media_only_count: nullTextCount,
    reply_rate: ((replyCount / messages.length) * 100).toFixed(2) + "%",
    media_breakdown: mediaBreakdown,
  });
});

/* ===============================
   ROUTE: LIST ALL MESSAGES
   GET /messages?page=1&order=newest
================================ */
app.get("/messages", (req, res) => {
  const { page = 1, order = "newest", from, to } = req.query;
  let result = sortByDate(messages, order);
  if (from || to) result = filterByDateRange(result, from, to);
  res.json(paginate(result, page));
});

/* ===============================
   ROUTE: SINGLE MESSAGE BY ID
   GET /message/:id
================================ */
app.get("/message/:id", (req, res) => {
  const id = Number(req.params.id);
  const msg = messages.find((m) => m.messageid === id);
  if (!msg) return res.status(404).json({ error: "Message not found" });
  res.json(msg);
});

/* ===============================
   ROUTE: REPLIES ONLY
   GET /messages/replies?page=1
================================ */
app.get("/messages/replies", (req, res) => {
  const { page = 1, order = "newest" } = req.query;
  let result = messages.filter((m) => m.isReply === true);
  result = sortByDate(result, order);
  res.json(paginate(result, page));
});

/* ===============================
   ROUTE: TEXT ONLY MESSAGES
   GET /messages/text-only?page=1
================================ */
app.get("/messages/text-only", (req, res) => {
  const { page = 1, order = "newest" } = req.query;
  let result = messages.filter((m) => m.text !== null && m.text !== undefined);
  result = sortByDate(result, order);
  res.json(paginate(result, page));
});

/* ===============================
   ROUTE: ALL MEDIA MESSAGES
   GET /messages/media?kind=4&page=1
================================ */
app.get("/messages/media", (req, res) => {
  const { page = 1, order = "newest", kind } = req.query;
  let result = messages.filter(
    (m) => m.mediaKind !== null && m.mediaKind !== undefined
  );
  if (kind !== undefined) result = result.filter((m) => m.mediaKind === Number(kind));
  result = sortByDate(result, order);
  res.json(paginate(result, page));
});

/* ===============================
   ROUTE: IMAGES ONLY (mediaKind=4)
   GET /media/images?page=1
================================ */
app.get("/media/images", (req, res) => {
  const { page = 1, order = "newest" } = req.query;
  let result = messages.filter((m) => m.mediaKind === 4);
  result = sortByDate(result, order);
  res.json(paginate(result, page));
});

/* ===============================
   ROUTE: DATE RANGE FILTER
   GET /messages/date-range?from=2025-01-01&to=2025-06-01&page=1
================================ */
app.get("/messages/date-range", (req, res) => {
  const { from, to, page = 1, order = "newest" } = req.query;
  if (!from && !to)
    return res.status(400).json({ error: "Provide at least from or to query param" });
  let result = filterByDateRange(messages, from, to);
  result = sortByDate(result, order);
  res.json(paginate(result, page));
});

/* ===============================
   ROUTE: SEARCH MESSAGES
   GET /search?q=hello&page=1&chatid=xxx&exclude=id1,id2
================================ */
app.get("/search", (req, res) => {
  const { q, page = 1, order = "newest", chatid, exclude } = req.query;
  if (!q) return res.status(400).json({ error: "Missing keyword" });
  const keyword = q.toLowerCase();
  let results = messages.filter(
    (m) => m.text && m.text.toLowerCase().includes(keyword)
  );
  if (chatid) results = results.filter((m) => m.chatid === Number(chatid));
  if (exclude) {
    const excludeIds = exclude.split(",").slice(0, 2).map(Number).filter(Boolean);
    if (excludeIds.length) results = results.filter((m) => !excludeIds.includes(m.chatid));
  }
  results = sortByDate(results, order);
  res.json(paginate(results, page));
});

/* ===============================
   ROUTE: LIST GROUPS (from messages)
   GET /groups
================================ */
app.get("/groups", (req, res) => {
  const map = new Map();
  messages.forEach((m) => {
    if (!map.has(m.chatid)) {
      map.set(m.chatid, {
        chatid: m.chatid,
        title: m.chatTitle,
        username: m.chatTag,
        link: m.link,
        in_channel: m.in_channel,
      });
    }
  });
  res.json([...map.values()]);
});

/* ===============================
   ROUTE: ACTIVE GROUPS (in_channel = true)
   GET /groups/active
================================ */
app.get("/groups/active", (req, res) => {
  const map = new Map();
  messages
    .filter((m) => m.in_channel === true)
    .forEach((m) => {
      if (!map.has(m.chatid)) {
        map.set(m.chatid, {
          chatid: m.chatid,
          title: m.chatTitle,
          username: m.chatTag,
          link: m.link,
          in_channel: true,
        });
      }
    });
  res.json([...map.values()]);
});

/* ===============================
   ROUTE: PRIVATE GROUPS
   GET /groups/private
================================ */
app.get("/groups/private", (req, res) => {
  const result = groups.filter((g) => g.isPrivate === true);
  res.json(result);
});

/* ===============================
   ROUTE: TOP GROUPS BY MSG COUNT
   GET /groups/top?by=msg_count&limit=10
================================ */
app.get("/groups/top", (req, res) => {
  const { by = "msg_count", limit = 10 } = req.query;
  const sorted = [...groups].sort((a, b) => {
    if (by === "msg_count") return b.msg_count_in_group - a.msg_count_in_group;
    if (by === "last") return new Date(b.last) - new Date(a.last);
    return 0;
  });
  res.json(sorted.slice(0, Number(limit)));
});

/* ===============================
   ROUTE: RECENTLY ACTIVE GROUPS
   GET /groups/recent?limit=10
================================ */
app.get("/groups/recent", (req, res) => {
  const { limit = 10 } = req.query;
  const sorted = [...groups].sort(
    (a, b) => new Date(b.last) - new Date(a.last)
  );
  res.json(sorted.slice(0, Number(limit)));
});

/* ===============================
   ROUTE: MESSAGE COUNT IN GROUP
   GET /groups/:id/count
================================ */
app.get("/groups/:id/count", (req, res) => {
  const id = Number(req.params.id);
  const count = messages.filter((m) => m.chatid === id).length;
  res.json({ group_id: id, message_count: count });
});

/* ===============================
   ROUTE: MESSAGES IN A GROUP
   GET /groups/:id/messages?page=1&order=newest
================================ */
app.get("/groups/:id/messages", (req, res) => {
  const id = Number(req.params.id);
  const { page = 1, order = "newest" } = req.query;
  let result = messages.filter((m) => m.chatid === id);
  result = sortByDate(result, order);
  res.json(paginate(result, page));
});

/* ===============================
   ROUTE: MEDIA IN A GROUP
   GET /groups/:id/media?page=1&kind=4
================================ */
app.get("/groups/:id/media", (req, res) => {
  const id = Number(req.params.id);
  const { page = 1, kind } = req.query;
  let result = messages.filter(
    (m) =>
      m.chatid === id &&
      m.mediaKind !== null &&
      m.mediaKind !== undefined
  );
  if (kind !== undefined) result = result.filter((m) => m.mediaKind === Number(kind));
  res.json(paginate(result, page));
});

/* ===============================
   ROUTE: GROUP STATS
   GET /groups/:id/stats
================================ */
app.get("/groups/:id/stats", (req, res) => {
  const id = Number(req.params.id);
  const msgs = messages.filter((m) => m.chatid === id);
  if (msgs.length === 0)
    return res.status(404).json({ error: "Group not found or no messages" });

  const dates = msgs.map((m) => new Date(m.date)).sort((a, b) => a - b);
  const mediaBreakdown = {};
  let replyCount = 0;
  let textCount = 0;

  msgs.forEach((m) => {
    if (m.mediaKind !== null && m.mediaKind !== undefined) {
      mediaBreakdown[m.mediaKind] = (mediaBreakdown[m.mediaKind] || 0) + 1;
    }
    if (m.isReply) replyCount++;
    if (m.text) textCount++;
  });

  const groupMeta = groups.find((g) => g.group_id === id) || {};

  res.json({
    group_id: id,
    title: msgs[0].chatTitle,
    username: msgs[0].chatTag,
    link: msgs[0].link,
    in_channel: msgs[0].in_channel,
    is_private: groupMeta.isPrivate ?? null,
    message_count: msgs.length,
    reply_count: replyCount,
    text_count: textCount,
    reply_rate: ((replyCount / msgs.length) * 100).toFixed(2) + "%",
    media_breakdown: mediaBreakdown,
    first_seen: dates[0]?.toISOString() || null,
    last_seen: dates[dates.length - 1]?.toISOString() || null,
  });
});

/* ===============================
   ROUTE: GROUP ACTIVITY TIMELINE
   GET /groups/:id/activity?by=day|week|month
================================ */
app.get("/groups/:id/activity", (req, res) => {
  const id = Number(req.params.id);
  const { by = "day" } = req.query;
  const msgs = messages.filter((m) => m.chatid === id);
  if (msgs.length === 0)
    return res.status(404).json({ error: "Group not found or no messages" });

  const buckets = {};
  msgs.forEach((m) => {
    const d = new Date(m.date);
    let key;
    if (by === "month") key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    else if (by === "week") {
      const startOfYear = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
      key = `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
    } else {
      key = d.toISOString().split("T")[0];
    }
    buckets[key] = (buckets[key] || 0) + 1;
  });

  const timeline = Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, count]) => ({ period, count }));

  res.json({ group_id: id, by, timeline });
});

/* ===============================
   ROUTE: YOUR OVERALL ACTIVITY TIMELINE
   GET /activity/timeline?by=day|week|month
================================ */
app.get("/activity/timeline", (req, res) => {
  const { by = "day" } = req.query;
  const buckets = {};

  messages.forEach((m) => {
    const d = new Date(m.date);
    let key;
    if (by === "month") key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    else if (by === "week") {
      const startOfYear = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
      key = `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
    } else {
      key = d.toISOString().split("T")[0];
    }
    buckets[key] = (buckets[key] || 0) + 1;
  });

  const timeline = Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, count]) => ({ period, count }));

  res.json({ by, timeline });
});

/* ===============================
   SPOTTED GROUPS (groups.json)
   GET /spotted-groups?page=1&order=newest
================================ */
app.get("/spotted-groups", (req, res) => {
  const { page = 1, order = "newest" } = req.query;
  const sorted = [...groups].sort((a, b) =>
    order === "oldest"
      ? new Date(a.last) - new Date(b.last)
      : new Date(b.last) - new Date(a.last)
  );
  res.json(paginate(sorted, page));
});

/* ===============================
   SINGLE SPOTTED GROUP
   GET /spotted-groups/:id
================================ */
app.get("/spotted-groups/:id", (req, res) => {
  const id = Number(req.params.id);
  const group = groups.find((g) => g.group_id === id);
  if (!group) return res.status(404).json({ error: "Not found" });
  res.json(group);
});

/* ===============================
   ROUTE: ORPHAN GROUPS
   Groups present in messages but not registered in groups.json
   GET /groups/orphans
================================ */
app.get("/groups/orphans", (req, res) => {
  const registeredIds = new Set(groups.map((g) => g.group_id));
  const orphanMap = new Map();
  messages.forEach((m) => {
    if (!registeredIds.has(m.chatid) && !orphanMap.has(m.chatid)) {
      orphanMap.set(m.chatid, {
        chatid: m.chatid,
        title: m.chatTitle,
        username: m.chatTag,
        link: m.link,
        in_channel: m.in_channel,
        orphan: true,
      });
    }
  });
  // Attach message count per orphan
  const result = [...orphanMap.values()].map((g) => ({
    ...g,
    msg_count: messages.filter((m) => m.chatid === g.chatid).length,
  }));
  result.sort((a, b) => b.msg_count - a.msg_count);
  res.json(result);
});

/* ===============================
   ROUTE: SEARCH GROUPS
   GET /groups/search?q=keyword
================================ */
app.get("/groups/search", (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "Missing keyword" });
  const keyword = q.toLowerCase();

  // Build a merged group list (registered + orphans)
  const registeredIds = new Set(groups.map((g) => g.group_id));
  const fromMessages = new Map();
  messages.forEach((m) => {
    if (!fromMessages.has(m.chatid)) {
      fromMessages.set(m.chatid, {
        group_id: m.chatid,
        title: m.chatTitle,
        username: m.chatTag,
        link: m.link,
        in_channel: m.in_channel,
        orphan: !registeredIds.has(m.chatid),
        msg_count_in_group: 0,
      });
    }
    fromMessages.get(m.chatid).msg_count_in_group++;
  });
  // Merge with groups.json data
  groups.forEach((g) => {
    if (fromMessages.has(g.group_id)) {
      Object.assign(fromMessages.get(g.group_id), {
        isPrivate: g.isPrivate,
        last: g.last,
      });
    }
  });

  const all = [...fromMessages.values()];
  const results = all.filter(
    (g) =>
      (g.title && g.title.toLowerCase().includes(keyword)) ||
      (g.username && g.username.toLowerCase().includes(keyword))
  );
  res.json(results);
});

/* ===============================
   ROUTE: ASK A QUESTION (AI-powered)
   POST /ask  { question: "..." }
   Two-phase: keyword extraction → message search → AI deduction
================================ */
app.post("/ask", async (req, res) => {
  const { question } = req.body || {};
  if (!question) return res.status(400).json({ error: "Missing question" });

  const LONGCAT_API_KEY = process.env.LONGCAT_API_KEY || "ak_2ep6ba2Ww0pn5cH09U2Mq3Eo0ez1M";
  const LONGCAT_URL = "https://api.longcat.chat/openai/v1/chat/completions";

  try {
    // Phase 1: extract up to 20 keywords
    const kwRes = await axios.post(LONGCAT_URL, {
      model: "LongCat-Flash-Lite",
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content:
            'You are a keyword extractor. The user will ask a question about a Telegram user\'s activity. ' +
            'Return ONLY a JSON array of up to 20 search keywords/phrases that would help find relevant messages. ' +
            'Each keyword should be lowercase, short, and highly relevant. ' +
            'Example output: ["dog","have a pet","my cat","puppy","adopted","animal"]',
        },
        { role: "user", content: question },
      ],
    }, {
      headers: {
        "Authorization": `Bearer ${LONGCAT_API_KEY}`,
        "Content-Type": "application/json",
      },
    });
    const kwData = kwRes.data;
    let keywords = [];
    try {
      const raw = kwData.choices?.[0]?.message?.content || "[]";
      const clean = raw.replace(/```json|```/g, "").trim();
      keywords = JSON.parse(clean);
      if (!Array.isArray(keywords)) keywords = [];
    } catch {
      keywords = [];
    }
    if (!keywords.length) {
      return res.json({ answer: "I couldn't extract keywords from your question.", keywords: [], evidence: [] });
    }

    // Phase 2: search messages for all keywords (up to 200 unique messages)
    const seen = new Set();
    const matched = [];
    for (const kw of keywords.slice(0, 20)) {
      const kwLower = kw.toLowerCase();
      for (const m of messages) {
        if (matched.length >= 200) break;
        if (m.text && m.text.toLowerCase().includes(kwLower) && !seen.has(m.messageid)) {
          seen.add(m.messageid);
          matched.push({
            messageid: m.messageid,
            chatid: m.chatid,
            chatTitle: m.chatTitle,
            chatTag: m.chatTag,
            text: m.text.slice(0, 300),
            date: m.date,
          });
        }
      }
      if (matched.length >= 200) break;
    }

    if (!matched.length) {
      return res.json({
        answer: "No relevant messages found in the database to answer your question.",
        keywords,
        evidence: [],
      });
    }

    // Phase 3: deduce answer from matched messages
    const msgContext = matched
      .slice(0, 200)
      .map(
        (m) =>
          `[ID:${m.messageid} | Chat:${m.chatTitle}${m.chatTag ? " ("+m.chatTag+")" : ""} | ${m.date}]\n${m.text}`
      )
      .join("\n---\n");

    const ansRes = await axios.post(LONGCAT_URL, {
      model: "LongCat-Flash-Lite",
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content: `
You are a behavioral analyst investigating ONE SINGLE Telegram user.

IMPORTANT CONTEXT:
- ALL provided messages were written by the SAME person.
- Messages may come from different chats, but the author is always the same user.
- Treat the messages as a CONTINUOUS PERSONAL HISTORY and timeline.
- Your task is NOT just keyword matching — you must analyze behavior, consistency, intent, and evolution over time.

ANALYSIS RULES:

1. MESSAGE FLOW ANALYSIS
   - Track how statements change over time.
   - Earlier messages may reveal true beliefs.
   - Later messages may contradict earlier ones.
   - Detect patterns, mood shifts, role-playing, exaggeration, jokes, or bluffing.

2. CONTRADICTION DETECTION
   - Look for conflicting claims.
   - Example:
     • User says "I wish I lived in the US"
     • Later says "I'm from the US"
   → This may indicate bluffing, aspiration, sarcasm, or identity shifting.
   Explain the most logical interpretation.

3. SINGLE-USER ASSUMPTION
   - NEVER assume multiple people.
   - Interpret inconsistencies as psychological or conversational behavior of ONE individual.

4. WEIGHING EVIDENCE
   - Prefer repeated statements over one-off claims.
   - Consider tone, frequency, and context.
   - Distinguish between:
     • facts
     • wishes
     • hypotheticals
     • jokes
     • lies/bluffs
     • changing circumstances

5. OUTPUT STYLE
   - Answer the question clearly.
   - Explain reasoning briefly.
   - Cite message IDs and chats as evidence.
   - If uncertainty exists, explain WHY.

Your goal is to infer the MOST LIKELY TRUTH about the user based on message patterns — not just literal text.
`,
        },
        {
          role: "user",
          content: `Question: ${question}\n\nRelevant messages:\n${msgContext}`,
        },
      ],
    }, {
      headers: {
        "Authorization": `Bearer ${LONGCAT_API_KEY}`,
        "Content-Type": "application/json",
      },
    });
    const ansData = ansRes.data;
    const answer = ansData.choices?.[0]?.message?.content || "Unable to generate an answer.";

    // Build message links for evidence
    const evidence = matched.slice(0, 20).map((m) => ({
      messageid: m.messageid,
      chatid: m.chatid,
      chatTitle: m.chatTitle,
      chatTag: m.chatTag,
      text: m.text.slice(0, 100),
      date: m.date,
      link: m.chatTag ? `https://t.me/${m.chatTag.replace("@", "")}/${m.messageid}` : null,
    }));

    res.json({ answer, keywords, evidence });
  } catch (err) {
    console.error("/ask error:", err);
    res.status(500).json({ error: "AI request failed", detail: err.message });
  }
});

/* ===============================
   404 FALLBACK
================================ */
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`\n🗂️  The Files are OPEN on port ${PORT}`);
  console.log(`   http://localhost:${PORT}/health\n`);
});
