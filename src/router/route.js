const Layer = require('./layer');

class Route {
  constructor(path) {
    this.path = path;
    this.stack = [];
  }

  use(fn) {
    const layer = new Layer('/', {}, fn);
    this.stack.push(layer);
  }

  match(path) {
    for (const layer of this.stack) {
      if (layer.match(path)) {
        return layer.handle;
      }
    }
    return null;
  }
}

module.exports = Route;
