// application.js

const http = require('http');
var Router = require('./router');
const Route = require('./router/route');
const Layer = require('./router/layer');

class Application {
  constructor() {
    this.middleware = [];
    this.route = new Route();
  }

  Router.prototype.use = function use(path, handler) {
    this.middleware.push({ path, handler });
    };

  handleRequest(req, res) {
    let idx = 0;

    const next = () => {
      if (idx >= this.middleware.length) {
        return this.router.handleRequest(req, res, next);
      }

      const layer = this.middleware[idx++];
      const pathMatched = req.url.startsWith(layer.path);

      if (pathMatched) {
        layer.handler(req, res, next);
      } else {
        next();
      }
    };

    next();
  }

  listen(port, callback) {
    const server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    server.listen(port, callback);
  }
}

module.exports = Application;
