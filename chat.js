/* Enflame Heating & Plumbing website assistant (demo by Moosach)
   Runs in the browser: no AI service and no monthly running cost.
   Answers common questions from Enflame's own published information, spots gas emergencies,
   remembers what the customer says, then writes the job into a WhatsApp message they send with one tap.
   Loop-proofed: it never repeats the same reply back to back, never traps anyone in a question,
   and never suggests the topic it has just answered. */
(function () {
  'use strict';

  /* ================== SETTINGS ================== */
  var CONFIG = {
    name: 'Enflame',
    whatsapp: '441952300008',            // country code + number, digits only
    phone: '01952 300008', tel: 'tel:+441952300008',
    email: 'info@enflameheating.co.uk',
    address: '32 Oaks Crescent, Wellington, Telford TF1 2HF',
    reviews: '5.0 on Google, from 168+ five-star reviews',
    years: '20 years'
  };
  /* ============================================== */

  var doc = document, STORE = 'enflame-bot-v1';
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MAIN = ['Boiler not working', 'Book a service', 'New boiler quote', 'Service plans', 'Prices', 'WhatsApp us'];

  function fresh() { return { log: [], ctx: {}, flow: null, step: null, data: {}, offer: null, open: false, chips: [], hist: [], miss: 0, tries: 0 }; }
  var S = fresh();
  try { var saved = JSON.parse(sessionStorage.getItem(STORE)); if (saved && saved.log) S = saved; } catch (e) {}
  S.ctx = S.ctx || {}; S.data = S.data || {}; S.hist = S.hist || []; S.miss = S.miss || 0; S.tries = S.tries || 0;
  function save() { try { sessionStorage.setItem(STORE, JSON.stringify(S)); } catch (e) {} }

  /* ---------- time (always UK time) ---------- */
  function uk() {
    try {
      var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
      var g = function (t) { return p.filter(function (x) { return x.type === t; })[0].value; };
      return { day: { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[g('weekday')], mins: (parseInt(g('hour'), 10) % 24) * 60 + parseInt(g('minute'), 10) };
    } catch (e) { var n = new Date(); return { day: n.getDay(), mins: n.getHours() * 60 + n.getMinutes() }; }
  }
  function officeOpen() { var t = uk(); return t.day >= 1 && t.day <= 5 && t.mins >= 540 && t.mins < 1020; }
  function greetWord() { var h = Math.floor(uk().mins / 60); return h < 5 ? 'Hello' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
  function nextOpen() {
    var t = uk();
    if (t.day >= 1 && t.day <= 5 && t.mins < 540) return 'this morning at 9am';
    if (t.day >= 1 && t.day <= 4) return 'tomorrow morning at 9am';
    return 'on Monday at 9am';
  }
  function lineNow() {
    return officeOpen() ? 'The office is open now on ' + CONFIG.phone + '.'
      : "The office is closed right now, but I'm here. Send your details and the team will pick them up " + nextOpen() + '.';
  }

  /* ---------- understanding text ---------- */
  function norm(s) { return ' ' + String(s || '').toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9£' ]+/g, ' ').replace(/'/g, '').replace(/\s+/g, ' ').trim() + ' '; }
  function words(s) { return norm(s).trim().split(/\s+/).filter(Boolean); }
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 3;
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prevPrev[j - 2] + 1);
      }
      var prevPrev = prev; prev = cur;
    }
    return prev[b.length];
  }
  var STOP = {};
  'the a an and or is it to for of in on i you me my your we do does can what how are be with this that have get will would there its im about just so if at any some need want please could should was were our us they them which who when why where whats dont cant'.split(' ').forEach(function (w) { STOP[w] = 1; });
  function has(n, ws, kw) {
    if (kw.indexOf(' ') > -1) return n.indexOf(' ' + kw + ' ') > -1;
    for (var i = 0; i < ws.length; i++) {
      var w = ws[i];
      if (w === kw) return true;
      if (STOP[w] || w.length < 3) continue;
      if (kw.length >= 4 && w.indexOf(kw) === 0 && w.length - kw.length <= 4) return true;
      if (kw.length >= 5 && w.length >= 4 && lev(w, kw) <= (kw.length >= 8 ? 2 : 1)) return true;
    }
    return false;
  }
  function sent(s) { s = String(s).trim().replace(/\s+/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); }
  function cap(s) { return String(s).trim().replace(/\s+/g, ' ').split(' ').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }).join(' '); }
  function isYes(n) { return /^ (yes|yeah|yep|yup|ya|ok|okay|sure|please|go on|go ahead|lets do it|definitely|sounds good|y|alright|yes please)\b/.test(n); }
  function isNo(n) { return /^ (no|nope|nah|not now|not yet|no thanks|no thank you|maybe later|n|not really|im ok|im good)\b/.test(n); }
  function isCancel(n) { return n.trim().split(' ').length <= 4 && !/^ (can|could|do|does|is|will|what|how|if|when|why)\b/.test(n) && /\b(cancel|stop|never ?mind|forget it|start again|restart|start over|main menu|exit|quit)\b/.test(n); }
  function isSkip(n) { return /^ (skip|pass|dont know|not sure|no idea|unsure|idk|none)\b/.test(n); }
  function isQuestion(t, n) { return /\?\s*$/.test(t) || /^ (what|how|do|does|can|could|is|are|will|would|why|when|who|where|whats|have you|any)\b/.test(n); }
  /* ---------- service area check ----------
     Understands any UK postcode, in capitals or not, with or without the space (tf12hf, TF1 2HF, tf1).
     Covered: the Telford districts plus Newport, Shifnal, Broseley, Much Wenlock (Atterley) and Shrewsbury town.
     Edge: close by, so the team is asked to confirm. Anything else is politely declined. */
  var UK = { AB:'Aberdeen', AL:'St Albans', B:'Birmingham', BA:'Bath', BB:'Blackburn', BD:'Bradford', BH:'Bournemouth', BL:'Bolton', BN:'Brighton', BR:'Bromley', BS:'Bristol', BT:'Belfast', CA:'Carlisle', CB:'Cambridge', CF:'Cardiff', CH:'Chester', CM:'Chelmsford', CO:'Colchester', CR:'Croydon', CT:'Canterbury', CV:'Coventry', CW:'Crewe', DA:'Dartford', DD:'Dundee', DE:'Derby', DG:'Dumfries', DH:'Durham', DL:'Darlington', DN:'Doncaster', DT:'Dorchester', DY:'Dudley', E:'East London', EC:'Central London', EH:'Edinburgh', EN:'Enfield', EX:'Exeter', FK:'Falkirk', FY:'Blackpool', G:'Glasgow', GL:'Gloucester', GU:'Guildford', GY:'Guernsey', HA:'Harrow', HD:'Huddersfield', HG:'Harrogate', HP:'Hemel Hempstead', HR:'Hereford', HS:'the Outer Hebrides', HU:'Hull', HX:'Halifax', IG:'Ilford', IM:'the Isle of Man', IP:'Ipswich', IV:'Inverness', JE:'Jersey', KA:'Kilmarnock', KT:'Kingston upon Thames', KW:'Kirkwall', KY:'Kirkcaldy', L:'Liverpool', LA:'Lancaster', LD:'Llandrindod Wells', LE:'Leicester', LL:'North Wales', LN:'Lincoln', LS:'Leeds', LU:'Luton', M:'Manchester', ME:'Medway', MK:'Milton Keynes', ML:'Motherwell', N:'North London', NE:'Newcastle', NG:'Nottingham', NN:'Northampton', NP:'Newport, South Wales', NR:'Norwich', NW:'North West London', OL:'Oldham', OX:'Oxford', PA:'Paisley', PE:'Peterborough', PH:'Perth', PL:'Plymouth', PO:'Portsmouth', PR:'Preston', RG:'Reading', RH:'Redhill', RM:'Romford', S:'Sheffield', SA:'Swansea', SE:'South East London', SG:'Stevenage', SK:'Stockport', SL:'Slough', SM:'Sutton', SN:'Swindon', SO:'Southampton', SP:'Salisbury', SR:'Sunderland', SS:'Southend', ST:'Stoke-on-Trent and Stafford', SW:'South West London', SY:'Shrewsbury', TA:'Taunton', TD:'the Scottish Borders', TF:'Telford', TN:'Tonbridge', TQ:'Torquay', TR:'Truro', TS:'Teesside', TW:'Twickenham', UB:'Southall', W:'West London', WA:'Warrington', WC:'Central London', WD:'Watford', WF:'Wakefield', WN:'Wigan', WR:'Worcester', WS:'Walsall', WV:'Wolverhampton', YO:'York', ZE:'Shetland' };
  var COVER = { TF1:'Wellington, Hadley, Leegomery and Ketley', TF2:"Oakengates, Donnington, St George's, Priorslee and Muxton", TF3:'Telford town centre, Hollinswood, Stirchley and Brookside', TF4:'Dawley, Lawley, Malinslee and Horsehay', TF5:'Admaston, Bratton and Shawbirch', TF6:'Allscott, Crudgington, Wrockwardine and High Ercall', TF7:'Madeley, Woodside and Sutton Hill', TF8:'Ironbridge, Coalbrookdale and Jackfield', TF10:'Newport, Lilleshall and Edgmond', TF11:'Shifnal and Tong', TF12:'Broseley', TF13:'Much Wenlock and Atterley', SY1:'Shrewsbury town centre and north', SY2:'Shrewsbury east', SY3:'Shrewsbury south and west, and Bayston Hill' };
  var EDGE = { TF9:'Market Drayton', SY4:'Wem, Shawbury and Baschurch', SY5:'Pontesbury, Minsterley and Condover', WV7:'Albrighton', WV16:'Bridgnorth' };
  var MAXD = { TF: [13], SY: [25, 99] };
  var PLACES_YES = ['wrockwardine wood', 'stafford park', 'telford town centre', 'sutton hill', 'bayston hill', 'high ercall', 'much wenlock', 'lawley village', 'st georges', 'saint georges', 'telford', 'wellington', 'shrewsbury', 'newport', 'shifnal', 'broseley', 'dawley', 'oakengates', 'donnington', 'hadley', 'leegomery', 'lawley', 'priorslee', 'horsehay', 'allscott', 'atterley', 'crudgington', 'madeley', 'ironbridge', 'coalbrookdale', 'jackfield', 'coalport', 'ketley', 'trench', 'muxton', 'stirchley', 'brookside', 'hollinswood', 'randlay', 'malinslee', 'woodside', 'admaston', 'bratton', 'shawbirch', 'arleston', 'wrockwardine', 'lilleshall', 'edgmond', 'tong', 'lightmoor', 'doseley', 'hortonwood', 'halesfield', 'aqueduct', 'overdale', 'leegomery'];
  var PLACES_EDGE = ['market drayton', 'albrighton', 'bridgnorth', 'wem', 'shawbury', 'baschurch', 'pontesbury', 'minsterley', 'condover', 'cressage', 'atcham', 'bomere heath', 'hodnet'];
  var PLACES_NO = ['wolverhampton', 'birmingham', 'stoke on trent', 'stoke', 'stafford', 'oswestry', 'ludlow', 'church stretton', 'whitchurch', 'welshpool', 'hereford', 'worcester', 'kidderminster', 'cannock', 'walsall', 'dudley', 'chester', 'crewe', 'manchester', 'london', 'liverpool', 'leeds', 'bristol', 'cardiff', 'swansea', 'craven arms', 'newtown', 'codsall', 'penkridge', 'wrexham', 'nantwich', 'stourbridge', 'redditch', 'bromsgrove', 'coventry', 'nottingham', 'leicester', 'sheffield', 'glasgow', 'edinburgh'];
  function findPostcode(t, loose) {
    var up = String(t).toUpperCase(), re = /\b([A-Z]{1,2})(\d[A-Z\d]?)\s*(\d[A-Z]{2})?\b/g, m;
    while ((m = re.exec(up))) {
      if (!UK[m[1]]) continue;
      if (!m[3] && !loose) continue;
      return { area: m[1], district: m[1] + m[2], full: !!m[3], text: m[1] + m[2] + (m[3] ? ' ' + m[3] : '') };
    }
    return null;
  }
  function placeIn(n, list) { var best = null; list.forEach(function (p) { if (n.indexOf(' ' + p + ' ') > -1 && (!best || p.length > best.length)) best = p; }); return best; }
  function prettyPlace(p) { return cap(p).replace('St Georges', "St George's").replace('Saint Georges', "St George's").replace('Stoke On Trent', 'Stoke-on-Trent'); }
  function findTown(t) { var p = placeIn(norm(t), PLACES_YES); return p ? prettyPlace(p) : null; }
  /* returns {status: yes | edge | no | invalid | unknown, label, where} */
  function checkArea(text, loose) {
    var pc = findPostcode(text, loose), n = norm(text);
    if (pc) {
      var num = parseInt(pc.district.slice(pc.area.length), 10), mx = MAXD[pc.area];
      if (mx && (/[A-Z]$/.test(pc.district) || num < 1 || (num > mx[0] && mx.indexOf(num) < 0))) return { status: 'invalid', label: pc.text };
      if (COVER[pc.district]) return { status: 'yes', label: pc.text, where: COVER[pc.district] };
      if (EDGE[pc.district]) return { status: 'edge', label: pc.text, where: EDGE[pc.district] };
      return { status: 'no', label: pc.text, where: UK[pc.area], wales: pc.area === 'NP' };
    }
    if (/\bnewport\b/.test(n) && /\b(wales|gwent|south wales|isle of wight|iow|pembrokeshire|essex)\b/.test(n)) return { status: 'no', label: 'Newport', where: 'outside Shropshire', wales: /wales|gwent/.test(n) };
    if (/\bwellington\b/.test(n) && /\b(somerset|taunton)\b/.test(n)) return { status: 'no', label: 'Wellington, Somerset', where: 'Somerset' };
    var y = placeIn(n, PLACES_YES), e = placeIn(n, PLACES_EDGE), x = placeIn(n, PLACES_NO);
    if (y && (!x || y.length >= x.length)) return { status: 'yes', label: prettyPlace(y), where: prettyPlace(y) };
    if (e) return { status: 'edge', label: prettyPlace(e), where: prettyPlace(e) };
    if (x) return { status: 'no', label: prettyPlace(x), where: prettyPlace(x) };
    return { status: 'unknown' };
  }
  var GSR = 'https://www.gassaferegister.co.uk/find-an-engineer/';
  function declineText(r) {
    return 'Sorry, ' + r.label + (r.where && r.where !== r.label ? ' (' + r.where + ')' : '') + " is outside the area we cover, so we can't take this job on. " +
      (r.wales ? 'That looks like Newport in South Wales. We cover Newport in Shropshire (TF10). ' : '') +
      'We look after homes in Telford, Wellington, Shrewsbury, Newport, Shifnal, Broseley and the villages around them. To find a Gas Safe registered engineer near you, you can search the Gas Safe Register.';
  }
  function areaLabel(r) { return r.label + (r.status === 'yes' && /\d/.test(r.label) ? ' (' + r.where.split(/,| and /)[0] + ' area)' : ''); }
  function parseDay(text) {
    var n = norm(text), t = uk(), ws = words(text), i, j;
    if (/\b(asap|as soon as|urgent|now|today)\b/.test(n)) return 'Today (' + DAYS[t.day] + '), as soon as possible';
    if (/\btomorrow\b/.test(n)) return 'Tomorrow (' + DAYS[(t.day + 1) % 7] + ')';
    if (/\b(any ?day|whenever|any ?time|flexible|dont mind)\b/.test(n)) return 'Any day';
    if (/\bnext week\b/.test(n)) return 'Next week';
    if (/\bthis week\b/.test(n)) return 'This week';
    for (i = 0; i < 7; i++) {
      var full = DAYS[i].toLowerCase();
      for (j = 0; j < ws.length; j++) if (ws[j] === full || ws[j] === full.slice(0, 3) || (ws[j].length >= 5 && lev(ws[j], full) <= 2)) return (/\bnext\b/.test(n) ? 'Next ' : '') + DAYS[i];
    }
    return null;
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  /* ---------- what the assistant knows (only Enflame's own published information) ---------- */
  var PLANS = {
    basic: { name: 'Basic Service Plan', price: '£8.99', what: 'your annual boiler service, a carbon monoxide test, a smoke alarm test, a gas meter check and 10% off labour rates' },
    plus: { name: 'Service Plan Plus', price: '£10.99', what: 'everything in Basic, plus a filter clean and one free call-out' },
    silver: { name: 'Silver Plan', price: '£17.99', what: 'the annual service and safety checks, plus boiler repairs, radiators, radiator valves and controls (not smart controls) with 100% of parts and labour covered, and discounted labour on other work' },
    gold: { name: 'Gold Plan', price: '£21.99', what: 'everything in Silver, plus a water test and cover for the pump, motorised valves and a vented cylinder, with 100% parts and labour (unvented cylinders are not included). It is the plan we recommend for most homes' },
    platinum: { name: 'Platinum Plan', price: '£24.99', what: 'everything in Gold, plus free inhibitor chemical and boiler replacement cover' },
    extreme: { name: 'Platinum Extreme Plan', price: '£39.99', what: 'everything in Gold, plus unlimited call-outs, boiler replacement (labour only), and electrics and plumbing call-out cover already included' }
  };
  var TOPICS = [
    { id: 'gas', k: ['smell gas', 'smell of gas', 'gas smell', 'gas leak', 'smells of gas', 'smelling gas', 'carbon monoxide', 'co alarm', 'co detector', 'alarm going off'], w: 6 },
    { id: 'leak', k: ['leak', 'leaking', 'burst', 'flood', 'flooding', 'water everywhere', 'dripping', 'pipe burst', 'ceiling', 'drip'], w: 2 },
    { id: 'noheat', k: ['no heating', 'no hot water', 'boiler broken', 'boiler not working', 'boiler stopped', 'not working', 'broken down', 'breakdown', 'no heat', 'cold', 'pressure', 'error code', 'fault code', 'fault', 'lockout', 'pilot', 'radiators cold', 'radiator cold', 'boiler noise', 'banging', 'keeps losing pressure', 'playing up'], w: 2 },
    { id: 'price', k: ['price', 'prices', 'pricing', 'cost', 'costs', 'how much', 'charge', 'fee', 'quote', 'callout', 'call out', 'expensive', 'cheap', 'rates', 'estimate'], w: 2 },
    { id: 'plans', k: ['plan', 'plans', 'service plan', 'boiler cover', 'home cover', 'repair cover', 'monthly', 'per month', 'a month', 'subscription', 'insurance', 'gold', 'silver', 'platinum', 'basic', 'homecare'], w: 2 },
    { id: 'service', k: ['service', 'servicing', 'annual service', 'boiler service', 'check up', 'safety check', 'yearly'], w: 2 },
    { id: 'landlord', k: ['landlord', 'cp12', 'gas safety certificate', 'gas cert', 'gas certificate', 'tenant', 'rental', 'letting'], w: 3 },
    { id: 'newboiler', k: ['new boiler', 'replace boiler', 'replace my boiler', 'boiler replacement', 'combi', 'install a boiler', 'boiler install', 'boiler installation', 'upgrade boiler', 'old boiler', 'swap'], w: 3 },
    { id: 'lpg', k: ['lpg', 'off grid', 'off-grid', 'propane', 'bottled gas', 'oil boiler'], w: 3 },
    { id: 'bathroom', k: ['bathroom', 'shower', 'toilet', 'bath', 'basin', 'wet room', 'en suite', 'ensuite'], w: 2 },
    { id: 'plumbing', k: ['plumbing', 'plumber', 'blocked', 'drain', 'tap', 'taps', 'water pump', 'sink'], w: 1.5 },
    { id: 'heating', k: ['central heating', 'radiator', 'radiators', 'power flush', 'powerflush', 'thermostat', 'sludge', 'heating system', 'underfloor'], w: 1.5 },
    { id: 'makes', k: ['make', 'makes', 'brand', 'brands', 'worcester', 'bosch', 'vaillant', 'baxi', 'ideal', 'glow worm', 'glowworm', 'potterton', 'vokera', 'intergas', 'atag', 'alpha', 'main boiler'], w: 1.5 },
    { id: 'warranty', k: ['warranty', 'guarantee', 'guaranteed', 'approved installer', 'accredited'], w: 2 },
    { id: 'book', k: ['book', 'booking', 'appointment', 'come out', 'visit', 'engineer', 'available', 'availability', 'come round', 'send someone'], w: 2 },
    { id: 'hours', k: ['open', 'opening', 'hours', 'closed', 'what time', 'weekend', 'saturday', 'sunday', 'night', '24 7', '247', 'evening', 'bank holiday', 'out of hours', 'emergency service'], w: 1 },
    { id: 'area', k: ['area', 'areas', 'cover my area', 'do you cover', 'you cover', 'come out to', 'where', 'located', 'location', 'postcode', 'come to', 'near me', 'telford', 'shrewsbury', 'newport', 'wellington', 'shifnal'], w: 1 },
    { id: 'trust', k: ['qualified', 'insured', 'certified', 'registered', 'gas safe', 'experience', 'experienced', 'trust', 'reliable'], w: 2 },
    { id: 'reviews', k: ['review', 'reviews', 'rating', 'recommend', 'any good', 'feedback', 'trustatrader'], w: 2 },
    { id: 'pay', k: ['pay', 'payment', 'card', 'cash', 'bank transfer', 'finance', 'pay monthly', 'invoice', 'deposit'], w: 1.5 },
    { id: 'contact', k: ['phone', 'number', 'call', 'ring', 'contact', 'email', 'speak to', 'talk to', 'human', 'real person', 'someone', 'address', 'instagram', 'insta', 'facebook', 'social media', 'socials'], w: 1.5 },
    { id: 'whatsapp', k: ['whatsapp', 'whats app', 'message', 'text'], w: 2 },
    { id: 'bot', k: ['are you a bot', 'are you real', 'are you human', 'robot', 'who are you', 'are you a person', 'is this a bot', 'are you ai'], w: 4 },
    { id: 'thanks', k: ['thank', 'thanks', 'cheers', 'ta', 'brilliant', 'perfect', 'lovely', 'helpful', 'great'], w: 1, small: true },
    { id: 'bye', k: ['bye', 'goodbye', 'see you', 'take care', 'thats all', 'thats it'], w: 2, small: true },
    { id: 'hello', k: ['hello', 'hi', 'hey', 'hiya', 'morning', 'afternoon', 'evening', 'alright', 'good morning'], w: 1, small: true }
  ];
  var SMALL = { thanks: 1, bye: 1, hello: 1 };
  function detect(text) {
    var n = norm(text), ws = words(text), best = null, top = 0, second = null, sTop = 0;
    TOPICS.forEach(function (t) {
      if (t.small && ws.length > 6) return;
      var s = 0;
      t.k.forEach(function (k) { if (has(n, ws, k)) s += t.w * (k.length > 6 ? 1.5 : 1); });
      if (s > top) { second = best; sTop = top; top = s; best = t.id; } else if (s > sTop) { sTop = s; second = t.id; }
    });
    if (best && SMALL[best] && second && sTop > 0) return { id: second, score: sTop };
    return { id: best, score: top };
  }
  function planKey(n) {
    if (/extreme/.test(n)) return 'extreme';
    if (/platinum/.test(n)) return 'platinum';
    if (/\bgold\b/.test(n)) return 'gold';
    if (/silver/.test(n)) return 'silver';
    if (/\bplus\b/.test(n)) return 'plus';
    if (/\bbasic\b|cheapest/.test(n)) return 'basic';
    return null;
  }

  function answer(id, text) {
    var n = norm(text);
    switch (id) {
      case 'gas': return { say: "**If you can smell gas, act now:** open doors and windows, don't use light switches or naked flames, turn off the gas at the meter if you safely can, and leave the property. Then call the **National Gas Emergency Service on 0800 111 999**, free, 24 hours a day. Once you're safe, we can help with the repair.", links: [{ label: 'Call 0800 111 999', href: 'tel:0800111999', same: true, urgent: true }] };
      case 'leak': S.offer = 'urgent'; return { say: 'For a leak, turn off the water at your stop tap first (usually under the kitchen sink) and keep electrics away from the water. ' + (officeOpen() ? "Shall I send the team your details now so they can call you straight back?" : "The office is closed right now, but I can send the team your details so they see it first thing. Shall I?"), chips: ['Yes, send it now', 'Call instead'] };
      case 'noheat': S.offer = 'urgent'; return { say: "Sorry, no heating is miserable. Quick checks first: is the boiler pressure between 1 and 1.5 bar, and is the thermostat turned up? If that's not it, " + (officeOpen() ? 'shall I send your details to the team so an engineer gets back to you?' : "I can send your details now so the team picks it up " + nextOpen() + '. Shall I?'), chips: ['Yes, send it now', 'Call instead'] };
      case 'price': S.offer = 'quote'; return { say: "Every home is different, so we give you **a clear price before any work starts**. Service plans start from **£8.99 a month**, and the annual boiler service is included in every plan. Want me to set up a quote?", chips: ['Yes, get a quote', 'Service plans', 'Book a service'] };
      case 'plans':
        var k = planKey(n);
        if (k) { S.offer = 'plan'; S.data.prePlan = PLANS[k].name; return { say: 'The **' + PLANS[k].name + '** is **' + PLANS[k].price + ' a month** and includes ' + PLANS[k].what + '. ' + (k === 'extreme' ? 'Terms and conditions apply.' : 'You can add electrical or plumbing cover for £9.99 a month each.') + ' Want me to send your details to get it set up?', chips: ['Yes please', 'Compare plans'] }; }
        S.offer = 'plan';
        return { say: 'Our service plans spread the cost and include your **annual boiler service** and safety checks:\n• **Basic** £8.99 a month\n• **Plus** £10.99, adds a filter clean and a free call-out\n• **Silver** £17.99, adds repair cover\n• **Gold** £21.99, our most popular\n• **Platinum** £24.99, adds boiler replacement cover\n• **Platinum Extreme** £39.99\n\nWant help picking one?', chips: ['Gold Plan', 'Basic Service Plan', 'Yes please'] };
      case 'service': S.offer = 'service'; return { say: 'Our annual boiler service covers combustion, flue and pressure checks, and you get a **written service report and a safety certificate**. It is included in every service plan, and on a plan we get in touch before your service is due. Want me to book one in?', chips: ['Yes, book a service', 'Service plans'] };
      case 'landlord': S.offer = 'ask'; S.lastQuestion = 'I need a landlord gas safety certificate (CP12). ' + String(text).trim(); return { say: "All our gas work is done by Gas Safe registered engineers. For a landlord gas safety certificate, the team will confirm the details and a date. Shall I send them your request?", chips: ['Yes please', 'Call instead'] };
      case 'newboiler': S.offer = 'quote'; S.data.preJob = 'New boiler'; return { say: "We fit **A-rated boilers** with a magnetic filter, a full system flush and a Gas Safe certificate. As **Baxi Approved and Ideal installers**, your installation meets the manufacturer's standards, which protects your warranty. Shall I take a few details for a quote?", chips: ['Yes, get a quote', 'Which makes?'] };
      case 'lpg': S.offer = 'quote'; S.data.preJob = 'LPG boiler'; return { say: 'Yes, we repair and install **LPG boilers** for off-grid homes, including low pressure, ignition faults and full breakdowns. Is it a repair, or a quote for a new LPG boiler?', chips: ['Book a repair', 'Yes, get a quote'] };
      case 'bathroom': S.offer = 'quote'; S.data.preJob = 'Bathroom installation'; return { say: 'We fit bathrooms from small updates to full renovations, handling the plumbing, tiling and finishing. Want a quote?', chips: ['Yes, get a quote', 'Book a repair'] };
      case 'plumbing': S.offer = 'repair'; return { say: 'We handle leaks, blocked drains, tap replacements and water pump installs, with a clear quote first. Shall I book a plumber in?', chips: ['Book a repair', 'Get a quote'] };
      case 'heating': S.offer = 'quote'; S.data.preJob = 'Central heating'; return { say: 'We do complete central heating installations and system upgrades, as well as radiator and thermostat work. Shall I set up a quote?', chips: ['Yes, get a quote', 'Book a repair'] };
      case 'makes': return { say: "We're **Baxi Approved** and **Ideal** installers with **Worcester Bosch** training, and we work on the other major makes too, including Vaillant, Glow-worm, Potterton, Vokera, Main, Alpha, ATAG and Intergas.", chips: ['New boiler quote', 'Book a repair'] };
      case 'warranty': return { say: "Because we're **Baxi Approved** and **Ideal** installers, new boilers are fitted to manufacturer standards, which protects your warranty. Keeping up the annual service matters too, as most warranties need it.", chips: ['Book a service', 'New boiler quote'] };
      case 'book': S.offer = 'repair'; return { say: 'Happy to get that booked. What is it for?', chips: ['Book a repair', 'Book a service', 'New boiler quote'] };
      case 'hours': return { say: 'The office is open **Monday to Friday, 9am to 5pm**, and closed at weekends. ' + (officeOpen() ? "We're open now." : "We're closed right now, but I can take your details and the team will pick them up " + nextOpen() + '.') + ' For a gas emergency at any time, call **0800 111 999**.', chips: ['Boiler not working', 'Book a service'] };
      case 'area':
        var ar = checkArea(text, true);
        if (ar.status === 'yes') { if (/\d/.test(ar.label)) S.ctx.area = areaLabel(ar); return { say: 'Yes, we cover **' + ar.label + '**' + (ar.where !== ar.label ? ' (' + ar.where + ')' : '') + '. What can we help with?', chips: ['Boiler not working', 'Book a service', 'New boiler quote'] }; }
        if (ar.status === 'edge') { S.offer = 'ask'; S.lastQuestion = 'Do you cover ' + ar.label + '? (' + ar.where + ')'; return { say: ar.label + (ar.where !== ar.label ? ' (' + ar.where + ')' : '') + " is just outside our usual area. The team may still be able to help. Shall I ask them for you?", chips: ['Yes please', 'Call instead'] }; }
        if (ar.status === 'no') return { say: declineText(ar), links: [{ label: 'Find a Gas Safe engineer', href: GSR }] };
        if (ar.status === 'invalid') return { say: "That postcode doesn't look quite right. Could you check it? For example: TF1 2HF." };
        return { say: "We're based in Wellington and cover Telford, Shrewsbury, Newport, Shifnal, Broseley, Dawley, Oakengates, Donnington, Priorslee, Lawley and the villages around them. Type your postcode and I'll check for you.", chips: ['Book a repair', 'New boiler quote'] };
      case 'trust': return { say: 'All gas work is done by **Gas Safe registered** engineers, with full safety paperwork on every job. We have **' + CONFIG.years + " of experience**, we're Baxi Approved and Ideal installers, and we're rated " + CONFIG.reviews + '.', chips: ['Reviews', 'Book a repair'] };
      case 'reviews': return { say: "We're rated **" + CONFIG.reviews + '**. One customer said: "Prompt, professional, reliable and extremely helpful."', chips: ['Book a repair', 'Book a service'] };
      case 'pay': S.offer = 'ask'; S.lastQuestion = String(text).trim(); return { say: "Service plans are paid monthly. For other jobs, the team will confirm payment options when they give you your price. Shall I send them your question?", chips: ['Yes please', 'Service plans'] };
      case 'contact': return { say: 'Call **' + CONFIG.phone + '** (Monday to Friday, 9am to 5pm), email ' + CONFIG.email + ', or message us on WhatsApp any time. We are at ' + CONFIG.address + '. You can also follow us on Instagram and Facebook.', links: [{ label: 'Call now', href: CONFIG.tel, same: true }, { label: 'WhatsApp us', wa: 'Hi Enflame, ' }, { label: 'Instagram', href: 'https://www.instagram.com/enflameheating/' }, { label: 'Facebook', href: 'https://www.facebook.com/enflame.heating' }] };
      case 'whatsapp': return { say: 'Tap below to message us on WhatsApp. Or tell me what the problem is and I will write the message for you.', links: [{ label: 'Open WhatsApp', wa: 'Hi Enflame, ' }], chips: ['Book a repair', 'New boiler quote'] };
      case 'bot': return { say: "I'm the Enflame website assistant, not a person. I can answer common questions and get your job details to the team on WhatsApp in a few taps.", chips: MAIN };
      case 'thanks': return { say: pick(["You're welcome. Anything else I can help with?", 'No problem at all. Anything else?']), chips: MAIN };
      case 'bye': return { say: 'Take care. If your heating plays up, we are on ' + CONFIG.phone + '.' };
      case 'hello': return { say: greetWord() + (S.ctx.name ? ' ' + S.ctx.name : '') + '! What can I help you with today?', chips: MAIN };
    }
    return null;
  }
  var NAMES = { price: 'prices', plans: 'service plans', service: 'boiler servicing', newboiler: 'a new boiler', lpg: 'LPG boilers', bathroom: 'bathrooms', plumbing: 'plumbing', heating: 'central heating', makes: 'boiler makes', warranty: 'warranties', hours: 'opening hours', area: 'the areas you cover', trust: 'your qualifications', reviews: 'reviews', pay: 'payment', contact: 'getting in touch', whatsapp: 'WhatsApp', leak: 'a leak', noheat: 'my heating', book: 'a booking' };

  /* ---------- guided flows ---------- */
  var FLOWS = {
    urgent: { title: 'Breakdown callout', steps: ['problem', 'area', 'name'], intro: function () { return officeOpen() ? "Right, three quick questions and it's ready to send. If you'd rather talk now, ring " + CONFIG.phone + '.' : "Three quick questions and it's ready to send. The team will see it " + nextOpen() + '.'; } },
    repair: { title: 'Repair booking', steps: ['problem', 'area', 'day', 'time', 'name'], intro: function () { return "Let's get it booked. A few quick questions, then I'll write the WhatsApp message for you."; } },
    service: { title: 'Boiler service booking', steps: ['make', 'area', 'day', 'name'], intro: function () { return 'Great, a few quick questions for your service.'; } },
    quote: { title: 'Quote request', steps: ['job', 'area', 'details', 'name'], intro: function () { return 'No problem. Just a few details for the engineer.'; } },
    plan: { title: 'Service plan enquiry', steps: ['plan', 'make', 'area', 'name'], intro: function () { return 'Lovely. A few details and the team can set up your plan.'; } },
    ask: { title: 'Question for the team', steps: ['name'], intro: function () { return "I'll pass your question straight to the team on WhatsApp."; } }
  };
  var Q = {
    problem: { ask: function () { return "What's the problem?"; }, chips: ['No heating or hot water', 'Losing pressure', 'Error code on the boiler', 'Leak', 'Something else'] },
    area: { ask: function () { return 'What is your postcode or town?'; }, chips: ['Telford', 'Wellington', 'Shrewsbury', 'Newport'] },
    day: { ask: function () { return 'Which day suits you?'; }, chips: ['As soon as possible', 'Tomorrow', 'This week', 'Any day'] },
    time: { ask: function () { return 'Morning or afternoon?'; }, chips: ['Morning', 'Afternoon', 'Any time'] },
    make: { ask: function () { return 'What make is your boiler? Tap Not sure if you don\'t know.'; }, chips: ['Worcester Bosch', 'Baxi', 'Ideal', 'Vaillant', 'Not sure'] },
    job: { ask: function () { return 'What is the quote for?'; }, chips: ['New boiler', 'Central heating', 'Bathroom', 'LPG boiler', 'Something else'] },
    details: { ask: function () { return 'Anything the engineer should know? For example the age of your boiler or how many bedrooms. Or tap Skip.'; }, chips: ['Skip'] },
    plan: { ask: function () { return 'Which plan are you interested in?'; }, chips: ['Gold', 'Basic', 'Silver', 'Platinum', 'Not sure yet'] },
    name: { ask: function () { return 'Last one: what is your name?'; }, chips: [] }
  };
  function known(step) {
    if (step === 'name') return !!S.ctx.name;
    if (step === 'area') return !!S.ctx.area;
    if (step === 'job') return !!S.data.job;
    if (step === 'problem') return !!S.data.problem;
    if (step === 'plan') return !!S.data.plan;
    return false;
  }
  function startFlow(kind, extra) {
    var preJob = S.data && S.data.preJob, prePlan = S.data && S.data.prePlan;
    S.flow = kind; S.step = null; S.offer = null; S.data = {}; S.tries = 0;
    if (kind === 'quote' && preJob) S.data.job = preJob;
    if (kind === 'plan' && prePlan) S.data.plan = prePlan;
    if (extra) for (var k in extra) if (extra[k]) S.data[k] = extra[k];
    remember('flow:' + kind);
    say(FLOWS[kind].intro(), { quick: true });
    nextStep();
  }
  function nextStep() {
    var steps = FLOWS[S.flow].steps, idx = S.step ? steps.indexOf(S.step) + 1 : 0;
    while (idx < steps.length && known(steps[idx])) idx++;
    if (idx >= steps.length) return finish();
    S.step = steps[idx]; S.tries = 0;
    say(Q[S.step].ask(), { chips: Q[S.step].chips });
  }
  function reask(pre) { S.tries++; say((pre ? pre + ' ' : 'Back to your ' + FLOWS[S.flow].title.toLowerCase() + '. ') + Q[S.step].ask(), { chips: Q[S.step].chips }); }
  function declineArea(r) {
    S.pending = { flow: S.flow, data: S.data };
    S.flow = null; S.step = null; S.data = {}; remember('decline');
    say(declineText(r), { links: [{ label: 'Find a Gas Safe engineer', href: GSR }], chips: ['Try another postcode', 'Anything else?'] });
  }
  function resumeArea() {
    var p = S.pending; S.pending = null;
    if (!p || !p.flow) return say('What is your postcode? I will check whether we cover you.', { chips: [] });
    S.flow = p.flow; S.data = p.data || {}; S.step = 'area'; S.tries = 0; S.ctx.area = '';
    say('No problem. ' + Q.area.ask(), { chips: Q.area.chips });
  }
  var MID = ['hours', 'area', 'price', 'plans', 'trust', 'reviews', 'contact', 'makes', 'warranty', 'pay', 'service', 'lpg'];
  function handleStep(text) {
    var n = norm(text), step = S.step, again = null;
    if (isCancel(n)) { S.flow = null; S.step = null; S.data = {}; return say("No problem, I've cancelled that. Anything else?", { chips: freshChips(MAIN) }); }
    var d = detect(text);
    if (d.id === 'gas') { render(answer('gas', text), true); return reask('When you are safe, we can carry on.'); }
    if (isQuestion(text, n) && d.id && MID.indexOf(d.id) > -1 && !(step === 'make' && d.id === 'makes') && !(step === 'plan' && d.id === 'plans') && !(step === 'area' && d.id === 'area')) {
      var a = answer(d.id, text); S.offer = null; remember(d.id);
      render(a, true);
      return reask();
    }
    switch (step) {
      case 'problem':
        if (/^ something else $/.test(n)) { again = 'In a few words, what is going on?'; break; }
        S.data.problem = sent(text).slice(0, 140); break;
      case 'area':
        var ac = checkArea(text, true), raw = cap(text.replace(/^(i'?m |we'?re |i live |we live |it'?s )?(in |at |near )?/i, '')).slice(0, 60);
        if (ac.status === 'no') return declineArea(ac);
        if (ac.status === 'invalid') { if (S.tries >= 1) { S.ctx.area = ac.label + ' (please check)'; S.ctx.areaNote = 'Postcode needs checking'; break; } again = "That postcode doesn't look quite right. Could you check it? For example: TF1 2HF."; break; }
        if (ac.status === 'unknown') { if (S.tries >= 1) { S.ctx.area = raw; S.ctx.areaNote = 'Area to confirm'; break; } again = "I don't recognise that place. What's your postcode? Then I can check we cover you."; break; }
        S.ctx.area = areaLabel(ac); S.ctx.areaNote = '';
        if (ac.status === 'edge') { S.ctx.areaNote = 'Just outside the usual area, please confirm'; say(ac.label + (ac.where !== ac.label ? ' (' + ac.where + ')' : '') + " is just outside our usual area, so I'll ask the team to confirm they can get to you.", { quick: true }); }
        break;
      case 'day':
        S.data.day = parseDay(text) || (/as soon as/.test(n) ? 'As soon as possible' : cap(text).slice(0, 40)); break;
      case 'time':
        S.data.time = /morn|\bam\b/.test(n) ? 'Morning' : /after|\bpm\b/.test(n) ? 'Afternoon' : 'Any time'; break;
      case 'make':
        S.data.make = isSkip(n) ? 'Not sure' : cap(text).slice(0, 40); break;
      case 'job':
        if (/^ something else $/.test(n)) { again = 'What is the job? A few words is fine.'; break; }
        S.data.job = sent(text).slice(0, 80); break;
      case 'details':
        S.data.details = isSkip(n) ? '' : String(text).trim().slice(0, 300); break;
      case 'plan':
        var k = planKey(n);
        S.data.plan = k ? PLANS[k].name + ' (' + PLANS[k].price + ' a month)' : (/not sure|unsure|dont know|help/.test(n) ? 'Not sure yet, please advise' : sent(text).slice(0, 60)); break;
      case 'name':
        var nn = String(text).replace(/^(hi|hey|hello)[,!]?\s+/i, '').replace(/^(i'?m|i am|my name is|my names|it'?s|this is|call me)\s+/i, '').replace(/[.!,]+$/, '').trim();
        if (!nn || nn.length > 40 || nn.split(' ').length > 4 || !/[a-z]/i.test(nn)) {
          if (S.tries >= 1) { S.ctx.name = 'Not given'; break; }
          again = 'Just your first name is fine.'; break;
        }
        S.ctx.name = cap(nn); break;
    }
    if (again) { if (S.tries >= 2) { if (step === 'problem') S.data.problem = 'To discuss'; if (step === 'job') S.data.job = 'To discuss'; return nextStep(); } S.tries++; return say(again, { chips: step === 'name' ? [] : null }); }
    nextStep();
  }
  function buildMessage(kind) {
    var c = S.ctx, d = S.data, rows, head;
    var day = [d.day, d.time && d.time !== 'Any time' ? d.time.toLowerCase() : ''].filter(Boolean).join(', ');
    var nm = c.name && c.name !== 'Not given' ? c.name : '';
    if (kind === 'urgent') { head = 'URGENT: Hi Enflame, my heating needs looking at as soon as possible.'; rows = [['Problem', d.problem], ['Postcode / area', c.area], ['Name', nm]]; }
    else if (kind === 'repair') { head = 'Hi Enflame, I would like to book a repair.'; rows = [['Problem', d.problem], ['Postcode / area', c.area], ['Preferred day', day], ['Name', nm]]; }
    else if (kind === 'service') { head = 'Hi Enflame, I would like to book a boiler service.'; rows = [['Boiler make', d.make], ['Postcode / area', c.area], ['Preferred day', d.day], ['Name', nm]]; }
    else if (kind === 'quote') { head = 'Hi Enflame, could I get a quote please?'; rows = [['Job', d.job], ['Postcode / area', c.area], ['Details', d.details], ['Name', nm]]; }
    else if (kind === 'plan') { head = 'Hi Enflame, I would like to set up a service plan.'; rows = [['Plan', d.plan], ['Boiler make', d.make], ['Postcode / area', c.area], ['Name', nm]]; }
    else { head = 'Hi Enflame, I have a question:'; rows = [['Question', d.question], ['Name', nm]]; }
    if (c.areaNote) rows.splice(rows.length - 1, 0, ['Area check', c.areaNote]);
    rows = rows.filter(function (r) { return r[1]; });
    return { title: FLOWS[kind].title, rows: rows, msg: head + '\n\n' + rows.map(function (r) { return '*' + r[0] + ':* ' + r[1]; }).join('\n') + '\n\nThank you!', urgent: kind === 'urgent' };
  }
  function finish() {
    var m = buildMessage(S.flow);
    S.flow = null; S.step = null; S.data = {};
    var nm = S.ctx.name && S.ctx.name !== 'Not given' ? S.ctx.name : '';
    say((nm ? 'Thanks ' + nm + '. ' : 'Thanks. ') + 'Here is your message, ready to send:', { quick: true });
    card(m);
  }

  /* ---------- loop protection ---------- */
  function remember(id) { S.hist = (S.hist || []).concat(id).slice(-8); }
  var MENU = {
    ' boiler not working ': 'NOHEAT', ' emergency ': 'NOHEAT', ' book a repair ': 'repair', ' book a service ': 'service', ' yes book a service ': 'service',
    ' new boiler quote ': 'NB', ' central heating quote ': 'CH', ' get a quote ': 'quote', ' yes get a quote ': 'quote',
    ' service plans ': 'PLANS', ' compare plans ': 'PLANS', ' prices ': 'PRICE', ' whatsapp us ': 'WA', ' reviews ': 'REV', ' which makes ': 'MAKES',
    ' anything else ': 'MENU', ' call instead ': 'CALL', ' send my details ': 'urgent', ' yes send it now ': 'urgent', ' i smell gas ': 'GAS',
    ' try another postcode ': 'RETRY', ' basic service plan ': 'P', ' service plan plus ': 'P', ' silver plan ': 'P', ' gold plan ': 'P', ' platinum plan ': 'P', ' platinum extreme plan ': 'P'
  };
  var MENU_ID = { NOHEAT: 'noheat', PLANS: 'plans', PRICE: 'price', WA: 'whatsapp', REV: 'reviews', MAKES: 'makes', GAS: 'gas', repair: 'flow:repair', service: 'flow:service', NB: 'newboiler', CH: 'heating', quote: 'flow:quote', urgent: 'flow:urgent' };
  function chipId(c) { var m = MENU[norm(c)]; if (m) return MENU_ID[m] || m; var d = detect(c); return d.id || c; }
  function freshChips(list) {
    var recent = (S.hist || []).slice(-2), seen = {}, out = [];
    (list || []).concat(MAIN).forEach(function (c) {
      var id = chipId(c);
      if (seen[id] || seen[c]) return;
      if (recent.indexOf(id) > -1 && !/^(Yes|Call instead|Not now|No thanks)/.test(c)) return;
      seen[id] = 1; seen[c] = 1; out.push(c);
    });
    return out.slice(0, 5);
  }
  function firstSentence(t) { var m = String(t).replace(/\*\*/g, '').match(/^[^.?!]+[.?!]/); return m ? m[0] : t; }
  /* answer a topic, but never repeat the same reply back to back */
  function reply(id, text) {
    var a = answer(id, text); if (!a) return false;
    var consec = 0; for (var h = S.hist.length - 1; h >= 0 && S.hist[h] === id; h--) consec++;
    if (!SMALL[id] && id !== 'gas') {
      if (consec >= 2) { S.offer = 'ask'; S.lastQuestion = String(text).trim().slice(0, 300); remember(id); return say("I don't think I'm giving you the answer you need. Shall I send your question straight to the team so they can reply properly?", { chips: ['Yes please', 'Call instead'] }), true; }
      if (consec === 1) {
        remember(id);
        return say('In short: ' + firstSentence(a.say).replace(/^./, function (c) { return c.toLowerCase(); }) + ' If you need more than that, the team can help.', { links: [{ label: 'Ask the team', wa: 'Hi Enflame, I have a question about ' + (NAMES[id] || 'a job') + ': ' + String(text).trim() }], chips: freshChips(a.chips) }), true;
      }
    }
    remember(id);
    render({ say: a.say, links: a.links, chips: a.chips ? freshChips(a.chips) : (SMALL[id] ? null : freshChips([])) });
    return true;
  }

  /* ---------- the brain ---------- */
  function think(text) {
    var n = norm(text);
    if (S.flow) return handleStep(text);
    var loose = words(text).length <= 5 || /\b(postcode|post code|cover|area|live|based|come to|near|in)\b/.test(n);
    if (/\b(error|code|fault|showing|flashing|display|displaying|light)\b/.test(n)) loose = false;
    var pcm = findPostcode(text, loose);
    if (pcm) {
      var pr = checkArea(text, loose), dd = detect(text), only = words(text).length <= 4;
      if (pr.status === 'no') { S.offer = null; remember('decline'); return say(declineText(pr), { links: [{ label: 'Find a Gas Safe engineer', href: GSR }], chips: ['Anything else?'] }); }
      if (pr.status === 'invalid' && (only || dd.id === 'area')) return say("That postcode doesn't look quite right. Could you check it? For example: TF1 2HF.");
      if (pr.status === 'yes') { S.ctx.area = areaLabel(pr); S.ctx.areaNote = ''; }
      if (pr.status === 'edge') { S.ctx.area = areaLabel(pr); S.ctx.areaNote = 'Just outside the usual area, please confirm'; }
      if ((only || dd.id === 'area' || !dd.id) && pr.status !== 'invalid') { remember('area'); return render(answer('area', text)); }
    }
    var nmatch = String(text).match(/\b(?:my name is|my names|call me|this is)\s+([A-Za-z][A-Za-z'-]{1,20})/i); if (nmatch) S.ctx.name = cap(nmatch[1]);
    var d = detect(text);
    if (d.id === 'gas') { remember('gas'); return render(answer('gas', text)); }
    if (S.offer && (isYes(n) || /\b(send it|get a quote|book a service)\b/.test(n)) && words(text).length <= 5) {
      var o = S.offer; S.offer = null; S.miss = 0;
      if (o === 'ask') return startFlow('ask', { question: S.lastQuestion });
      return startFlow(o, o === 'urgent' && S.lastProblem ? { problem: S.lastProblem } : null);
    }
    if (S.offer && isNo(n) && words(text).length <= 4) { S.offer = null; return say('No problem. Anything else I can help with?', { chips: freshChips(MAIN) }); }
    var hadOffer = S.offer; S.offer = null;
    if (isCancel(n)) return say('No problem. What can I help with?', { chips: freshChips(MAIN) });
    var mm = MENU[n];
    if (mm) {
      S.miss = 0;
      if (mm === 'NOHEAT') return reply('noheat', text);
      if (mm === 'NB') { S.data.preJob = 'New boiler'; return startFlow('quote'); }
      if (mm === 'CH') { S.data.preJob = 'Central heating'; return startFlow('quote'); }
      if (mm === 'PLANS') return reply('plans', 'service plans');
      if (mm === 'P') return reply('plans', text);
      if (mm === 'PRICE') return reply('price', text);
      if (mm === 'WA') return reply('whatsapp', text);
      if (mm === 'REV') return reply('reviews', text);
      if (mm === 'MAKES') return reply('makes', text);
      if (mm === 'GAS') { remember('gas'); return render(answer('gas', text)); }
      if (mm === 'RETRY') return resumeArea();
      if (mm === 'MENU') return say('What else can I help with?', { chips: freshChips(MAIN) });
      if (mm === 'CALL') { remember('call'); return say(officeOpen() ? 'Of course. Call us on ' + CONFIG.phone + '.' : 'The office is closed right now (open Monday to Friday, 9am to 5pm), but you can leave a WhatsApp message any time and the team will reply ' + nextOpen() + '.', { links: [{ label: 'Call ' + CONFIG.phone, href: CONFIG.tel, same: true }, { label: 'WhatsApp us', wa: 'Hi Enflame, ' }], chips: freshChips(MAIN) }); }
      return startFlow(mm);
    }
    if (!hadOffer && words(text).length <= 2 && (isYes(n) || isNo(n)) && !d.id) { S.miss = 0; return say(isYes(n) ? 'Great. What would you like to do?' : 'No problem. Is there anything else I can help with?', { chips: freshChips(MAIN) }); }

    if (d.id === 'leak' || d.id === 'noheat') S.lastProblem = sent(text).slice(0, 140);
    if (d.id && /\b(need|want|can you|could you|book|come out|send someone)\b/.test(n)) {
      if (d.id === 'book' || d.id === 'plumbing' || d.id === 'noheat' || d.id === 'leak') { S.miss = 0; var hasProblem = d.id !== 'book' || /\b(boiler|heating|hot water|leak|radiator|pressure|not working|broken|stopped|tap|drain|toilet|pipe|noise|error)\b/.test(n); return startFlow('repair', { problem: hasProblem ? sent(text).slice(0, 140) : null }); }
      if (d.id === 'service' && !isQuestion(text, n)) { S.miss = 0; return startFlow('service'); }
    }
    if (d.id && reply(d.id, text)) { S.miss = 0; return; }

    S.miss++; remember('miss');
    var q = String(text).trim().slice(0, 300);
    if (S.miss === 1) { S.lastQuestion = q; S.offer = 'ask'; return say("I'm not sure about that one, but the team will know. Shall I send them your question on WhatsApp?", { chips: ['Yes please', 'Call instead'] }); }
    var lines = ["That one's best answered by the team. Tap below and your question goes straight to them.", "I don't want to guess on that one. The team will give you a proper answer on WhatsApp."];
    return say(lines[S.miss % 2], { links: [{ label: 'Ask the team', wa: 'Hi Enflame, I have a question: ' + q }], chips: freshChips(MAIN) });
  }

  /* ---------- chat window ---------- */
  var IC = {
    flame: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/><path d="M12 18a2.5 2.5 0 0 1-2.5-2.5c0-1.5 1.2-2.7 2.5-4.5 1.3 1.8 2.5 3 2.5 4.5A2.5 2.5 0 0 1 12 18z"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.75c-5.25 0-9.5 3.8-9.5 8.5 0 2.42 1.13 4.6 2.94 6.15-.17 1.32-.77 2.6-1.76 3.66a.45.45 0 0 0 .36.76c2.1-.1 3.9-.84 5.3-1.98.86.2 1.75.31 2.66.31 5.25 0 9.5-3.8 9.5-8.5s-4.25-8.9-9.5-8.9z"/><circle cx="8" cy="11.4" r="1.3" fill="#13254F"/><circle cx="12" cy="11.4" r="1.3" fill="#13254F"/><circle cx="16" cy="11.4" r="1.3" fill="#13254F"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 5.3 5.3l1.4-2.2L19 14.5V18a2 2 0 0 1-2 2A13 13 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
    restart: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>'
  };
  var launcher = doc.createElement('button');
  launcher.type = 'button'; launcher.className = 'pc-launch';
  launcher.setAttribute('aria-expanded', 'false'); launcher.setAttribute('aria-controls', 'pc-panel'); launcher.setAttribute('aria-label', 'Chat with Enflame');
  launcher.innerHTML = IC.chat + '<span>Chat with us</span><b class="pc-badge" hidden>1</b>';
  var tip = doc.createElement('div'); tip.className = 'pc-tip'; tip.setAttribute('role', 'button'); tip.tabIndex = 0;
  tip.innerHTML = '<span class="av">' + IC.flame + '</span><span><strong>Enflame</strong>Boiler playing up? Tell me what\'s wrong and I\'ll get it to the team in seconds.</span>';
  var panel = doc.createElement('div');
  panel.id = 'pc-panel'; panel.className = 'pc-panel'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Chat with Enflame');
  panel.innerHTML =
    '<div class="pc-head"><div class="pc-id"><span class="pc-mark">' + IC.flame + '</span><div><p class="pc-name">Enflame assistant</p><p class="pc-sub"><i></i><span>Replies instantly, day or night</span></p></div></div>' +
    '<div class="pc-head-btns"><button type="button" class="pc-icon pc-restart" aria-label="Start a new chat" title="Start a new chat">' + IC.restart + '</button><button type="button" class="pc-icon pc-close" aria-label="Close chat" title="Close">' + IC.x + '</button></div></div>' +
    '<div class="pc-log" role="log" aria-live="polite"></div><div class="pc-chips" role="group" aria-label="Suggested replies"></div>' +
    '<form class="pc-input" autocomplete="off"><label class="sr" for="pc-text">Type your message</label><textarea id="pc-text" rows="1" maxlength="400" placeholder="Describe the problem..."></textarea><button type="submit" aria-label="Send">' + IC.send + '</button></form>' +
    '<p class="pc-foot">Automated assistant. Nothing is sent until you press send in WhatsApp. Smell gas? Call 0800 111 999.</p>';
  doc.body.appendChild(tip); doc.body.appendChild(launcher); doc.body.appendChild(panel);
  var logEl = panel.querySelector('.pc-log'), chipsEl = panel.querySelector('.pc-chips'), form = panel.querySelector('.pc-input'), input = panel.querySelector('#pc-text'), badge = launcher.querySelector('.pc-badge');

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>'); }
  function waLink(t) { return 'https://wa.me/' + CONFIG.whatsapp + '?text=' + encodeURIComponent(t); }
  function down() { requestAnimationFrame(function () { logEl.scrollTop = logEl.scrollHeight; }); }
  function addBubble(r, t, links, anim) {
    var el = doc.createElement('div'); el.className = 'pc-msg ' + (r === 'me' ? 'me' : 'bot') + (anim ? ' new' : ''); el.innerHTML = fmt(t);
    if (links && links.length) {
      var row = doc.createElement('div'); row.className = 'pc-links';
      links.forEach(function (l) { var a = doc.createElement('a'); a.className = 'pc-link' + (l.wa ? ' wa' : '') + (l.urgent ? ' urgent' : ''); a.href = l.wa ? waLink(l.wa) : l.href; if (!l.same) { a.target = '_blank'; a.rel = 'noopener'; } a.innerHTML = (l.wa ? IC.wa : '') + '<span>' + esc(l.label) + '</span>'; row.appendChild(a); });
      el.appendChild(row);
    }
    logEl.appendChild(el); down();
  }
  function addCard(m, anim) {
    var el = doc.createElement('div'); el.className = 'pc-card' + (m.urgent ? ' urgent' : '') + (anim ? ' new' : '');
    el.innerHTML = '<p class="pc-card-title">' + esc(m.title) + '</p><dl>' + m.rows.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('') + '</dl>' +
      '<a class="pc-wa" href="' + waLink(m.msg) + '" target="_blank" rel="noopener">' + IC.wa + '<span>Send on WhatsApp</span></a>' +
      '<div class="pc-card-row"><button type="button" class="pc-mini pc-copy">' + IC.copy + '<span>Copy message</span></button><a class="pc-mini" href="' + CONFIG.tel + '">' + IC.phone + '<span>Call us</span></a></div>';
    el.querySelector('.pc-wa').addEventListener('click', function () {
      if (el.getAttribute('data-sent')) return; el.setAttribute('data-sent', '1');
      setTimeout(function () { say("WhatsApp should be open now with your message filled in. Press send and the team will get back to you" + (officeOpen() ? '.' : ' ' + nextOpen() + '.') + " If it didn't open, copy the message or ring " + CONFIG.phone + '.', { chips: ['Anything else?'] }); }, 900);
    });
    el.querySelector('.pc-copy').addEventListener('click', function (e) {
      var l = e.currentTarget.querySelector('span');
      function done(ok) { l.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(function () { l.textContent = 'Copy message'; }, 2000); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(m.msg).then(function () { done(true); }, function () { done(false); }); else done(false);
    });
    logEl.appendChild(el); down();
  }
  function setChips(list) {
    chipsEl.innerHTML = '';
    (list || []).forEach(function (c, i) { var b = doc.createElement('button'); b.type = 'button'; b.className = 'pc-chip' + (/^(Yes|Send)/.test(c) ? ' p' : ''); b.textContent = c; b.addEventListener('click', function () { userSays(c); }); chipsEl.appendChild(b); });
    S.chips = list || [];
  }
  var queue = [], running = false, gen = 0;
  function say(t, o) { o = o || {}; queue.push({ t: t, links: o.links, chips: o.chips, quick: o.quick }); pump(); }
  function card(m) { queue.push({ card: m }); pump(); }
  function render(a, noChips) { if (a) say(a.say, { links: a.links, chips: noChips ? null : a.chips }); }
  function pump() {
    if (running || !queue.length) return;
    running = true;
    var it = queue.shift(), g = gen;
    if (it.card) { addCard(it.card, true); S.log.push({ r: 'card', m: it.card }); setChips(['Anything else?']); save(); running = false; return pump(); }
    typing(true);
    setTimeout(function () {
      if (g !== gen) return;
      typing(false); addBubble('bot', it.t, it.links, true); S.log.push({ r: 'bot', t: it.t, l: it.links });
      if (S.log.length > 80) S.log = S.log.slice(-80);
      if (it.chips || !queue.length) setChips(it.chips || []);
      if (!S.open) badge.hidden = false;
      save(); running = false; pump();
    }, it.quick ? 320 : Math.min(850, 320 + it.t.length * 3));
  }
  function typing(on) {
    var t = logEl.querySelector('.pc-typing');
    if (on && !t) { t = doc.createElement('div'); t.className = 'pc-msg bot pc-typing'; t.setAttribute('aria-hidden', 'true'); t.innerHTML = '<span></span><span></span><span></span>'; logEl.appendChild(t); down(); }
    else if (!on && t) t.remove();
  }
  function userSays(t) {
    t = String(t || '').trim().slice(0, 400); if (!t) return;
    setChips([]); addBubble('me', t, null, true); S.log.push({ r: 'me', t: t }); think(t); save();
  }
  function welcome() {
    say(greetWord() + ", I'm the Enflame assistant. I can answer questions about boilers, servicing and our service plans, and get your job to the team in a few taps.", { quick: true });
    say(lineNow() + ' What do you need?', { chips: MAIN, quick: true });
  }
  function restore() {
    S.log.forEach(function (it) { if (it.r === 'card') addCard(it.m, false); else addBubble(it.r, it.t, it.l, false); });
    setChips(S.flow && S.step ? Q[S.step].chips : (S.chips && S.chips.length ? S.chips : MAIN));
  }
  var lastFocus = null;
  function open() {
    if (S.open && !panel.hidden) return;
    S.open = true; lastFocus = doc.activeElement; panel.hidden = false;
    requestAnimationFrame(function () { panel.classList.add('on'); });
    launcher.setAttribute('aria-expanded', 'true'); launcher.classList.add('hide'); doc.body.classList.add('pc-open'); tip.classList.remove('show'); badge.hidden = true;
    if (!logEl.children.length) { if (S.log.length) restore(); else welcome(); }
    down();
    setTimeout(function () { if (window.matchMedia('(pointer:fine)').matches) input.focus(); }, 250);
    try { sessionStorage.setItem('enflame-tip', '1'); } catch (e) {}
    save();
  }
  function close() {
    S.open = false; panel.classList.remove('on');
    launcher.setAttribute('aria-expanded', 'false'); launcher.classList.remove('hide'); doc.body.classList.remove('pc-open');
    setTimeout(function () { if (!S.open) panel.hidden = true; }, 260);
    if (lastFocus && lastFocus.focus) lastFocus.focus(); else launcher.focus();
    save();
  }
  function restart() { gen++; queue = []; running = false; typing(false); S = fresh(); S.open = true; logEl.innerHTML = ''; setChips([]); save(); welcome(); }
  launcher.addEventListener('click', open);
  panel.querySelector('.pc-close').addEventListener('click', close);
  panel.querySelector('.pc-restart').addEventListener('click', restart);
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.open) close(); });
  doc.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-chat]'); if (!t) return;
    e.preventDefault(); var empty = !S.log.length; open();
    var say1 = t.getAttribute('data-chat');
    if (say1 && !S.flow) setTimeout(function () { userSays(say1); }, empty ? 900 : 250);
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); var v = input.value; input.value = ''; grow(); userSays(v); });
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true })); } });
  function grow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; }
  input.addEventListener('input', grow);
  var seen = false; try { seen = sessionStorage.getItem('enflame-tip') === '1'; } catch (e) {}
  if (!seen && !S.log.length) { setTimeout(function () { if (!S.open) { tip.classList.add('show'); badge.hidden = false; } }, 6000); setTimeout(function () { tip.classList.remove('show'); }, 20000); }
  tip.addEventListener('click', open);
  tip.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  if (S.open) open();
  window.EnflameBot = { send: userSays, state: function () { return S; }, detect: detect, checkArea: checkArea };
})();
