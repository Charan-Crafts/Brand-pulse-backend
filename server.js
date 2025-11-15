require("dotenv").config();

const express = require('express');

const app = express();

const cors = require('cors');

const connectDB = require('./config/mongoDB');

const cookieParser = require('cookie-parser');

connectDB();

app.use(cors({
    origin: process.env.FRONTEND_URL || ["http://localhost:8080", "http://localhost:5173"],
    credentials: true,
}));

app.use(express.json());

app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());


// Routes

const sentimentRoutes = require('./routes/sentiment.routes');

const authRoutes = require('./routes/authRoutes');

const productRoutes = require('./routes/product.routes');

app.use('/api/v1/sentiment', sentimentRoutes);

app.use('/api/v1/auth', authRoutes);

app.use('/api/v1/product', productRoutes);

app.listen(process.env.PORT || 3000, () => {
    console.log(`Server is running on port ${process.env.PORT || 3000}`);
});


