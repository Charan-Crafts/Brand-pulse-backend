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
