// dict-engine.js — Hybrid Dictionary & Pronunciation Engine
// Built for dict-cli & viyoga.github.io. Zero dependencies.
// Works seamlessly in both Node.js and modern Web Browsers.
// Sources:
//   1. Free Dictionary API (rich phonetics, direct audio, synonyms/antonyms)
//   2. Wikimedia REST API (official, ultra-reliable definitions & examples, zero citation clutter)
//   3. Wikimedia Commons & MediaWiki API (IPA phonetics, audio pronunciations)
//   4. Datamuse API + offline wordlist (fuzzy did-you-mean suggestions)

(function(global) {
  'use strict';

  // ---- Languages ----
  var LANGUAGES = [
    { value: "ar", label: "Arabic",     wikiName: "Arabic" },
    { value: "bn", label: "Bengali",    wikiName: "Bengali" },
    { value: "zh", label: "Chinese",    wikiName: "Chinese" },
    { value: "nl", label: "Dutch",      wikiName: "Dutch" },
    { value: "en", label: "English",    wikiName: "English" },
    { value: "fr", label: "French",     wikiName: "French" },
    { value: "de", label: "German",     wikiName: "German" },
    { value: "hi", label: "Hindi",      wikiName: "Hindi" },
    { value: "id", label: "Indonesian", wikiName: "Indonesian" },
    { value: "it", label: "Italian",    wikiName: "Italian" },
    { value: "ja", label: "Japanese",   wikiName: "日本語" },
    { value: "ko", label: "Korean",     wikiName: "한국어" },
    { value: "ms", label: "Malay",      wikiName: "Malay" },
    { value: "fa", label: "Persian",    wikiName: "Persian" },
    { value: "pl", label: "Polish",     wikiName: "Polish" },
    { value: "pt", label: "Portuguese", wikiName: "Portuguese" },
    { value: "ru", label: "Russian",    wikiName: "Russian" },
    { value: "es", label: "Spanish",    wikiName: "Spanish" },
    { value: "sw", label: "Swahili",    wikiName: "Swahili" },
    { value: "sv", label: "Swedish",    wikiName: "Swedish" },
    { value: "th", label: "Thai",       wikiName: "ภาษาไทย" },
    { value: "tr", label: "Turkish",    wikiName: "Turkish" },
    { value: "vi", label: "Vietnamese", wikiName: "Vietnamese" }
  ].sort(function(a, b) { return a.label.localeCompare(b.label); });

  var LANG_BY_VALUE = {};
  for (var i = 0; i < LANGUAGES.length; i++) LANG_BY_VALUE[LANGUAGES[i].value] = LANGUAGES[i];

  function langLabel(value) {
    var l = LANG_BY_VALUE[String(value || "en").toLowerCase()];
    return l ? l.label : String(value || "en");
  }

  function langWikiName(value) {
    var l = LANG_BY_VALUE[String(value || "en").toLowerCase()];
    return l ? l.wikiName : "English";
  }

  function defaultLanguage() { return "en"; }
  function languages() { return LANGUAGES.slice(); }

  // Case-handling: walk candidate spellings (Time -> time, Time; norway -> norway, Norway)
  function lookupCandidates(word) {
    var w = String(word || "").trim();
    var out = [];
    function push(v) {
      if (v && v !== "" && out.indexOf(v) === -1) out.push(v);
    }
    if (w === "") return out;
    push(w.toLowerCase());
    push(w);
    push(w.charAt(0).toUpperCase() + w.slice(1));
    push(w.charAt(0).toLowerCase() + w.slice(1));
    return out;
  }

  // Priority ranking for parts of speech so main lexical categories come first
  var POS_PRIORITY = {
    noun: 10,
    verb: 9,
    adjective: 8,
    adj: 8,
    adverb: 7,
    adv: 7,
    pronoun: 6,
    preposition: 5,
    conjunction: 4,
    interjection: 3,
    idiom: 2,
    phrase: 2,
    proverb: 2
  };

  // ---- HTML & Text Utilities ----
  function unescapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#039;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&#160;/g, " ")
      .replace(/&mdash;/g, "—")
      .replace(/&ndash;/g, "–")
      .replace(/&#(\d+);/g, function(match, dec) {
        return String.fromCharCode(dec);
      });
  }

  function cleanHtml(html) {
    if (!html) return "";
    var s = String(html)
      // strip nested child lists from parent definition
      .replace(/<[ou]l[\s\S]*$/i, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<span class="[^"]*maintenance[^"]*"[^>]*>[\s\S]*?<\/span>/gi, "")
      .replace(/<span class="[^"]*usage-label-sense[^"]*"[^>]*>[\s\S]*?<\/span>/gi, "")
      .replace(/<span class="citation[^"]*"[^>]*>[\s\S]*?<\/span>/gi, "")
      .replace(/<[^>]+>/g, "");
    return unescapeHtml(s).replace(/\s+/g, " ").trim();
  }

  function stringList(value) {
    if (!Array.isArray(value)) return [];
    var out = [];
    var seen = {};
    for (var i = 0; i < value.length; i++) {
      var s = String(value[i] || "").trim();
      if (s && !seen[s.toLowerCase()]) {
        seen[s.toLowerCase()] = true;
        out.push(s);
      }
    }
    return out;
  }

  // ---- URL Builders ----
  function apiBase(langCode) {
    var code = String(langCode || defaultLanguage()).trim().toLowerCase() || defaultLanguage();
    return "https://" + code + ".wiktionary.org/w/api.php?origin=*&action=query&prop=extracts&explaintext=1&format=json&titles=";
  }

  function lookupUrl(word, langCode) {
    var w = String(word || "").trim();
    if (w === "") return "";
    return apiBase(langCode) + encodeURIComponent(w);
  }

  // ---- Network Fetch with Timeout (Isomorphic: Browser + Node) ----
  async function fetchWithTimeout(url, timeoutMs) {
    var ac = new AbortController();
    var t = setTimeout(function() { ac.abort(); }, timeoutMs || 3500);
    try {
      var options = { signal: ac.signal };
      // Only set User-Agent in Node.js (setting User-Agent in browser fetch is forbidden)
      if (typeof window === 'undefined') {
        options.headers = {
          'User-Agent': 'dict-cli/2.0 (terminal dictionary tool; https://github.com/viyoga/dict-cli)'
        };
      }
      var res = await fetch(url, options);
      return res;
    } finally {
      clearTimeout(t);
    }
  }

  // ---- Tier 1: Free Dictionary API ----
  async function lookupFreeDictionary(word) {
    try {
      var res = await fetchWithTimeout("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word), 3000);
      if (!res.ok) return null;
      var text = await res.text();
      var data;
      try { data = JSON.parse(text); } catch (e) { return null; }
      if (!Array.isArray(data) || !data.length || !data[0].meanings || !data[0].meanings.length) return null;

      var item = data[0];
      var phonetic = String(item.phonetic || "").trim();
      var audioUrl = "";

      if (Array.isArray(item.phonetics)) {
        for (var i = 0; i < item.phonetics.length; i++) {
          var p = item.phonetics[i];
          if (!p) continue;
          if (!phonetic && p.text && String(p.text).trim()) {
            phonetic = String(p.text).trim();
          }
          if (!audioUrl && p.audio && String(p.audio).trim()) {
            audioUrl = String(p.audio).trim();
          }
        }
      }

      var meaningsMap = {};
      for (var j = 0; j < item.meanings.length; j++) {
        var m = item.meanings[j];
        if (!m || !m.partOfSpeech) continue;
        var pos = String(m.partOfSpeech).toLowerCase().trim();
        if (!meaningsMap[pos]) {
          meaningsMap[pos] = {
            partOfSpeech: pos,
            definitions: [],
            synonyms: [],
            antonyms: []
          };
        }
        var target = meaningsMap[pos];
        if (Array.isArray(m.synonyms)) target.synonyms.push.apply(target.synonyms, m.synonyms);
        if (Array.isArray(m.antonyms)) target.antonyms.push.apply(target.antonyms, m.antonyms);

        if (Array.isArray(m.definitions)) {
          for (var k = 0; k < m.definitions.length; k++) {
            var d = m.definitions[k];
            if (!d || !d.definition) continue;
            var defText = cleanHtml(d.definition);
            if (!defText) continue;
            var exText = d.example ? cleanHtml(d.example) : "";
            var syns = stringList(d.synonyms);
            var ants = stringList(d.antonyms);
            if (syns.length) target.synonyms.push.apply(target.synonyms, syns);
            if (ants.length) target.antonyms.push.apply(target.antonyms, ants);

            if (!target.definitions.some(function(x) { return x.definition === defText; })) {
              target.definitions.push({
                definition: defText,
                example: exText,
                synonyms: syns,
                antonyms: ants
              });
            }
          }
        }
      }

      var meanings = Object.values(meaningsMap).filter(function(m) {
        m.synonyms = stringList(m.synonyms);
        m.antonyms = stringList(m.antonyms);
        return m.definitions.length > 0;
      });

      if (!meanings.length) return null;

      meanings.sort(function(a, b) {
        var pA = POS_PRIORITY[a.partOfSpeech] || 0;
        var pB = POS_PRIORITY[b.partOfSpeech] || 0;
        return pB - pA;
      });

      return {
        word: String(item.word || word).trim(),
        phonetic: phonetic,
        audioUrl: audioUrl,
        source: "Free Dictionary",
        language: "en",
        meanings: meanings
      };
    } catch (e) {
      return null;
    }
  }

  // ---- Tier 2: Wikimedia REST API (Official Wiktionary Definition Endpoint) ----
  async function lookupWiktionaryRest(word, langCode) {
    try {
      var code = String(langCode || defaultLanguage()).toLowerCase().trim();
      var url = "https://en.wiktionary.org/api/rest_v1/page/definition/" + encodeURIComponent(word);
      var res = await fetchWithTimeout(url, 4000);
      if (!res.ok) return null;
      var data = await res.json();
      if (!data || typeof data !== "object") return null;

      var sections = data[code];
      // If requested language not found in English Wiktionary, check if it's English or fallback to first available language (e.g. Swahili for 'viyoga')
      if ((!sections || !sections.length) && code === "en") {
        sections = data.en || Object.values(data)[0];
      }
      if (!sections || !sections.length) return null;

      var meaningsMap = {};

      for (var i = 0; i < sections.length; i++) {
        var sec = sections[i];
        if (!sec || !sec.partOfSpeech) continue;
        var pos = String(sec.partOfSpeech).toLowerCase().trim();
        if (!meaningsMap[pos]) {
          meaningsMap[pos] = {
            partOfSpeech: pos,
            definitions: [],
            synonyms: [],
            antonyms: []
          };
        }
        var target = meaningsMap[pos];

        if (Array.isArray(sec.definitions)) {
          for (var j = 0; j < sec.definitions.length; j++) {
            var item = sec.definitions[j];
            if (!item || !item.definition) continue;

            var defText = cleanHtml(item.definition);
            if (!defText || defText.length < 2) continue;

            // Pick up first clean example
            var exText = "";
            var transText = "";
            if (Array.isArray(item.parsedExamples) && item.parsedExamples.length) {
              var pe = item.parsedExamples[0];
              if (pe.example) exText = cleanHtml(pe.example);
              if (pe.translation) transText = cleanHtml(pe.translation);
            } else if (Array.isArray(item.examples) && item.examples.length) {
              exText = cleanHtml(item.examples[0]);
            }

            if (!target.definitions.some(function(x) { return x.definition === defText; })) {
              target.definitions.push({
                definition: defText,
                example: exText,
                translation: transText,
                synonyms: [],
                antonyms: []
              });
            }
          }
        }
      }

      var meanings = Object.values(meaningsMap).filter(function(m) {
        return m.definitions.length > 0;
      });

      if (!meanings.length) return null;

      meanings.sort(function(a, b) {
        var pA = POS_PRIORITY[a.partOfSpeech] || 0;
        var pB = POS_PRIORITY[b.partOfSpeech] || 0;
        return pB - pA;
      });

      return {
        word: word,
        phonetic: "",
        audioUrl: "",
        source: "Wiktionary",
        language: code,
        meanings: meanings
      };
    } catch (e) {
      return null;
    }
  }

  // ---- Tier 3: Wiktionary Metadata (IPA + Audio Extraction) ----
  async function enrichWiktionaryMetadata(entry, word, langCode) {
    if (!entry) return entry;
    if (entry.phonetic && entry.audioUrl) return entry;

    try {
      var code = (langCode === "en" || !langCode) ? "en" : langCode;
      var url = "https://" + code + ".wiktionary.org/w/api.php?action=query&titles=" +
        encodeURIComponent(word) + "&prop=extracts|images&explaintext=1&format=json&origin=*";
      var res = await fetchWithTimeout(url, 3000);
      if (!res.ok) return entry;
      var data = await res.json();
      if (!data || !data.query || !data.query.pages) return entry;

      var page = Object.values(data.query.pages)[0];
      if (!page) return entry;

      // 1. Extract IPA if missing
      if (!entry.phonetic && page.extract) {
        var extract = page.extract;
        var m1 = /IPA[^:\n]*:\s*\/([^\n/]+)\//.exec(extract);
        if (m1) {
          entry.phonetic = "/" + m1[1].trim() + "/";
        } else {
          var m2 = /IPA[^:\n]*:\s*\[([^\n\]]+)\]/.exec(extract);
          if (m2) {
            entry.phonetic = "[" + m2[1].trim() + "]";
          } else {
            var m3 = /\/([^\n/]{2,35})\//.exec(extract);
            if (m3 && !/^(?:and|the|or|of)$/i.test(m3[1])) {
              entry.phonetic = "/" + m3[1].trim() + "/";
            }
          }
        }

        // Also check if we can pick up any synonyms/antonyms from extract if empty
        var hasSyns = entry.meanings.some(function(m) { return m.synonyms.length > 0; });
        if (!hasSyns) {
          var synMatch = /==== Synonyms ====([^=]+)/i.exec(extract);
          if (synMatch) {
            var synLines = synMatch[1].split("\n");
            var foundSyns = [];
            for (var s = 0; s < synLines.length; s++) {
              var sLine = synLines[s].replace(/^\([^)]+\):?/, "").replace(/^[*#:\-\s]+/, "").trim();
              if (sLine && !/^(see also|thesaurus)/i.test(sLine) && sLine.length < 30) {
                foundSyns.push(sLine);
              }
            }
            if (foundSyns.length && entry.meanings[0]) {
              entry.meanings[0].synonyms = stringList(foundSyns).slice(0, 8);
            }
          }
        }
      }

      // 2. Extract Pronunciation Audio from Commons if missing
      if (!entry.audioUrl && Array.isArray(page.images)) {
        var audioImg = page.images.find(function(img) {
          return /\.(ogg|oga|mp3|wav|flac)$/i.test(img.title) &&
                 new RegExp(code, "i").test(img.title);
        }) || page.images.find(function(img) {
          return /\.(ogg|oga|mp3|wav|flac)$/i.test(img.title);
        });

        if (audioImg) {
          var fn = audioImg.title.replace(/^File:/i, "").trim();
          entry.audioUrl = "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(fn);
        }
      }
    } catch (e) {
      /* metadata enrichment is non-critical */
    }

    return entry;
  }

  // ---- Tier 4: Native Language Wiktionary Fallback Parser ----
  function parseSections(text) {
    text = String(text || "").replace(/\r\n/g, "\n").replace(/^\uFEFF/, "");
    var root = { level: 1, title: "", body: "", children: [] };
    var stack = [root];
    var lines = text.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var m = /^(={2,5})\s*([^{}=\n][^{}=\n]*?)\s*\1\s*$/.exec(lines[i]);
      if (m) {
        var lvl = m[1].length;
        while (stack.length > 1 && stack[stack.length - 1].level >= lvl) stack.pop();
        var sec = { level: lvl, title: String(m[2]).trim(), body: "", children: [] };
        stack[stack.length - 1].children.push(sec);
        stack.push(sec);
      } else if (stack.length > 1) {
        var top = stack[stack.length - 1];
        top.body += (top.body ? "\n" : "") + lines[i];
      }
    }
    return root.children;
  }

  function parseNativeWikitext(word, rawText, langCode) {
    var sections = parseSections(rawText);
    if (!sections.length) return null;

    var meanings = [];
    var phonetic = "";

    function walk(sec) {
      var title = sec.title.toLowerCase();
      if (!phonetic && /pronunciation|prononciation|aussprache/i.test(title)) {
        var m = /IPA[^:\n]*:\s*\/([^\n/]+)\//.exec(sec.body);
        if (m) phonetic = "/" + m[1] + "/";
      }

      var isPos = POS_PRIORITY[title] !== undefined ||
                  /noun|verb|adjective|adverb|nom|verbe|adjectif|adverbe/i.test(title);

      if (isPos && sec.body) {
        var lines = sec.body.split("\n");
        var defs = [];
        for (var i = 0; i < lines.length; i++) {
          var l = lines[i].trim();
          if (l.startsWith("#") && !l.startsWith("#*") && !l.startsWith("#:")) {
            var dt = cleanHtml(l.replace(/^#+\s*/, ""));
            if (dt && dt.length > 2 && !defs.some(function(x) { return x.definition === dt; })) {
              defs.push({ definition: dt, example: "", synonyms: [], antonyms: [] });
            }
          }
        }
        if (defs.length) {
          meanings.push({
            partOfSpeech: title,
            definitions: defs,
            synonyms: [],
            antonyms: []
          });
        }
      }

      for (var c = 0; c < sec.children.length; c++) walk(sec.children[c]);
    }

    for (var s = 0; s < sections.length; s++) walk(sections[s]);

    if (!meanings.length) return null;

    return {
      word: word,
      phonetic: phonetic,
      audioUrl: "",
      source: "Wiktionary Native",
      language: langCode,
      meanings: meanings
    };
  }

  async function lookupNativeWiktionary(word, langCode) {
    try {
      var url = apiBase(langCode) + encodeURIComponent(word);
      var res = await fetchWithTimeout(url, 4000);
      if (!res.ok) return null;
      var data = await res.json();
      if (!data || !data.query || !data.query.pages) return null;
      var page = Object.values(data.query.pages)[0];
      if (!page || page.missing !== undefined || !page.extract) return null;
      return parseNativeWikitext(word, page.extract, langCode);
    } catch (e) {
      return null;
    }
  }

  // ---- Unified Multi-Tier Lookup ----
  async function lookup(word, langCode) {
    var w = String(word || "").trim();
    if (!w) throw new Error("no word specified");
    var lang = String(langCode || defaultLanguage()).toLowerCase().trim();
    var candidates = lookupCandidates(w);

    for (var i = 0; i < candidates.length; i++) {
      var cand = candidates[i];
      var entry = null;

      // 1. For English, attempt Free Dictionary API first (best phonetics & audio)
      if (lang === "en") {
        entry = await lookupFreeDictionary(cand);
      }

      // 2. If not found or non-English, try official Wiktionary REST API
      if (!entry) {
        entry = await lookupWiktionaryRest(cand, lang);
      }

      // 3. Enrich missing IPA / audio from Wikimedia Commons metadata
      if (entry) {
        entry = await enrichWiktionaryMetadata(entry, cand, lang);
        return { ok: true, entry: entry };
      }

      // 4. Fallback for non-English to native Wiktionary edition
      if (lang !== "en") {
        entry = await lookupNativeWiktionary(cand, lang);
        if (entry) {
          entry = await enrichWiktionaryMetadata(entry, cand, lang);
          return { ok: true, entry: entry };
        }
      }
    }

    // Not found
    var notFoundErr = new Error("no entry for \"" + w + "\"");
    notFoundErr.notFound = true;
    return { ok: false, kind: "notfound", error: notFoundErr.message };
  }

  // ---- Audio Pronunciation Player ----
  function playAudio(url) {
    if (!url || typeof url !== "string") return false;
    // Browser environment
    if (typeof window !== 'undefined') {
      try {
        var a = new Audio(url);
        a.play();
        return true;
      } catch (e) {
        return false;
      }
    }
    // Node.js CLI environment: completely headless spawn
    try {
      var cp = require("child_process");
      var players = [
        { bin: "mpv", args: ["--no-video", "--vo=null", "--really-quiet", url] },
        { bin: "ffplay", args: ["-nodisp", "-autoexit", "-loglevel", "quiet", url] }
      ];

      for (var i = 0; i < players.length; i++) {
        var p = players[i];
        try {
          var child = cp.spawn(p.bin, p.args, {
            stdio: "ignore",
            detached: true
          });
          child.unref();
          return true;
        } catch (err) {}
      }
    } catch (e) {}
    return false;
  }

  // ---- Levenshtein & Fuzzy Distance ----
  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var row = [];
    for (var i = 0; i <= b.length; i++) row[i] = i;
    for (var j = 1; j <= a.length; j++) {
      var prev = j;
      for (var k = 1; k <= b.length; k++) {
        var val = (a.charAt(j - 1) === b.charAt(k - 1)) ? row[k - 1] : Math.min(row[k - 1] + 1, prev + 1, row[k] + 1);
        row[k - 1] = prev;
        prev = val;
      }
      row[b.length] = prev;
    }
    return row[b.length];
  }

  var wordlist = null;
  function setWordlist(list) {
    if (Array.isArray(list)) wordlist = list;
  }

  function fuzzyMatch(word) {
    if (!wordlist || !wordlist.length) return { autoMatch: null, alternatives: [] };
    var target = word.toLowerCase().trim();
    var scored = [];
    for (var i = 0; i < wordlist.length; i++) {
      var w = wordlist[i];
      var dist = levenshtein(target, w);
      var maxLen = Math.max(target.length, w.length);
      var norm = dist / maxLen;
      if (norm <= 0.45) scored.push({ word: w, score: norm });
    }
    scored.sort(function(a, b) { return a.score - b.score; });
    if (!scored.length) return { autoMatch: null, alternatives: [] };

    if (scored[0].score <= 0.25 && (scored.length === 1 || (scored[1].score - scored[0].score) >= 0.12)) {
      return { autoMatch: scored[0].word, alternatives: [] };
    }

    var alts = [];
    for (var n = 0; n < Math.min(5, scored.length); n++) alts.push(scored[n].word);
    return { autoMatch: null, alternatives: alts };
  }

  // Suggestion: Datamuse API with offline wordlist fallback
  async function suggest(word) {
    var target = String(word || "").toLowerCase().trim();
    if (!target) return { autoMatch: null, alternatives: [] };

    try {
      var res = await fetchWithTimeout("https://api.datamuse.com/sug?s=" + encodeURIComponent(target), 1500);
      if (res.ok) {
        var data = await res.json();
        if (Array.isArray(data) && data.length) {
          var candidates = [];
          for (var i = 0; i < data.length; i++) {
            var cw = String(data[i].word || "").toLowerCase().trim();
            if (cw && !cw.includes(" ") && !candidates.includes(cw)) {
              candidates.push(cw);
            }
          }

          if (candidates.length) {
            var d0 = levenshtein(target, candidates[0]);
            if (d0 <= 2 && candidates[0] !== target) {
              return { autoMatch: candidates[0], alternatives: candidates.slice(1, 5) };
            }
            return { autoMatch: null, alternatives: candidates.slice(0, 5) };
          }
        }
      }
    } catch (e) {
      /* fallback to offline */
    }

    return fuzzyMatch(target);
  }

  // ---- Backward Compatibility Wrappers ----
  function parseResponse(raw, langCode) {
    try {
      var data = JSON.parse(raw);
      if (data && data.query && data.query.pages) {
        var page = Object.values(data.query.pages)[0];
        if (!page || page.missing !== undefined || !page.extract) {
          return { ok: false, kind: "notfound", error: "not found" };
        }
        var entry = parseNativeWikitext(page.title || "word", page.extract, langCode || "en");
        if (entry) return { ok: true, entry: entry };
      }
    } catch (e) {}
    return { ok: false, kind: "invalid", error: "lookup failed" };
  }

  function summaryLabel(entry) {
    if (!entry || !entry.meanings) return "";
    var pos = [];
    for (var i = 0; i < entry.meanings.length; i++) {
      if (entry.meanings[i] && entry.meanings[i].partOfSpeech) {
        pos.push(entry.meanings[i].partOfSpeech);
      }
    }
    return pos.join(" · ");
  }

  function sourceLabel(entry) {
    if (!entry || !entry.source) return "";
    return String(entry.source);
  }

  var engine = {
    LANGUAGES: LANGUAGES,
    languages: languages,
    langLabel: langLabel,
    langWikiName: langWikiName,
    defaultLanguage: defaultLanguage,
    lookupCandidates: lookupCandidates,
    apiBase: apiBase,
    lookupUrl: lookupUrl,
    lookup: lookup,
    suggest: suggest,
    playAudio: playAudio,
    cleanHtml: cleanHtml,
    levenshtein: levenshtein,
    setWordlist: setWordlist,
    fuzzyMatch: fuzzyMatch,
    parseResponse: parseResponse,
    summaryLabel: summaryLabel,
    sourceLabel: sourceLabel
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engine;
  }
  global.DictEngine = engine;

})(typeof window !== 'undefined' ? window : globalThis);
