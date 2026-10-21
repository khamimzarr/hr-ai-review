// Mock GAS globals untuk Node test
// UrlFetchApp: mock fetch yang return response berurutan (queue) atau fallback ke terakhir
global.UrlFetchApp = {
  _responses: [],
  _callIndex: 0,
  _callLog: [],
  fetch(url, options) {
    // Ambil response berikutnya dari queue, atau fallback ke terakhir
    var resp;
    if (this._callIndex < this._responses.length) {
      resp = this._responses[this._callIndex];
      this._callIndex++;
    } else {
      resp = this._responses[this._responses.length - 1];
    }
    var code = resp ? resp.code : 200;
    var body = resp ? resp.body : '{}';
    var mock = {
      url: url,
      options: options,
      getResponseCode() { return code; },
      getContentText() { return body; }
    };
    this._callLog.push({ url: url, options: options });
    return mock;
  },
  _reset() { this._responses = []; this._callIndex = 0; this._callLog = []; },
  _getLastCall() { return this._callLog[this._callLog.length - 1]; },
  _setResponse(code, body) { this._responses.push({ code: code, body: body }); }
};

// PropertiesService: key-value store sederhana
global.PropertiesService = {
  _props: {},
  getScriptProperties() {
    return {
      getProperty(key) { return PropertiesService._props[key] || null; },
      setProperty(key, val) { PropertiesService._props[key] = String(val); },
      deleteProperty(key) { delete PropertiesService._props[key]; }
    };
  },
  _reset() { this._props = {}; }
};

// Utilities: mock sleep (retry backoff tidak perlu benar-benar menunggu di test)
if (!global.Utilities) {
  global.Utilities = {
    sleep(ms) { this._slept = (this._slept || 0) + ms; },
    _reset() { this._slept = 0; }
  };
}

// ContentService: capture text output
global.ContentService = {
  MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
  createTextOutput(content) {
    return {
      _content: content,
      _mimeType: null,
      setMimeType(type) { this._mimeType = type; return this; },
      getContent() { return this._content; },
      getMimeType() { return this._mimeType; }
    };
  }
};
