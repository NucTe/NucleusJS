var setPrototypeOf = require('setprototypeof');

function initMiddleware(req, res, next) {
  if (app.enabled('x-powered-by')) {
    res.setHeader('X-Powered-By', 'nucleus');
  }
  req.res = res;
  res.req = req;
  req.next = next;

  setPrototypeOf(req, app.request);
  setPrototypeOf(res, app.response);
  res.locals = res.locals || Object.create(null);

  next();
}

module.exports = initMiddleware;
