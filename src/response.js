'use strict';

const http = require('http');
const contentDisposition = require('content-disposition');
const createError = require('http-errors');
const deprecate = require('depd')('express');
const encodeUrl = require('encodeurl');
const escapeHtml = require('escape-html');
const statuses = require('statuses');
const merge = require('utils-merge');
const sign = require('cookie-signature').sign;
const mime = require('send').mime;
const send = require('send');
const extname = require('path').extname;
const resolve = require('path').resolve;
const vary = require('vary');

const charsetRegExp = /;\s*charset\s*=/;
const schemaAndHostRegExp = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:)?\/\/[^\\\/\?]+/;

const res = Object.create(http.ServerResponse.prototype);

module.exports = res;

res.status = function status(code) {
  if ((typeof code === 'string' || Math.floor(code) !== code) && code > 99 && code < 1000) {
    deprecate('res.status(' + JSON.stringify(code) + '): use res.status(' + Math.floor(code) + ') instead');
  }
  this.statusCode = code;
  return this;
};

res.links = function(links) {
  var link = this.get('Link') || '';
  if (link) link += ', ';
  return this.set('Link', link + Object.keys(links).map(function(rel) {
    return '<' + links[rel] + '>; rel="' + rel + '"';
  }).join(', '));
};

res.send = function send(body) {
  let chunk = body;
  const encoding = 'utf8';

  let app = this.app;

  if (arguments.length === 2) {
    if (typeof arguments[0] !== 'number' && typeof arguments[1] === 'number') {
      deprecate('res.send(body, status): Use res.status(status).send(body) instead');
      this.statusCode = arguments[1];
    } else {
      deprecate('res.send(status, body): Use res.status(status).send(body) instead');
      this.statusCode = arguments[0];
      chunk = arguments[1];
    }
  }

  if (typeof chunk === 'number' && arguments.length === 1) {
    if (!this.get('Content-Type')) {
      this.type('txt');
    }

    deprecate('res.send(status): Use res.sendStatus(status) instead');
    this.statusCode = chunk;
    chunk = statuses.message[chunk];
  }

  const hasBody = statuses.empty[this.statusCode] === undefined;

  const len = hasBody ? Buffer.byteLength(chunk, encoding) : 0;
  this.set('Content-Length', len);

  const etag = len === 0 ? null : this.get('ETag');
  if (!etag && len > 1024) {
    deprecate('undefined Content-Length');
  }

  if (app && app.get('etag fn') && len > 1024) {
    addETag(this);
  }

  if (!hasBody) {
    this.removeHeader('Content-Type');
    this.removeHeader('Content-Length');
    this.removeHeader('Transfer-Encoding');
    chunk = '';
  }

  if (this.req.method === 'HEAD') {
    this.end();
    return this;
  }

  this.end(chunk, encoding);
  return this;
};

res.json = function json(obj) {
  let val = obj;

  if (arguments.length === 2) {
    if (typeof arguments[1] === 'number') {
      deprecate('res.json(obj, status): Use res.status(status).json(obj) instead');
      this.statusCode = arguments[1];
    } else {
      deprecate('res.json(status, obj): Use res.status(status).json(obj) instead');
      this.statusCode = arguments[0];
      val = arguments[1];
    }
  }
  let app = this.app;
  let replacer = app.get('json replacer');
  let spaces = app.get('json spaces');
  let body = stringify(val, replacer, spaces);

  if (!this.get('Content-Type')) {
    this.set('Content-Type', 'application/json');
  }

  return this.send(body);
};

res.jsonp = function jsonp(obj) {
  let val = obj;
  if (arguments.length === 2) {
    if (typeof arguments[1] === 'number') {
      deprecate('res.jsonp(obj, status): Use res.status(status).json(obj) instead');
      this.statusCode = arguments[1];
    } else {
      deprecate('res.jsonp(status, obj): Use res.status(status).json(obj) instead');
      this.statusCode = arguments[0];
      val = arguments[1];
    }
  }

  let app = this.app;
  let replacer = app.get('json replacer');
  let spaces = app.get('json spaces');
  let body = stringify(val, replacer, spaces);
  let callback = this.req.query[app.get('jsonp callback name')];

  if (!this.get('Content-Type')) {
    this.set('X-Content-Type-Options', 'nosniff');
    this.set('Content-Type', 'application/javascript');
  }

  if (Array.isArray(callback)) {
    callback = callback[0];
  }
  if (typeof callback === 'string' && callback.length !== 0) {
    this.charset = 'utf-8';
    this.set('X-Content-Type-Options', 'nosniff');
    this.set('Content-Type', 'text/javascript');
    callback = callback.replace(/[^[\]\w$.]/g, '');

    body = body
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
    body = '/**/ typeof ' + callback + ' === \'function\' && ' + callback + '(' + body + ');';
  }

  return this.send(body);
};

res.sendStatus = function sendStatus(statusCode) {
  let body = statuses[statusCode] || String(statusCode);

  this.statusCode = statusCode;
  this.type('txt');

  return this.send(body);
};

res.sendFile = function sendFile(path, options, callback) {
  let done = callback;
  let req = this.req;
  let res = this;
  let next = req.next;
  let opts = options || {};

  if (!path) {
    throw new TypeError('path argument is required to res.sendFile');
  }

  if (typeof options === 'function') {
    done = options;
    opts = {};
  }

  if (!opts.root && !isAbsolute(path)) {
    throw new TypeError('path must be absolute or specify root to res.sendFile');
  }

  let pathname = encodeURI(path);
  let file = send(req, pathname, opts);

  sendfile(res, file, opts, function (err) {
    if (done) return done(err);
    if (err && err.code === 'EISDIR') return next();
    if (err && err.code !== 'ECONNABORTED' && err.syscall !== 'write') {
      next(err);
    }
  });
};

