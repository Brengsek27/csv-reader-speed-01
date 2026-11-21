/**
 * Fast CSV parser emulating csv-reader 1.0.0 semantics.
 * Implements run(input) returning {columns, rows, errors}.
 * This file is built in three incremental steps.
 */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // next index to read
  let line = 1; // current line number (1‑based)
  if (text[0] === '\uFEFF') pos = 1; // skip BOM

  // record meta at start of each record
  let recordLine = 1;
  let recordRow = null;
  let crNext = 0;
  let crDone = false;
  let recordEnd = -1;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  function at(i) {
    return i < text.length ? text[i] : '';
  }

  // ---------- slow‑path unquoted field reader ----------
  function readUnquoted(value) {
    let added = 0;
    while (pos < text.length) {
      const c = text[pos];
      if (c === ',') {
        pos += 1;
        return { value, ended: 'comma', added };
      }
      if (c === '\n') {
        pos += 1;
        line += 1;
        return { value, ended: 'line break', added };
      }
      if (c === '\r') {
        if (at(pos + 1) === '\n') {
          pos += 2;
          line += 1;
          return { value, ended: 'line break', added };
        }
        error('stray_cr');
        pos += 1;
        continue;
      }
      value += c;
      added += 1;
      pos += 1;
    }
    return { value, ended: 'end', added };
  }
  // ---------- slow‑path quoted field reader ----------
  function readQuoted() {
    recordEnd = -1;
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1; // skip opening quote
    let closed = false;
    while (pos < text.length) {
      const c = text[pos];
      if (c === '"') {
        if (at(pos + 1) === '"') {
          value += '"';
          pos += 2;
          continue;
        }
        pos += 1;
        closed = true;
        break;
      }
      if (c === '\r') {
        // CR or CRLF becomes LF inside quotes
        value += '\n';
        line += 1;
        pos += at(pos + 1) === '\n' ? 2 : 1;
        continue;
      }
      if (c === '\n') line += 1;
      value += c;
      pos += 1;
    }
    if (!closed) {
      // unterminated: treat opening quote as literal and re‑read as unquoted
      pos = open + 1;
      line = openLine;
      error('unterminated_quote');
      return readUnquoted('"');
    }
    if (pos >= text.length) return { value, ended: 'end' };
    const next = text[pos];
    if (next === ',') {
      pos += 1;
      return { value, ended: 'comma' };
    }
    if (next === '\n') {
      pos += 1;
      line += 1;
      return { value, ended: 'line break' };
    }
    if (next === '\r' && at(pos + 1) === '\n') {
      pos += 2;
      line += 1;
      return { value, ended: 'line break' };
    }
    // junk after closing quote
    const junk = readUnquoted(value);
    if (junk.added > 0) error('quote_junk');
    return junk;
  }

  // ---------- fast‑path unquoted field (optimized) ----------
  function fastReadUnquoted() {
    const start = pos;
    if (recordEnd < start) {
      recordEnd = text.indexOf('\n', start);
      if (recordEnd === -1) recordEnd = text.length;
    }
    const iComma = text.indexOf(',', start);
    let end, ended;
    if (iComma !== -1 && iComma < recordEnd) {
      end = iComma;
      ended = 'comma';
    } else if (recordEnd < text.length) {
      end = recordEnd;
      ended = 'line break';
    } else {
      end = text.length;
      ended = 'end';
    }
    let cEnd = end;
    if (ended === 'line break' && end > start && text.charCodeAt(end - 1) === 13) {
      cEnd = end - 1;
    }
    if (!crDone && crNext < start) {
      crNext = text.indexOf('\r', start);
      if (crNext === -1) {
        crDone = true;
        crNext = Infinity;
      }
    }
    if (crNext < cEnd) {
      return readUnquoted('');
    }
    const value = text.slice(start, cEnd);
    if (ended === 'comma') {
      pos = end + 1;
    } else if (ended === 'line break') {
      pos = end + 1;
      line += 1;
    } else {
      pos = text.length;
    }
    return { value, ended, added: cEnd - start };
  }
  // ---------- fast‑path quoted field (optimized) ----------
  function fastReadQuoted() {
    recordEnd = -1;
    const open = pos;
    const openLine = line;
    let segStart = open + 1;
    let i = segStart;
    let parts = null;
    while (true) {
      const q = text.indexOf('"', i);
      if (q === -1) {
        pos = open + 1;
        line = openLine;
        error('unterminated_quote');
        return readUnquoted('"');
      }
      if (!crDone && crNext < segStart) {
        crNext = text.indexOf('\r', segStart);
        if (crNext === -1) {
          crDone = true;
          crNext = Infinity;
        }
      }
      if (crNext < q) {
        pos = open;
        line = openLine;
        return readQuoted();
      }
      // count LF between segStart and q
      let p = text.indexOf('\n', segStart);
      while (p !== -1 && p < q) {
        line += 1;
        p = text.indexOf('\n', p + 1);
      }
      if (text.charCodeAt(q + 1) === 34) { // double double-quote
        if (parts === null) parts = [];
        parts.push(text.slice(segStart, q));
        parts.push('"');
        i = q + 2;
        segStart = i;
        continue;
      }
      // closing quote
      let value;
      if (parts === null) {
        value = text.slice(segStart, q);
      } else {
        parts.push(text.slice(segStart, q));
        value = parts.join('');
      }
      pos = q + 1;
      if (pos >= text.length) {
        return { value, ended: 'end' };
      }
      const c = text[pos];
      if (c === ',') {
        pos += 1;
        return { value, ended: 'comma' };
      }
      if (c === '\n') {
        pos += 1;
        line += 1;
        return { value, ended: 'line break' };
      }
      if (c === '\r' && at(pos + 1) === '\n') {
        pos += 2;
        line += 1;
        return { value, ended: 'line break' };
      }
      const junk = readUnquoted(value);
      if (junk.added > 0) error('quote_junk');
      return junk;
    }
  }

  // ---------- main parsing loop ----------
  while (true) {
    // Skip empty lines (pure LF or CRLF) before a record.
    while (pos < text.length) {
      if (text[pos] === '\n') {
        pos += 1;
        line += 1;
      } else if (text[pos] === '\r' && at(pos + 1) === '\n') {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= text.length) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let field;
    let quoted;
    do {
      quoted = text[pos] === '"';
      field = quoted ? fastReadQuoted() : fastReadUnquoted();
      fields.push(field.value);
    } while (field.ended === 'comma');

    // No-record rule for lines with only stray CRs (empty unquoted field)
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
