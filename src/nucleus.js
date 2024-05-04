const http = require('http');
const url = require('url');
const qs = require('querystring');
const Router = require('./router/router');

class Nucleus {
  constructor() {
    this.router = new Router();
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });
  }

  get(path, handler) {
    this.router.get(path, handler);
  }

  post(path, handler) {
    this.router.post(path, handler);
  }

  put(path, handler) {
    this.router.put(path, handler);
  }

  delete(path, handler) {
    this.router.delete(path, handler);
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
      const handler = this.router.findRoute(method, path);
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