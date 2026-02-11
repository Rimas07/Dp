const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Serve static files
app.use(express.static(__dirname));

// Route for the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'His', 'src', 'frontend.html'));
});

// Catch all other routes and redirect to main page
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'His', 'src', 'frontend.html'));
});

app.listen(PORT, () => {
  console.log(`Frontend server is running on port ${PORT}`);
});
