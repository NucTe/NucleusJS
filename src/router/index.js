const Route = require('./route');
const Layer = require('./layer');
const methods = require('methods');
const mixin = require('utils-merge');
const debug = require('debug')('nucleus:router');
const deprecate = require('depd')('nucleus:router');
const flatten = require('array-flatten');
const parseUrl = require('parseurl');
const setPrototypeOf = require('setprototypeof');

const objectRegExp = /^\[object (\S+)\]$/;
const slice = Array.prototype.slice;
const toString = Object.prototype.toString;

const proto = module.exports = function(options) {
  const opts = options || {};

  function router(req, res, next) {
    router.handle(req, res, next);
  }

  setPrototypeOf(router, proto);

  router.params = {};
  router._params = [];
  router.caseSensitive = opts.caseSensitive;
  router.mergeParams = opts.mergeParams;
  router.strict = opts.strict;
  router.stack = [];

  return router;
};

proto.param = function param(name, fn) {
  if (typeof name === 'function') {
    deprecate('router.param(fn): Refactor to use path params');
    this._params.push(name);
    return;
  }

  const params = this._params;
  const len = params.length;
  let ret;

  if (name[0] === ':') {
    deprecate('router.param(' + JSON.stringify(name) + ', fn): Use router.param(' + JSON.stringify(name.slice(1)) + ', fn) instead');
    name = name.slice(1);
  }

  for (let i = 0; i < len; ++i) {
    if (ret = params[i](name, fn)) {
      fn = ret;
    }
  }

  if (typeof fn !== 'function') {
    throw new Error('invalid param() call for ' + name + ', got ' + fn);
  }

  (this.params[name] = this.params[name] || []).push(fn);
  return this;
};

proto.handle = function handle(req, res, out) {
  const self = this;

  debug('dispatching %s %s', req.method, req.url);

  let idx = 0;
  let protohost = getProtohost(req.url) || '';
  let removed = '';
  let slashAdded = false;
  let sync = 0;
  let paramcalled = {};

  const options = [];

  let stack = self.stack;

  let parentParams = req.params;
  let parentUrl = req.baseUrl || '';
  let done = restore(out, req, 'baseUrl', 'next', 'params');

  req.next = next;

  if (req.method === 'OPTIONS') {
    done = wrap(done, function(old, err) {
      if (err || options.length === 0) return old(err);
      sendOptionsResponse(res, options, old);
    });
  }

  req.baseUrl = parentUrl;
  req.originalUrl = req.originalUrl || req.url;

  next();

  function next(err) {
    let layerError = err === 'route' ? null : err;

    if (slashAdded) {
      req.url = req.url.slice(1);
      slashAdded = false;
    }

    if (removed.length !== 0) {
      req.baseUrl = parentUrl;
      req.url = protohost + removed + req.url.slice(protohost.length);
      removed = '';
    }

    if (layerError === 'router') {
      setImmediate(done, null);
      return;
    }

    if (idx >= stack.length) {
      setImmediate(done, layerError);
      return;
    }

    if (++sync > 100) {
      return setImmediate(next, err);
    }

    let path = getPathname(req);

    if (path == null) {
      return done(layerError);
    }

    let layer;
    let match;
    let route;

    while (match !== true && idx < stack.length) {
      layer = stack[idx++];
      match = matchLayer(layer, path);
      route = layer.route;

      if (typeof match !== 'boolean') {
        layerError = layerError || match;
      }

      if (match !== true) {
        continue;
      }

      if (!route) {
        continue;
      }

      if (layerError) {
        match = false;
        continue;
      }

      let method = req.method;
      let has_method = route._handles_method(method);

      if (!has_method && method === 'OPTIONS') {
        appendMethods(options, route._options());
      }

      if (!has_method && method !== 'HEAD') {
        match = false;
      }
    }

    if (match !== true) {
      return done(layerError);
    }

    if (route) {
      req.route = route;
    }

    req.params = self.mergeParams
      ? mergeParams(layer.params, parentParams)
      : layer.params;
    let layerPath = layer.path;

    self.process_params(layer, paramcalled, req, res, function (err) {
      if (err) {
        next(layerError || err);
      } else if (route) {
        layer.handle_request(req, res, next);
      } else {
        trim_prefix(layer, layerError, layerPath, path);
      }

      sync = 0;
    });
  }

  function trim_prefix(layer, layerError, layerPath, path) {
    if (layerPath.length !== 0) {
      if (layerPath !== path.slice(0, layerPath.length)) {
        next(layerError);
        return;
      }

      let c = path[layerPath.length];
      if (c && c !== '/' && c !== '.') return next(layerError);

      removed = layerPath;
      req.url = protohost + req.url.slice(protohost.length + removed.length);

      if (!protohost && req.url[0] !== '/') {
        req.url = '/' + req.url;
        slashAdded = true;
      }

      req.baseUrl = parentUrl + (removed[removed.length - 1] === '/'
        ? removed.substring(0, removed.length - 1)
        : removed);
    }

    debug('%s %s : %s', layer.name, layerPath, req.originalUrl);

    if (layerError) {
      layer.handle_error(layerError, req, res, next);
    } else {
      layer.handle_request(req, res, next);
    }
  }
};

