const http = require('http');
const url = require('url');
const qs = require('querystring');

class Nucleus {
  constructor() {
    this.routes = {};
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });
  }

  get(path, handler) {
    this.addRoute('GET', path, handler);
  }

  post(path, handler) {
    this.addRoute('POST', path, handler);
  }

  put(path, handler) {
    this.addRoute('PUT', path, handler);
  }

  delete(path, handler) {
    this.addRoute('DELETE', path, handler);
  }

  addRoute(method, path, handler) {
    if (!this.routes[path]) {
      this.routes[path] = {};
    }
    this.routes[path][method] = handler;
  }

  handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname;
    const method = req.method;
    const query = parsedUrl.query;
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      req.query = query;
      req.body = qs.parse(body);
      const handler = this.routes[path] && this.routes[path][method];
      if (handler) {
        handler(req, res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
  }

  listen(port, callback) {
    this.server.listen(port, callback);
  }
}

module.exports = Nucleus;