const { ApifyClient } = require("apify-client");
const { InferenceClient } = require("@huggingface/inference");
const Product = require('../models/products.model');
const Review = require('../models/review.models');

const client = new ApifyClient({
    token: process.env.APIFY_API_KEY,
});

const sentimentClient = new InferenceClient(process.env.HUGGING_FACE_API_KEY);

const scrapeInstagramComments = async (postUrl, limit = 100) => {
    try {
        const input = {
            directUrls: [postUrl],
            resultsLimit: limit
        };

        // Run the Actor and wait for it to finish
        const run = await client.actor('apify/instagram-comment-scraper').call(input);

        // Fetch the results from the dataset
        const { items } = await client.dataset(run.defaultDatasetId).listItems();

        // Extract post ID from URL
        const postId = postUrl.includes('/p/')
            ? postUrl.replace(/\/$/, '').split('/p/')[1]
            : 'unknown';

        // Structure the response
        const response = {
            postId: postId,
            postUrl: postUrl,
            totalComments: items.length,
            userComments: items.map(item => ({
                userName: item.ownerUsername || 'N/A',
                text: item.text || 'N/A',
                timeStamp: item.timestamp || 'N/A',
                likes: item.likesCount || 0
            }))
        };

        return response;

    } catch (error) {
        throw new Error(`Error scraping comments: ${error.message}`);
    }
};

const scrapeComments = async (req, res) => {
    try {
        const { instagramUrl, resultsLimit = 100, productName } = req.body;

        // Validate request
        if (!instagramUrl) {
            return res.status(400).json({
                error: 'Missing instagramUrl in request body'
            });
        }

        // Validate Instagram URL
        if (!instagramUrl.includes('/p/')) {
            return res.status(400).json({
                error: 'Invalid Instagram URL. Must be a post URL containing "/p/"'
            });
        }

        // Scrape comments
        const result = await scrapeInstagramComments(
            instagramUrl,
            resultsLimit
        );

        // Extract post ID
        const postId = result.postId;

        // Find or create Product
        let product = await Product.findOne({
            platform: 'instagram',
            platformProductId: postId
        });

        if (!product) {
            product = await Product.create({
                productName: productName || `Instagram Post ${postId}`,
                productUrl: result.postUrl,
                platform: 'instagram',
                platformProductId: postId,
                totalReviews: 0,
                lastScraped: new Date(),
                scrapeStatus: 'success'
            });
        } else {
            // Update last scraped time
            product.lastScraped = new Date();
            product.scrapeStatus = 'success';
        }

        // Get all existing comments for this product
        const existingReviews = await Review.find({ product: product._id });

        // Create a set of existing comments using composite key (text + author + timestamp)
        // to avoid saving exact duplicates
        const existingCommentKeys = new Set(
            existingReviews.map(review => {
                const text = (review.comment || '').trim().toLowerCase();
                const author = (review.authorName || '').trim().toLowerCase();
                const timestamp = review.createdAtPlatform ? new Date(review.createdAtPlatform).getTime() : 0;
                return `${text}|||${author}|||${timestamp}`;
            })
        );

        // OLD FILTER LOGIC - COMMENTED OUT
        // Filter out comments that already exist
        // const newComments = result.userComments.filter(comment => {
        //     const commentText = comment.text.trim().toLowerCase();
        //     return !existingCommentTexts.has(commentText);
        // });

        // Process all comments - only skip exact duplicates (same text + author + timestamp)
        const commentsToSave = result.userComments.filter(comment => {
            // Parse timestamp
            let timestamp = Date.now();
            if (comment.timeStamp && comment.timeStamp !== 'N/A') {
                try {
                    timestamp = new Date(comment.timeStamp).getTime();
                } catch (e) {
                    timestamp = Date.now();
                }
            }

            // Create composite key
            const text = (comment.text || '').trim().toLowerCase();
            const author = (comment.userName || '').trim().toLowerCase();
            const compositeKey = `${text}|||${author}|||${timestamp}`;

            // Only skip if exact duplicate exists
            return !existingCommentKeys.has(compositeKey);
        });

        // If no new comments to save, return early
        if (commentsToSave.length === 0) {
            return res.json({
                success: true,
                postId: result.postId,
                postUrl: result.postUrl,
                message: 'All comments already exist in database',
                newCommentsCount: 0,
                totalCommentsInPost: result.totalComments,
                totalCommentsInDB: existingReviews.length
            });
        }

        // Save all comments that aren't exact duplicates
        const newSavedReviews = [];
        for (const comment of commentsToSave) {
            const review = await Review.create({
                comment: comment.text,
                authorName: comment.userName,
                platform: 'instagram',
                likes: comment.likes || 0,
                createdAtPlatform: comment.timeStamp !== 'N/A' ? new Date(comment.timeStamp) : new Date(),
                product: product._id
            });
            newSavedReviews.push(review._id);
        }

        // Update product with all reviews (existing + new)
        const allReviewIds = [...existingReviews.map(r => r._id), ...newSavedReviews];
        product.reviews = allReviewIds;
        product.totalReviews = allReviewIds.length;
        await product.save();

        // Automatically analyze sentiment for all new comments
        let sentimentResults = null;
        try {
            const newCommentTexts = commentsToSave.map(c => c.text);

            // Analyze sentiment using Hugging Face for new comments only
            const results = await sentimentClient.textClassification({
                model: "cardiffnlp/twitter-roberta-base-sentiment-latest",
                inputs: newCommentTexts,
            });

            const sentiments = results.map(result => {
                if (Array.isArray(result)) {
                    return result.reduce((max, obj) =>
                        obj.score > max.score ? obj : max
                    );
                }
                return result;
            });

            sentimentResults = sentiments.map((s, index) => ({
                text: newCommentTexts[index],
                sentiment: s.label.toLowerCase(),
                confidence: s.score
            }));

            // Update new reviews with sentiment data
            for (let i = 0; i < newSavedReviews.length; i++) {
                const review = await Review.findById(newSavedReviews[i]);
                if (review && sentimentResults[i]) {
                    review.sentiment = sentimentResults[i].sentiment;
                    review.sentimentScore = sentimentResults[i].confidence;
                    await review.save();
                }
            }

            // Update product sentiment counts from all reviews
            const allReviews = await Review.find({ product: product._id });
            product.positiveCount = allReviews.filter(r => r.sentiment === 'positive').length;
            product.negativeCount = allReviews.filter(r => r.sentiment === 'negative').length;
            product.neutralCount = allReviews.filter(r => r.sentiment === 'neutral').length;
            await product.save();

        } catch (sentimentError) {
            console.error("Error analyzing sentiment:", sentimentError);
            // Continue even if sentiment analysis fails
        }

        res.json({
            success: true,
            postId: result.postId,
            postUrl: result.postUrl,
            saved: true,
            productId: product._id,
            message: `${commentsToSave.length} new comment(s) saved to database successfully with sentiment analysis`,
            newComments: commentsToSave.map(c => ({
                userName: c.userName,
                text: c.text,
                timeStamp: c.timeStamp,
                likes: c.likes
            })),
            newCommentsCount: commentsToSave.length,
            totalCommentsInPost: result.totalComments,
            totalCommentsInDB: allReviewIds.length,
            sentimentAnalysis: sentimentResults || []
        });

    } catch (error) {
        res.status(500).json({
            error: 'Failed to scrape Instagram comments',
            details: error.message
        });
    }
};


module.exports = {
    scrapeComments
};