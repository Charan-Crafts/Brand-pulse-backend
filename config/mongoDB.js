const mongoose = require('mongoose');

const connectDB = async () => {
    try {

        const response = await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log(`MongoDB connected: ${response.connection.host}`);

    } catch (error) {
        console.log("Error", error);
    }
}

module.exports = connectDB ;