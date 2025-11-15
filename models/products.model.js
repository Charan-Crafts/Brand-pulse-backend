const mongoose = require('mongoose');

const productSchema = mongoose.Schema({
    productName: { 
        type: String, 
        required: true 
    },

    productUrl: { 
        type: String, 
        required: true 
    },

    platform: { 
        type: String,
        enum: ["instagram", "amazon"],
        required: true 
    },

    platformProductId: { 
        type: String 
    }, // For Amazon ASIN or Instagram post ID

    totalReviews: { type: Number, default: 0 },
    positiveCount: { type: Number, default: 0 },
    negativeCount: { type: Number, default: 0 },
    neutralCount: { type: Number, default: 0 },

    lastScraped: { type: Date },
    scrapeStatus: {
        type: String,
        enum: ["pending", "success", "failed"],
        default: "pending"
    },

    reviews: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Review"
        }
    ]
}, { timestamps: true });


module.exports = mongoose.model('Product', productSchema);