proto.use = function use(fn) {
    var offset = 0;
    var path = '/';

    if (typeof fn !== 'function') {
      var arg = fn;
  
      while (Array.isArray(arg) && arg.length !== 0) {
        arg = arg[0];
      }

      if (typeof arg !== 'function') {
        offset = 1;
        path = fn;
      }
    }
  
    var callbacks = flatten(slice.call(arguments, offset));
  
    if (callbacks.length === 0) {
      throw new TypeError('Router.use() requires a middleware function')
    }
  
    for (var i = 0; i < callbacks.length; i++) {
      var fn = callbacks[i];
  
      if (typeof fn !== 'function') {
        throw new TypeError('Router.use() requires a middleware function but got a ' + gettype(fn))
      }
      debug('use %o %s', path, fn.name || '<anonymous>')
  
      var layer = new Layer(path, {
        sensitive: this.caseSensitive,
        strict: false,
        end: false
      }, fn);
  
      layer.route = undefined;
  
      this.stack.push(layer);
    }
  
    return this;
  };

proto.route = function route(path) {
    var route = new Route(path);
  
    var layer = new Layer(path, {
      sensitive: this.caseSensitive,
      strict: this.strict,
      end: true
    }, route.dispatch.bind(route));
  
    layer.route = route;
  
    this.stack.push(layer);
    return route;
  };
  methods.concat('all').forEach(function(method){
    proto[method] = function(path){
      var route = this.route(path)
      route[method].apply(route, slice.call(arguments, 1));
      return this;
    };
  });

// append methods to a list of methods
function appendMethods(list, addition) {
  for (let i = 0; i < addition.length; i++) {
    let method = addition[i];
    if (list.indexOf(method) === -1) {
      list.push(method);
    }
  }
}

// get pathname of request
function getPathname(req) {
  try {
    return parseUrl(req).pathname;
  } catch (err) {
    return undefined;
  }
}

// Get get protocol + host for a URL
function getProtohost(url) {
  if (typeof url !== 'string' || url.length === 0 || url[0] === '/') {
    return undefined;
  }

  let searchIndex = url.indexOf('?');
  let pathLength = searchIndex !== -1
    ? searchIndex
    : url.length;
  let fqdnIndex = url.slice(0, pathLength).indexOf('://');

  return fqdnIndex !== -1
    ? url.substring(0, url.indexOf('/', 3 + fqdnIndex))
    : undefined;
}

// merge params with parent params
function mergeParams(params, parent) {
  if (typeof parent !== 'object' || !parent) {
    return params;
  }

  let obj = mixin({}, parent);

  if (!(0 in params) || !(0 in parent)) {
    return mixin(obj, params);
  }

  let i = 0;
  let o = 0;

  while (i in params) {
    i++;
  }

  while (o in parent) {
    o++;
  }

  for (i--; i >= 0; i--) {
    params[i + o] = params[i];

    if (i < o) {
      delete params[i];
    }
  }

  return mixin(obj, params);
}

// restore obj props after function
function restore(fn, obj) {
  let props = new Array(arguments.length - 2);
  let vals = new Array(arguments.length - 2);

  for (let i = 0; i < props.length; i++) {
    props[i] = arguments[i + 2];
    vals[i] = obj[props[i]];
  }

  return function () {
    for (let i = 0; i < props.length; i++) {
      obj[props[i]] = vals[i];
    }

    return fn.apply(this, arguments);
  };
}

// send an OPTIONS response
function sendOptionsResponse(res, options, next) {
  try {
    let body = options.join(',');
    res.set('Allow', body);
    res.send(body);
  } catch (err) {
    next(err);
  }
}

// wrap a function
function wrap(old, fn) {
  return function proxy() {
    let args = new Array(arguments.length + 1);

    args[0] = old;
    for (let i = 0, len = arguments.length; i < len; i++) {
      args[i + 1] = arguments[i];
    }

    fn.apply(this, args);
  };
}
