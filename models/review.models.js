const mongoose = require('mongoose');


const reviewSchema = mongoose.Schema({
    comment: {
        type: String,
        required: true
    },

    authorName: { type: String },
    authorProfile: { type: String },

    platform: {
        type: String,
        enum: ["instagram", "amazon"],
        required: true
    },


    rating: {
        type: Number
    }, // only for Amazon. Instagram will be null.

    likes: {
        type: Number,
        default: 0
    }, // for Instagram comments

    sentiment: {
        type: String,
        enum: ["positive", "negative", "neutral"],
        default: "neutral"
    },

    sentimentScore: { type: Number }, // optional but useful for charts (0-1)

    createdAtPlatform: {
        type: Date
    }, // the timestamp extracted from Instagram/Amazon

    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product"
    }
}, { timestamps: true });


module.exports = mongoose.model('Review', reviewSchema);