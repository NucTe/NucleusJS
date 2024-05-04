const accepts = require('accepts');
const typeis = require('type-is');
const proxyaddr = require('proxy-addr');
const parseRange = require('range-parser');
const parseUrl = require('parseurl');
const fresh = require('fresh');
const deprecate = require('depd')('nucleus');
const http = require('http');

class Request {
  constructor(req) {
    this.req = req;
  }

  get headers() {
    return this.req.headers;
  }

  get method() {
    return this.req.method;
  }

  get url() {
    return this.req.url;
  }

  get ip() {
    return proxyaddr(this.req, this.req.headers['x-forwarded-for'] || this.req.connection.remoteAddress);
  }

  get protocol() {
    return this.req.protocol;
  }

  get(path) {
    return this.req.get(path);
  }

  accepts(types) {
    return accepts(this.req).types(types);
  }

  acceptsEncodings(encodings) {
    return accepts(this.req).encodings(encodings);
  }

  acceptsCharsets(charsets) {
    return accepts(this.req).charsets(charsets);
  }

  acceptsLanguages(languages) {
    return accepts(this.req).languages(languages);
  }

  range(size, options) {
    return parseRange(size, this.req.headers.range, options);
  }

  is(types) {
    return typeis(this.req, types);
  }

  param(name, defaultValue) {
    const params = this.params || {};
    const body = this.body || {};
    const query = this.query || {};

    if (params.hasOwnProperty(name)) return params[name];
    if (body.hasOwnProperty(name)) return body[name];
    if (query.hasOwnProperty(name)) return query[name];

    return defaultValue;
  }

  get fresh() {
    const method = this.method;
    const res = this.res;
    const status = res.statusCode;

    if (method !== 'GET' && method !== 'HEAD') return false;
    if ((status >= 200 && status < 300) || status === 304) {
      return fresh(this.headers, {
        'etag': res.get('ETag'),
        'last-modified': res.get('Last-Modified')
      });
    }

    return false;
  }

  get stale() {
    return !this.fresh;
  }

  get xhr() {
    const val = this.get('X-Requested-With') || '';
    return val.toLowerCase() === 'xmlhttprequest';
  }

  get subdomains() {
    const hostname = this.hostname;
    if (!hostname) return [];
    const offset = this.app.get('subdomain offset');
    const subdomains = hostname.split('.').reverse();
    return subdomains.slice(offset);
  }

  get path() {
    return parseUrl(this.req).pathname;
  }

  get hostname() {
    const trust = this.app.get('trust proxy fn');
    let host = this.get('X-Forwarded-Host');

    if (!host || !trust(this.req.connection.remoteAddress, 0)) {
      host = this.get('Host');
    } else if (host.indexOf(',') !== -1) {
      host = host.substring(0, host.indexOf(',')).trimRight();
    }

    if (!host) return;

    const offset = host[0] === '[' ? host.indexOf(']') + 1 : 0;
    const index = host.indexOf(':', offset);

    return index !== -1 ? host.substring(0, index) : host;
  }

  get host() {
    deprecate('req.host: Use req.hostname instead');
    return this.hostname;
  }
}

module.exports = Request;
