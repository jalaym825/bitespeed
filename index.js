const express = require('express');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const http = require('http');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
const port = process.env.PORT || 3001;

app.use(morgan("[:date[clf]] :method :url :status :res[content-length] - :response-time ms"));

app.use(express.json());
app.use(cookieParser());

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.post('/identify', async (req, res) => {

})

http.createServer(app).listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
})