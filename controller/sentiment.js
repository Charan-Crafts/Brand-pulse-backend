require("dotenv").config();
const { InferenceClient } = require("@huggingface/inference");
const Review = require('../models/review.models');
const Product = require('../models/products.model');

const sentiment = async (req, res) => {
    const { responses, productId, reviewIds } = req.body;

    if (!responses || !Array.isArray(responses)) {
        return res.status(400).json({ error: "responses must be an array" });
    }

    try {
        const client = new InferenceClient(process.env.HUGGING_FACE_API_KEY);

        // Send all comments to HF at once
        const results = await client.textClassification({
            model: "cardiffnlp/twitter-roberta-base-sentiment-latest",
            inputs: responses,
        });

        const sentiments = results.map(result => {
            // Old HF: array of label objects
            if (Array.isArray(result)) {
                return result.reduce((max, obj) =>
                    obj.score > max.score ? obj : max
                );
            }

            // New HF: single object
            return result;
        });

        // Final cleaned output
        const finalOutput = sentiments.map((s, index) => ({
            text: responses[index],
            sentiment: s.label.toLowerCase(), // Ensure lowercase to match enum
            confidence: s.score
        }));

        // Save sentiment to database if productId or reviewIds provided
        if (productId || reviewIds) {
            let product = null;
            const sentimentCounts = { positive: 0, negative: 0, neutral: 0 };

            if (productId) {
                product = await Product.findById(productId);
                if (!product) {
                    return res.status(404).json({ error: "Product not found" });
                }
            }

            // Update reviews with sentiment data
            for (let i = 0; i < finalOutput.length; i++) {
                const sentimentData = finalOutput[i];
                let review = null;

                if (reviewIds && reviewIds[i]) {
                    // Update specific review by ID
                    review = await Review.findById(reviewIds[i]);
                } else if (productId) {
                    // Find review by comment text and product
                    review = await Review.findOne({
                        product: productId,
                        comment: sentimentData.text
                    });
                }

                if (review) {
                    review.sentiment = sentimentData.sentiment;
                    review.sentimentScore = sentimentData.confidence;
                    await review.save();

                    // Count sentiments for product update
                    if (sentimentData.sentiment === 'positive') sentimentCounts.positive++;
                    else if (sentimentData.sentiment === 'negative') sentimentCounts.negative++;
                    else sentimentCounts.neutral++;
                }
            }

            // Update product sentiment counts
            if (product) {
                // Recalculate counts from all reviews
                const allReviews = await Review.find({ product: product._id });
                product.positiveCount = allReviews.filter(r => r.sentiment === 'positive').length;
                product.negativeCount = allReviews.filter(r => r.sentiment === 'negative').length;
                product.neutralCount = allReviews.filter(r => r.sentiment === 'neutral').length;
                await product.save();
            }
        }

        return res.json({
            success: true,
            data: finalOutput,
            saved: !!(productId || reviewIds)
        });

    } catch (err) {
        console.error("Error:", err);
        res.status(500).json({ error: "Sentiment analysis failed" });
    }
};

module.exports = { sentiment };
