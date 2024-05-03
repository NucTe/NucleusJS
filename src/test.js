const Nucleus = require('./nucleus');

const app = new Nucleus();

app.get('/', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('GET request received');
});

app.post('/', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('POST request received');
});

app.put('/', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('PUT request received');
});

app.delete('/', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('DELETE request received');
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
