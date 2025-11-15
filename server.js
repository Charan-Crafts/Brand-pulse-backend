require("dotenv").config();

const express = require('express');

const app = express();

const cors = require('cors');



app.use(cors({
    origin: '*',
    credentials: true,
}));    

app.use(express.json());

app.use(express.urlencoded({ extended: true }));


// Routes

const sentimentRoutes = require('./routes/sentiment.routes');

app.use('/api/v1/sentiment', sentimentRoutes);

app.listen(process.env.PORT || 3000, () => {
    console.log(`Server is running on port ${process.env.PORT || 3000}`);
});