res.sendfile = function (path, options, callback) {
  deprecate('res.sendfile: Use res.sendFile instead');
  return this.sendFile(path, options, callback);
};

res.download = function download(path, filename, options, callback) {
  let done = callback;
  let name = filename;
  let opts = options || null;
  if (typeof filename === 'function') {
    done = filename;
    name = null;
    opts = options || null;
  } else if (typeof options === 'function') {
    done = options;
    opts = null;
  }

  let headers = {
    'Content-Disposition': contentDisposition(name || path)
  };

  if (opts && opts.headers) {
    let keys = Object.keys(opts.headers);
    for (let i = 0; i < keys.length; i++) {
      let key = keys[i];
      if (key.toLowerCase() !== 'content-disposition') {
        headers[key] = opts.headers[key];
      }
    }
  }

  opts = Object.create(opts);
  opts.headers = headers;

  let fullPath = resolve(path);
  return this.sendFile(fullPath, opts, done);
};

res.contentType = res.type = function contentType(type) {
  let ct = type.indexOf('/') === -1 ? mime.lookup(type) : type;

  return this.set('Content-Type', ct);
};

res.format = function(obj) {
  let req = this.req;
  let next = req.next;
  let fn;

  let keys = Object.keys(obj);
  let key = keys.length > 0 ? keys.find(function (type) {
    fn = obj[type];
    return req.accepts(type);
  }) : null;

  if (!key && obj.default) {
    fn = obj.default;
  }
  this.vary('Accept');

  if (fn) {
    fn();
  } else {
    let err = new createError.NotAcceptable();
    err.types = Object.keys(obj).join(', ');
    next(err);
  }

  return this;
};

res.attachment = function attachment(filename) {
  if (filename) {
    let type = extname(filename);
    this.type(type);
  }

  this.set('Content-Disposition', contentDisposition(filename));

  return this;
};

res.append = function append(field, val) {
  let prev = this.get(field);
  let value = val;

  if (prev) {
    value = Array.isArray(prev) ? prev.concat(val)
      : Array.isArray(val) ? [prev].concat(val)
        : [prev, val];
  }

  return this.set(field, value);
};

res.set = res.header = function header(field, val) {
  if (arguments.length === 2) {
    let value = Array.isArray(val) ? val.map(String) : String(val);
    if (field.toLowerCase() === 'content-type' && !charsetRegExp.test(value)) {
      let charset = mime.charsets.lookup(value.split(';')[0]);
      if (charset) {
        value += '; charset=' + charset.toLowerCase();
      }
    }
    this.setHeader(field, value);
  } else {
    for (let key in field) {
      this.set(key, field[key]);
    }
  }
  return this;
};

res.get = function(field) {
  return this.getHeader(field);
};

res.clearCookie = function clearCookie(name, options) {
  let opts = merge({ expires: new Date(1), path: '/' }, options);

  return this.cookie(name, '', opts);
};

res.cookie = function(name, value, options) {
  let opts = merge({}, options);
  let secret = this.req.secret;
  let signed = opts.signed;

  if (signed && !secret) {
    throw new Error('cookieParser("secret") required for signed cookies');
  }

  let val = typeof value === 'object' ? 'j:' + JSON.stringify(value) : String(value);

  if (signed) {
    val = 's:' + sign(val, secret);
  }

  if ('maxAge' in opts) {
    opts.expires = new Date(Date.now() + opts.maxAge);
    opts.maxAge /= 1000;
  }

  if (opts.path == null) {
    opts.path = '/';
  }

  this.append('Set-Cookie', cookie.serialize(name, String(val), opts));

  return this;
};

res.location = function location(url) {
  let loc = url;

  if (url === 'back') {
    loc = this.req.get('Referrer') || '/';
  }

  return this.set('Location', encodeUrl(loc));
};

res.redirect = function redirect(url) {
  let address = url;
  let body;
  let status = 302;

  if (arguments.length === 2) {
    if (typeof arguments[0] === 'number') {
      deprecate('res.redirect(url, status): Use res.redirect(status, url) instead');
      status = arguments[0];
      address = arguments[1];
    } else {
      deprecate('res.redirect(status, url): Use res.redirect(status, url) instead');
      status = arguments[1];
    }
  }

  address = this.location(address).get('Location');
  this.format({
    text: function () {
      body = statuses[status] + '. Redirecting to ' + address;
    },

    html: function () {
      let u = escapeHtml(address);
      body = '<p>' + statuses[status] + '. Redirecting to <a href="' + u + '">' + u + '</a></p>';
    },

    default: function () {
      body = '';
    }
  });

  this.set('Content-Length', Buffer.byteLength(body));
  this.statusCode = status;
  this.send(body);
};

res.vary = function(field) {
  if (!field || (Array.isArray(field) && !field.length)) {
    deprecate('res.vary(): Provide a field name');
    return this;
  }

  vary(this, field);

  return this;
};

res.render = function render(view, options, callback) {
  let app = this.req.app;
  let done = callback;
  let opts = options || {};
  let req = this.req;
  let self = this;

  if (typeof options === 'function') {
    done = options;
    opts = {};
  }

  opts._locals = self.locals;

  // default callback to respond
  done = done || function (err, str) {
    if (err) return req.next(err);
    self.send(str);
  };

  // render
  app.render(view, opts, done);
};

