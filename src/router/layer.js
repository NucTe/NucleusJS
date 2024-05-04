const pathToRegexp = require('path-to-regexp');


class Layer {
  constructor(path, options, fn) {
    this.handle = fn;
    this.name = fn.name || '<anonymous>';
    this.params = undefined;
    this.path = path;
    this.keys = [];
    this.regexp = pathToRegexp(path, this.keys, options);
  }

  match(path) {
    const match = this.regexp.exec(path);
    if (!match) {
      this.params = undefined;
      return false;
    }
    this.params = {};
    this.path = match[0];
    for (let i = 1; i < match.length; i++) {
      const key = this.keys[i - 1];
      const prop = key.name;
      const val = decodeURIComponent(match[i]);
      if (val !== undefined || !(prop in this.params)) {
        this.params[prop] = val;
      }
    }
    return true;
  }
}

module.exports = Layer;
