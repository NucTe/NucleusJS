function query(req, res, next) {
    const url = req.url;
    const queryString = url.split('?')[1];
    if (queryString) {
      const queryParams = {};
      queryString.split('&').forEach((pair) => {
        const [key, value] = pair.split('=');
        queryParams[key] = decodeURIComponent(value);
      });
      req.query = queryParams;
    } else {
      req.query = {};
    }
    next();
  }
  
module.exports = query;
  