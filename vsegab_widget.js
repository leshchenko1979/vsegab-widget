
/* ВСЕ ГАБ — виджет объектов недвижимости
   Данные: фид Яндекс.Недвижимости -> статический JSON
   Подключение: <script src="vsegab_widget.js" data-feed="vsegab_objects.json" data-theme="light"><\/script>
   Работает на любом сайте: Tilda, Wordpress, любой HTML.
   Без зависимостей, без jQuery. */

(function () {
  'use strict';

  var script = document.currentScript;
  var FEED_URL = (script && script.dataset.feed) ? script.dataset.feed : 'vsegab_objects.json';
  var THEME = (script && script.dataset.theme) ? script.dataset.theme : 'light';

  var C = {
    light: {
      bg: '#f5f6f8', card: '#ffffff', text: '#1a1a2e', muted: '#6b7280',
      accent: '#1f6feb', border: '#e5e7eb', chip: '#eef2ff', chipText: '#1f6feb'
    },
    dark: {
      bg: '#12141a', card: '#1c1f27', text: '#e8eaf0', muted: '#9aa3b2',
      accent: '#58a6ff', border: '#2c303b', chip: '#232a3a', chipText: '#58a6ff'
    }
  };

  var fmtPrice = function (p) {
    if (p == null) return 'цена по запросу';
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(p);
  };
  var fmtArea = function (a) {
    if (a == null) return '';
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(a) + ' м²';
  };
  var fmtMoney = function (v) {
    if (v == null) return '';
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(v)) + ' ₽';
  };
  var fmtPct = function (v) {
    if (v == null) return '';
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(v) + ' %';
  };

  /* ---------- МАП (месячная арендная плата) и доходность ----------
     В фиде Квикдила отдельных полей для арендной платы и доходности нет:
     они есть только в тексте заголовка и описания. Разбираем текст.
     Доходность = аренда за 12 месяцев / цена; если в тексте названа
     окупаемость N лет — доходность = 100 / N, и это значение точнее,
     потому что учитывает индексацию. */
  /* Ярлыки, после которых в тексте стоит арендная плата. Ищем ВСЕ ярлыки,
     а не первый: «МАП 1 года : 270.000 р» — здесь сразу после «МАП» стоит не
     деньги, а номер года, и первое совпадение было бы ошибкой. */
  /* ВНИМАНИЕ: в JS «\w» не знает кириллицы (это [A-Za-z0-9_]) — все хвосты
     русских слов пишем явным классом [А-ЯЁа-яё], иначе «арендная плата» не
     найдётся никогда. */
  /* Внутри слова тег тоже мог поставить пробел («руб./ме<strong>с</strong>») —
     поэтому в «мес/месяц» между «ме» и «с» допускаем пробел. */
  var LABELS = /(?<![А-ЯЁа-яёA-Za-z])(?:МАП|АП)(?![А-ЯЁа-яёA-Za-z])|арендн[А-ЯЁа-яё]*\s+(?:плат|ставк|доход)[А-ЯЁа-яё]*|ме\s*сячн[А-ЯЁа-яё]*\s+аренд[А-ЯЁа-яё]*|доход\s+от\s+(?:сдачи|аренды)|плат\s*[её]ж\s+в\s+ме\s*сяц|аренда\s+(?:в\s+)?ме\s*сяц/gi;
  var NUMB = /(\d[\d\s ]*(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*(млн|миллион[А-ЯЁа-яё]*|тыс[А-ЯЁа-яё]*)?/g;
  var AFTER_NOISE = /^\s*(?:%|год|лет|года|г\.|ме\s*с)/i;   /* «1 года», «15 %», «12 мес» — это не сумма */
  /* Слова-хвосты: число стоит ПЕРЕД ними («222 000 р - 240 000 р в месяц»),
     поэтому смотрим окно и вперёд, и назад. */
  var POSTFIX = /в\s+ме\s*сяц|ежеме\s*сячн[А-ЯЁа-яё]*|\/\s*ме\s*с/gi;
  var PRE_WINDOW = 45;
  var rubMonthRe = /(\d[\d\s ]*(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*(?:руб[А-ЯЁа-яё]*|₽)?\s*\/\s*ме\s*с/i;
  var mlnMonthRe = /(\d+(?:[.,]\d+)?)\s*млн\s*(?:руб[А-ЯЁа-яё]*|₽)?\s*(?:в\s+ме\s*сяц|\/\s*ме\s*с|ежеме\s*с)/i;
  var OKUP = /окуп[а-яё]*[\s\S]{0,25}?(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:лет|года|год)/gi;
  var taxRe = /(?:ндс|налог)/i;
  var flatRe = /[<>]/g;

  var toNum = function (s) {
    if (s == null) return null;
    s = String(s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return null;
    var v;
    if (/^\d{1,3}([.,]\d{3})+$/.test(s)) v = parseFloat(s.replace(/[.,]/g, ''));
    else if (/^\d+[.,]\d{1,2}$/.test(s)) v = parseFloat(s.replace(',', '.'));
    else v = parseFloat(s.replace(/\s/g, '').replace(',', '.'));
    return isNaN(v) ? null : v;
  };
  var toMoney = function (s, unit) {
    var v = toNum(s);
    if (v == null) return null;
    if (unit) {
      if (/^(млн|миллион)/i.test(unit)) return v * 1000000;
      if (/^тыс/i.test(unit)) return v * 1000;
    }
    return (v >= 0.1 && v <= 100) ? v * 1000000 : v;   /* «1,3» без слова «млн» */
  };
  var plainText = function (o) {
    return String(stripHtml(String(o.title || '') + ' \n ' + String(o.description || '')))
      .replace(flatRe, ' ').replace(/\s+/g, ' ');
  };
  /* Все числа-кандидаты на арендную плату: после каждого ярлыка (в пределах
     70 знаков) + явные «… руб/мес» и «… млн в месяц». */
  var mapCands = function (text) {
    var out = [], lm, tail, n, rest, v, seen = {};
    LABELS.lastIndex = 0;
    while ((lm = LABELS.exec(text))) {
      tail = text.slice(lm.index + lm[0].length, lm.index + lm[0].length + 70);
      if (taxRe.test(tail)) continue;
      NUMB.lastIndex = 0;
      while ((n = NUMB.exec(tail))) {
        rest = tail.slice(n.index + n[0].length);
        if (AFTER_NOISE.test(rest)) continue;
        v = toMoney(n[1], n[2]);
        if (v != null && !seen[v]) { seen[v] = 1; out.push({ val: v, explicit: false }); }
      }
    }
    var mr = text.match(rubMonthRe) || text.match(mlnMonthRe);
    if (mr) {
      v = toMoney(mr[1], /млн/i.test(mr[0]) ? 'млн' : null);
      if (v != null && !seen[v]) { seen[v] = 1; out.push({ val: v, explicit: true }); }
    }
    POSTFIX.lastIndex = 0;
    var pm, pre, post;
    while ((pm = POSTFIX.exec(text))) {
      pre = text.slice(Math.max(0, pm.index - PRE_WINDOW), pm.index);
      post = text.slice(pm.index + pm[0].length, pm.index + pm[0].length + PRE_WINDOW);
      [pre, post].forEach(function (win) {
        NUMB.lastIndex = 0;
        var n2;
        while ((n2 = NUMB.exec(win))) {
          if (win === post && AFTER_NOISE.test(win.slice(n2.index + n2[0].length))) return;
          var v2 = toMoney(n2[1], n2[2]);
          if (v2 != null && !seen[v2]) { seen[v2] = 1; out.push({ val: v2, explicit: true }); }
        }
      });
    }
    return out;
  };
  var extractOkup = function (o) {
    var text = plainText(o), m, at, v;
    OKUP.lastIndex = 0;
    while ((m = OKUP.exec(text))) {
      at = m.index + m[0].indexOf(m[1]);
      if (/до\s*$/i.test(text.slice(Math.max(0, at - 5), at))) continue;  /* «от 6,5 до 9,5 лет» */
      v = toNum(m[1]);
      if (v != null && v >= 2 && v <= 30) return v;
    }
    return null;
  };
  var extractMap = function (o, okup) {
    var text = plainText(o), price = o.price;
    var ok = function (v) {
      if (v == null || v < 20000 || v > 20000000) return false;
      if (!price) return true;
      var years = price / (v * 12);
      return years >= 2 && years <= 40;
    };
    var good = mapCands(text).filter(function (c) { return ok(c.val); });
    if (!good.length) return null;
    if (okup && price) {                       /* если названа окупаемость — сверяем с ней */
      var best = null, bd = 1.5;
      good.forEach(function (c) {
        var d = Math.abs(price / (c.val * 12) - okup);
        if (d <= bd) { bd = d; best = c; }
      });
      if (best) return { val: best.val, src: 'сверено с окупаемостью' };
    }
    return { val: good[0].val, src: good[0].explicit ? 'из строки «в месяц»' : 'из текста' };
  };

  /* Слова для поиска по сегменту: люди пишут и «ГАБ», и «псн», и «аренда». */
  var KIND_WORD = { gab: 'габ арендный поток готовый бизнес', psn: 'псн помещение свободного назначения', rent: 'аренда' };

  var withMetrics = function (arr) {
    arr.forEach(function (o) {
      o.is_rent = String(o.type || '').toLowerCase() === 'аренда';
      var ok = extractOkup(o);
      var mp = extractMap(o, ok);
      o.map = mp ? mp.val : null;
      o.map_src = mp ? mp.src : null;
      /* Сегмент витрины: ГАБ — есть арендный поток (МАП), ПСН — потока нет,
         аренда — отдельная категория. Считается ЗДЕСЬ, рядом с o.map, чтобы
         бейдж, фильтр и счётчик не разошлись. */
      o.kind = o.is_rent ? 'rent' : (o.map != null ? 'gab' : 'psn');
      o.okup = (ok && ok >= 2 && ok <= 30) ? ok : null;
      var y = null;
      if (o.okup) y = round1(100 / o.okup);                          /* из окупаемости */
      else if (o.map && o.price) y = round1(o.map * 12 / o.price * 100);  /* из аренды */
      o.yield = (y && y >= 2 && y <= 40) ? y : null;
      if (o.is_rent) o.map = o.map || o.price;                       /* в аренде цена = платёж в месяц */
      o.search = [o.title, o.address, (o.metro || []).join(' '), o.map, o.yield,
                  o.kind, KIND_WORD[o.kind]]
        .join(' ').toLowerCase();
    });
    return arr;
  };
  var round1 = function (v) { return Math.round(v * 10) / 10; };

  var yieldLine = function (o) {
    if (o.is_rent) return '<span class="vg-stat vg-hl">💰 ' + esc(fmtMoney(o.price)) + '/мес</span>';
    var out = '';
    if (o.map) out += '<span class="vg-stat vg-hl">💰 МАП ' + esc(fmtMoney(o.map)) + '</span>';
    if (o.yield) {
      var t = fmtPct(o.yield);
      if (o.okup) t += ' · окуп. ' + String(o.okup).replace('.', ',') + ' лет';
      out += '<span class="vg-stat vg-hl">📈 ' + esc(t) + '</span>';
    }
    return out;
  };
  var esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&'+'amp;').replace(/</g, '&'+'lt;').replace(/>/g, '&'+'gt;')
      .replace(/"/g, '&'+'quot;').replace(/'/g, '&'+'#39;');
  };
  var stripHtml = function (s) {
    /* Теги заменяем ПРОБЕЛОМ, а не пустой строкой: иначе «м</p><p>МАП» слипается
       в «мМАП» и ярлык МАП теряется (текст в фиде размечен абзацами и <br>). */
    var t = String(s == null ? '' : s).replace(/<[^>]*>/g, ' ');
    var d = document.createElement('div'); d.innerHTML = t; return d.textContent || '';
  };

  var state = { all: [], type: 'all', sort: 'yield-desc', q: '',
                yield_min: null, map_min: null };
  var last_list = [];

  var el = function (tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };

  var card = function (o) {
    var img = (o.images && o.images.length) ? o.images[0]
      : 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="100%" height="100%" fill="#e5e7eb"/><text x="50%" y="50%" fill="#9ca3af" font-size="20" text-anchor="middle" font-family="sans-serif">Фото скоро появится</text></svg>');
    var price = fmtPrice(o.price);
    var area = fmtArea(o.area);
    /* Бейдж = сегмент витрины (ГАБ/ПСН/Аренда): на продаже слово «Продажа»
       стояло бы на всех 238 карточках и не несло смысла. Сегмент совпадает
       с фильтром и счётчиком. */
    var typeTxt = o.kind === 'rent' ? 'Аренда'
      : (o.kind === 'gab' ? 'ГАБ' : (o.kind === 'psn' ? 'ПСН'
        : ({ 'продажа': 'Продажа', 'аренда': 'Аренда' }[o.type] || (o.type || ''))));
    var c = el('div', 'vg-card');
    var badge = typeTxt ? '<span class="vg-badge">' + esc(typeTxt) + '</span>' : '';
    var areaEl = area ? '<span class="vg-stat">📐 ' + esc(area) + '</span>' : '';
    var metroEl = (o.metro && o.metro.length) ? '<span class="vg-stat">🚇 ' + esc(o.metro[0]) + '</span>' : '';
    var moneyEl = yieldLine(o);
    c.innerHTML =
      '<div class="vg-img"><img loading="lazy" src="' + esc(img) + '" alt="' + esc(o.title || o.address) + '" onerror="this.style.display=\'none\'">' + badge + '</div>' +
      '<div class="vg-body">' +
      '<div class="vg-price">' + esc(price) + '</div>' +
      '<div class="vg-title">' + esc(o.title || '') + '</div>' +
      '<div class="vg-addr">📍 ' + esc(o.address || '') + '</div>' +
      '<div class="vg-stats">' + areaEl + metroEl + '</div>' +
      (moneyEl ? '<div class="vg-stats">' + moneyEl + '</div>' : '') +
      '<div class="vg-desc">' + esc(stripHtml(o.description || '').slice(0, 140)) + '</div>' +
      '<button class="vg-btn" data-id="' + esc(o.id) + '">Подробнее</button>' +
      '</div>';
    return c;
  };

  var modal = function (o) {
    var m = el('div', 'vg-modal');
    var imgs = (o.images || []).map(function (u, i) {
      return '<div class="vg-slide' + (i === 0 ? ' active' : '') + '"><img src="' + esc(u) + '" alt=""></div>';
    }).join('');
    var nav = (o.images || []).length > 1
      ? '<button class="vg-nav vg-prev">‹</button><button class="vg-nav vg-next">›</button><div class="vg-dots">' +
        (o.images || []).map(function (_, i) { return '<span class="' + (i === 0 ? 'on' : '') + '"></span>'; }).join('') + '</div>'
      : '';
    var metro = (o.metro || []).map(function (m2) { return '<span class="vg-chip">🚇 ' + esc(m2) + '</span>'; }).join('');
    var details = [
      ['Цена', fmtPrice(o.price)],
      [o.is_rent ? 'Аренда в месяц' : 'Арендная плата (МАП)', fmtMoney(o.map)],
      ['Доходность', o.yield ? fmtPct(o.yield) + ' годовых' : ''],
      ['Окупаемость', o.okup ? (String(o.okup).replace('.', ',') + ' лет') : ''],
      ['Площадь', fmtArea(o.area)],
      ['Этаж', (o.floor ? o.floor + (o.floors_total ? ' из ' + o.floors_total : '') : '')],
      ['Тип сделки', o.type],
      ['Сегмент', o.kind === 'rent' ? 'Аренда'
        : (o.kind === 'gab' ? 'ГАБ — есть арендный поток'
        : (o.kind === 'psn' ? 'ПСН — без арендного потока' : ''))],
      ['Категория', o.category],
      ['Ремонт', o.renovation]
    ].filter(function (r) { return r[1]; }).map(function (r) {
      return '<div class="vg-det"><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>';
    }).join('');

    m.innerHTML =
      '<div class="vg-overlay"></div>' +
      '<div class="vg-modal-inner">' +
      '<button class="vg-close">✕</button>' +
      '<div class="vg-gallery">' + imgs + nav + '</div>' +
      '<div class="vg-info">' +
      '<div class="vg-price-big">' + esc(fmtPrice(o.price)) + '</div>' +
      '<h3>' + esc(o.title || '') + '</h3>' +
      '<div class="vg-addr-big">📍 ' + esc(o.address || '') + '</div>' +
      '<div class="vg-chips">' + metro + '</div>' +
      '<div class="vg-details">' + details + '</div>' +
      '<div class="vg-desc-full">' + esc(stripHtml(o.description || '')) + '</div>' +
      '</div></div>';

    m.addEventListener('click', function (e) {
      if (e.target.closest('.vg-close') || e.target.classList.contains('vg-overlay')) m.remove();
      if (e.target.closest('.vg-next')) slide(1);
      if (e.target.closest('.vg-prev')) slide(-1);
    });
    function slide(d) {
      var slides = m.querySelectorAll('.vg-slide'), dots = m.querySelectorAll('.vg-dots span');
      var i = Array.prototype.indexOf.call(slides, m.querySelector('.vg-slide.active')) + d;
      if (i < 0) i = slides.length - 1; if (i >= slides.length) i = 0;
      slides.forEach(function (s, k) { s.classList.toggle('active', k === i); });
      dots.forEach(function (s, k) { s.classList.toggle('on', k === i); });
    }
    return m;
  };

  var apply = function () {
    var list = state.all.slice();
    /* Фильтр сегмента. Значения селекта: all (продажа, без аренды) /
       gab / psn / аренда (последнее — реальный o.type). */
    if (state.type === 'all') list = list.filter(function (o) { return !o.is_rent; });
    else if (state.type === 'gab') list = list.filter(function (o) { return !o.is_rent && o.kind === 'gab'; });
    else if (state.type === 'psn') list = list.filter(function (o) { return !o.is_rent && o.kind === 'psn'; });
    else list = list.filter(function (o) { return o.type === state.type; });
    if (state.map_min != null) {
      list = list.filter(function (o) { return o.map != null && o.map >= state.map_min; });
    }
    if (state.yield_min != null) {
      list = list.filter(function (o) { return o.yield != null && o.yield >= state.yield_min; });
    }
    if (state.q) {
      var q = state.q.toLowerCase().replace(/[а-яё]/g, function (ch) { return ch; });
      var qn = parseFloat(q.replace(/\s/g, '').replace(',', '.'));
      var digits = q.replace(/\D/g, '');
      list = list.filter(function (o) {
        if (o.search.indexOf(q) !== -1) return true;
        /* «10%», «доходность 10» — по числу доходности */
        if (isFinite(qn) && q.indexOf('%') !== -1 && o.yield != null &&
            Math.abs(o.yield - qn) <= 1) return true;
        /* «от 150000», «100000» — по арендной плате и цене */
        if (digits.length >= 5 && ((o.map != null && String(Math.round(o.map)).indexOf(digits) === 0) ||
            (o.price != null && String(Math.round(o.price)).indexOf(digits) === 0))) return true;
        return false;
      });
    }
    list.sort(function (a, b) {
      var pa = a.price || 0, pb = b.price || 0;
      if (state.sort === 'price-asc') return pa - pb;
      if (state.sort === 'price-desc') return pb - pa;
      var va = (a.yield == null ? -1 : a.yield), vb = (b.yield == null ? -1 : b.yield);
      if (state.sort === 'yield-desc') return vb - va || pb - pa;
      var ma = (a.map == null ? -1 : a.map), mb = (b.map == null ? -1 : b.map);
      return mb - ma || pb - pa;
    });
    last_list = list;
    var grid = document.getElementById('vg-grid');
    grid.innerHTML = '';
    if (!list.length) {
      grid.appendChild(el('div', 'vg-empty', 'По вашему запросу ничего не найдено.'));
    } else {
      list.forEach(function (o) { grid.appendChild(card(o)); });
    }
    var withMoney = list.filter(function (o) {
      return o.is_rent ? o.price != null : (o.map != null || o.yield != null);
    }).length;
    /* У сегмента ПСН арендного потока нет по определению — иначе фраза
       «с арендной платой: 0» читается как ошибка. */
    var cntText = 'Найдено объектов: ' + list.length;
    if (state.type !== 'psn') cntText += ' · с арендной платой или доходностью: ' + withMoney;
    document.getElementById('vg-count').textContent = cntText;
  };

  var render = function (data) {
    state.all = withMetrics(data);
    data = state.all;
    var c = C[THEME] || C.light;
    var css = '<style id="vg-style">' +
      '#vsegab{background:' + c.bg + ';color:' + c.text + ';font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;padding:24px;border-radius:12px;line-height:1.45}' +
      '#vsegab *{box-sizing:border-box}' +
      '.vg-head{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-bottom:18px}' +
      '.vg-head h2{margin:0;font-size:22px;flex:1}' +
      '.vg-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
      '.vg-filter,.vg-sort,.vg-search,.vg-num{background:' + c.card + ';border:1px solid ' + c.border + ';color:' + c.text + ';padding:8px 12px;border-radius:8px;font-size:14px;outline:none}' +
      '.vg-search{min-width:200px}' +
      '.vg-num{width:160px}' +
      '.vg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}' +
      '.vg-card{background:' + c.card + ';border:1px solid ' + c.border + ';border-radius:12px;overflow:hidden;display:flex;flex-direction:column;transition:transform .15s,box-shadow .15s}' +
      '.vg-card:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(0,0,0,.12)}' +
      '.vg-img{position:relative;height:190px;background:#eef0f3;overflow:hidden}' +
      '.vg-img img{width:100%;height:100%;object-fit:cover;display:block}' +
      '.vg-badge{position:absolute;top:10px;left:10px;background:' + c.accent + ';color:#fff;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600}' +
      '.vg-body{padding:14px;display:flex;flex-direction:column;gap:6px;flex:1}' +
      '.vg-price{font-size:19px;font-weight:700;color:' + c.accent + '}' +
      '.vg-title{font-weight:600;font-size:15px}' +
      '.vg-addr{color:' + c.muted + ';font-size:13px}' +
      '.vg-stats{display:flex;gap:12px;font-size:13px;color:' + c.muted + ';flex-wrap:wrap}' +
      '.vg-hl{color:' + c.accent + ';font-weight:600}' +
      '.vg-desc{color:' + c.muted + ';font-size:13px;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
      '.vg-btn{margin-top:auto;background:' + c.accent + ';color:#fff;border:0;padding:9px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600}' +
      '.vg-btn:hover{opacity:.9}' +
      '.vg-empty{grid-column:1/-1;text-align:center;color:' + c.muted + ';padding:40px}' +
      '.vg-count{color:' + c.muted + ';font-size:13px;margin-top:12px}' +
      '.vg-modal{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px}' +
      '.vg-overlay{position:absolute;inset:0;background:rgba(0,0,0,.65)}' +
      '.vg-modal-inner{position:relative;background:' + c.card + ';border-radius:14px;max-width:860px;width:100%;max-height:90vh;overflow:auto;display:grid;grid-template-columns:1.2fr 1fr}' +
      '@media(max-width:700px){.vg-modal-inner{grid-template-columns:1fr}}' +
      '.vg-close{position:absolute;top:10px;right:10px;background:rgba(0,0,0,.5);color:#fff;border:0;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px;z-index:2}' +
      '.vg-gallery{position:relative;min-height:280px;background:#111}' +
      '.vg-slide{display:none}.vg-slide.active{display:block}' +
      '.vg-slide img{width:100%;height:100%;object-fit:cover;max-height:420px;display:block}' +
      '.vg-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.5);color:#fff;border:0;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:20px;z-index:2}' +
      '.vg-prev{left:10px}.vg-next{right:10px}' +
      '.vg-dots{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:2}' +
      '.vg-dots span{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.5)}' +
      '.vg-dots span.on{background:#fff}' +
      '.vg-info{padding:22px;display:flex;flex-direction:column;gap:10px}' +
      '.vg-price-big{font-size:24px;font-weight:700;color:' + c.accent + '}' +
      '.vg-info h3{margin:0;font-size:18px}' +
      '.vg-addr-big{color:' + c.muted + '}' +
      '.vg-chips{display:flex;flex-wrap:wrap;gap:6px}' +
      '.vg-chip{background:' + c.chip + ';color:' + c.chipText + ';padding:4px 10px;border-radius:20px;font-size:12px}' +
      '.vg-details{display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:13px}' +
      '.vg-det{display:flex;justify-content:space-between;border-bottom:1px dashed ' + c.border + ';padding:4px 0;color:' + c.muted + '}' +
      '.vg-det b{color:' + c.text + '}' +
      '.vg-desc-full{font-size:14px;color:' + c.text + ';white-space:pre-wrap}' +
      '</style>';

    document.head.insertAdjacentHTML('beforeend', css);

    var root = el('div');
    root.id = 'vsegab';
    root.innerHTML =
      '<div class="vg-head"><h2>Объекты в продаже</h2>' +
      '<div class="vg-controls">' +
      '<select class="vg-filter"><option value="all">Все объекты</option><option value="gab">ГАБ — арендный поток</option><option value="psn">ПСН — самостоятельное заселение</option><option value="аренда">Аренда</option></select>' +
      '<select class="vg-sort"><option value="yield-desc">Сначала доходнее</option>' +
      '<option value="map-desc">Сначала выше аренда</option>' +
      '<option value="price-desc">Сначала дороже</option>' +
      '<option value="price-asc">Сначала дешевле</option></select>' +
      '<input class="vg-search" type="search" placeholder="Поиск: адрес, метро, сеть, доходность…">' +
      '<input class="vg-num" type="number" min="0" step="10000" placeholder="Аренда от, ₽/мес">' +
      '<input class="vg-num" type="number" min="0" step="0.5" placeholder="Доходность от, %">' +
      '</div></div>' +
      '<div class="vg-grid" id="vg-grid"></div>' +
      '<div class="vg-count" id="vg-count"></div>';

    var placeholder = document.getElementById('vsegab-placeholder');
    if (placeholder) placeholder.replaceWith(root); else document.body.appendChild(root);

    root.addEventListener('click', function (e) {
      var btn = e.target.closest('.vg-btn');
      if (btn) {
        var o = state.all.find(function (x) { return x.id === btn.dataset.id; });
        if (o) document.body.appendChild(modal(o));
      }
    });

    root.querySelector('.vg-filter').addEventListener('change', function (e) { state.type = e.target.value; apply(); });
    root.querySelector('.vg-sort').addEventListener('change', function (e) { state.sort = e.target.value; apply(); });
    root.querySelector('.vg-search').addEventListener('input', function (e) { state.q = e.target.value.trim(); apply(); });
    var nums = root.querySelectorAll('.vg-num');
    nums[0].addEventListener('input', function (e) {
      state.map_min = e.target.value === '' ? null : parseFloat(e.target.value);
      apply();
    });
    nums[1].addEventListener('input', function (e) {
      state.yield_min = e.target.value === '' ? null : parseFloat(e.target.value);
      apply();
    });

    apply();
  };

  /* Отладочная ручка: позволяет проверить разбор цифр снаружи (в тестах),
     на вид ничего не влияет. */
  window.VSEGAB = {
    count: function () { return state.all.length; },
    metrics: function () {
      return state.all.map(function (o) {
        return { id: o.id, qd_id: o.qd_id, title: String(o.title || '').slice(0, 40),
                 price: o.price, map: o.map, map_src: o.map_src,
                 okup: o.okup, yield: o.yield, kind: o.kind };
      });
    },
    text: function (qdId) {                       /* сырой разбираемый текст объекта */
      var o = state.all.filter(function (x) { return String(x.qd_id) === String(qdId); })[0];
      return o ? plainText(o) : null;
    }
  };

  
var LIVE_FEED_URL = "https://yadi.sk/d/7rHq2A1btoTN0w";
var LIVE_FEED_FALLBACK = "https://cdn.jsdelivr.net/gh/leshchenko1979/vsegab-widget@main/vsegab_objects_fallback.json";
var YADISK_DOWNLOAD_API = 'https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=';
var notice = function (msg, retry) {
  var root = el('div');
  root.id = 'vsegab';
  root.style.cssText = 'padding:20px;font-family:sans-serif;color:#92400e;background:#fffbeb;' +
    'border:1px solid #fde68a;border-radius:8px;text-align:center';
  root.textContent = msg;
  if (retry) {
    var b = el('button');
    b.textContent = 'Обновить';
    b.style.cssText = 'margin-left:10px;padding:6px 14px;border:1px solid #f59e0b;' +
      'background:#fff;color:#92400e;border-radius:6px;cursor:pointer';
    b.onclick = function () { location.reload(); };
    root.appendChild(b);
  }
  var p = document.getElementById('vsegab-placeholder');
  if (p) p.replaceWith(root); else document.body.appendChild(root);
};
var fetchJson = function (url, ms) {
  var ctl = window.AbortController ? new AbortController() : null;
  var timer = ctl ? setTimeout(function () { ctl.abort(); }, ms) : null;
  // referrerPolicy: Яндекс.Диск отдаёт файл только без заголовка Referer (иначе 403 и CORS-ошибка).
  var opts = ctl
    ? { mode: 'cors', referrerPolicy: 'no-referrer', signal: ctl.signal }
    : { mode: 'cors', referrerPolicy: 'no-referrer' };
  return fetch(url, opts).then(function (r) {
    if (timer) clearTimeout(timer);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
};
/* Публичный фид лежит на Яндекс.Диске: сначала берём подписанную прямую ссылку,
   затем сам JSON. Прямая ссылка-резерв — на случай недоступности Яндекс.Диска. */
var loadFeed = function () {
  return fetchJson(YADISK_DOWNLOAD_API + encodeURIComponent(LIVE_FEED_URL), 12000)
    .then(function (meta) {
      if (!meta || !meta.href) throw new Error('нет прямой ссылки');
      return fetchJson(meta.href, 20000);
    })
    .catch(function () {
      return fetchJson(LIVE_FEED_FALLBACK, 15000);
    });
};
loadFeed()
  .then(function (arr) {
    if (arr && arr.length) render(arr);
    else notice('В фиде пока нет объектов.', false);
  })
  .catch(function () {
    notice('Не удалось загрузить объекты из базы. Обновите страницу чуть позже.', true);
  });
})();


