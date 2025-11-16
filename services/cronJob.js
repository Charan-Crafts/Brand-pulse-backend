const cron = require('node-cron');
const Product = require('../models/products.model');
const Review = require('../models/review.models');
const { ApifyClient } = require("apify-client");
const { InferenceClient } = require("@huggingface/inference");

const client = new ApifyClient({
    token: process.env.APIFY_API_KEY,
});

const sentimentClient = new InferenceClient(process.env.HUGGING_FACE_API_KEY);

// Function to fetch latest comments for a single product
const fetchLatestCommentsForProduct = async (product) => {
    try {
        if (product.platform !== 'instagram' || !product.productUrl) {
            return { success: false, message: 'Not an Instagram product or missing URL' };
        }

        console.log(`🔄 Fetching latest comments for product: ${product.productName} (${product._id})`);

        // Scrape comments
        const input = {
            directUrls: [product.productUrl],
            resultsLimit: 100
        };

        const run = await client.actor('apify/instagram-comment-scraper').call(input);
        const { items } = await client.dataset(run.defaultDatasetId).listItems();

        console.log(`   📥 Scraped ${items.length} comment(s) from Instagram`);

        // Get the most recent comment timestamp from existing reviews
        const existingReviews = await Review.find({ product: product._id }).sort({ createdAtPlatform: -1 });
        const mostRecentTimestamp = existingReviews.length > 0 && existingReviews[0].createdAtPlatform
            ? new Date(existingReviews[0].createdAtPlatform).getTime()
            : 0;

        console.log(`   📊 Found ${existingReviews.length} existing comment(s) in database`);
        console.log(`   🕐 Most recent comment timestamp: ${mostRecentTimestamp ? new Date(mostRecentTimestamp).toISOString() : 'None'}`);

        // Map scraped comments with proper timestamp parsing
        const userComments = items.map(item => {
            let timestamp = null;
            if (item.timestamp) {
                try {
                    timestamp = new Date(item.timestamp).getTime();
                } catch (e) {
                    timestamp = Date.now(); // Fallback to current time if parsing fails
                }
            } else {
                timestamp = Date.now();
            }

            return {
                userName: item.ownerUsername || 'N/A',
                text: item.text || 'N/A',
                timeStamp: item.timestamp || new Date().toISOString(),
                timestampMs: timestamp,
                likes: item.likesCount || 0
            };
        });

        // Sort comments by timestamp (newest first)
        userComments.sort((a, b) => b.timestampMs - a.timestampMs);

        // Filter: Only keep comments that are newer than the most recent one we have
        // This ensures we only store the latest/newest messages
        const newComments = userComments.filter(comment => {
            // If timestamp is newer than most recent, it's a new comment
            if (comment.timestampMs > mostRecentTimestamp) {
                console.log(`   🆕 New comment detected: ${comment.userName} - ${comment.text.substring(0, 50)}...`);
                return true;
            }
            return false;
        });

        console.log(`   ✨ Found ${newComments.length} new comment(s) (only latest messages)`);

        if (newComments.length === 0) {
            console.log(`   ✅ No new comments found for ${product.productName}`);
            console.log(`   ℹ️ Total comments on post: ${items.length}, Total in DB: ${existingReviews.length}`);
            product.lastScraped = new Date();
            product.scrapeStatus = 'success';
            await product.save();
            return { success: true, newCommentsCount: 0, message: 'No new comments' };
        }

        console.log(`   📝 Processing ${newComments.length} new comment(s)...`);

        // Save only new comments as Reviews
        const newSavedReviews = [];
        for (const comment of newComments) {
            // Parse timestamp properly
            let commentTimestamp = new Date();
            if (comment.timeStamp && comment.timeStamp !== 'N/A') {
                try {
                    commentTimestamp = new Date(comment.timeStamp);
                    // Validate the date
                    if (isNaN(commentTimestamp.getTime())) {
                        commentTimestamp = new Date();
                    }
                } catch (e) {
                    commentTimestamp = new Date();
                }
            }

            const review = await Review.create({
                comment: comment.text,
                authorName: comment.userName,
                platform: 'instagram',
                likes: comment.likes || 0,
                createdAtPlatform: commentTimestamp,
                product: product._id
            });
            newSavedReviews.push(review._id);
            console.log(`   💾 Saved comment from ${comment.userName} at ${commentTimestamp.toISOString()}`);
        }

        // Analyze sentiment for new comments
        try {
            const newCommentTexts = newComments.map(c => c.text);
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

            // Update reviews with sentiment
            for (let i = 0; i < newSavedReviews.length; i++) {
                const review = await Review.findById(newSavedReviews[i]);
                if (review && sentiments[i]) {
                    const sentimentLabel = sentiments[i].label.toLowerCase();
                    // Map HuggingFace labels to our sentiment enum
                    // HuggingFace model returns: "positive", "negative", or "neutral"
                    let mappedSentiment = 'neutral';
                    if (sentimentLabel === 'positive' || sentimentLabel.includes('positive')) {
                        mappedSentiment = 'positive';
                    } else if (sentimentLabel === 'negative' || sentimentLabel.includes('negative')) {
                        mappedSentiment = 'negative';
                    } else {
                        mappedSentiment = 'neutral';
                    }
                    review.sentiment = mappedSentiment;
                    review.sentimentScore = sentiments[i].score;
                    await review.save();
                }
            }

            // Update product sentiment counts
            const allReviews = await Review.find({ product: product._id });
            product.positiveCount = allReviews.filter(r => r.sentiment === 'positive').length;
            product.negativeCount = allReviews.filter(r => r.sentiment === 'negative').length;
            product.neutralCount = allReviews.filter(r => r.sentiment === 'neutral').length;
        } catch (sentimentError) {
            console.error(`   ⚠️ Error analyzing sentiment for ${product.productName}:`, sentimentError.message);
        }

        // Update product with all reviews
        const allReviewIds = [...existingReviews.map(r => r._id), ...newSavedReviews];
        product.reviews = allReviewIds;
        product.totalReviews = allReviewIds.length;
        product.lastScraped = new Date();
        product.scrapeStatus = 'success';
        await product.save();

        console.log(`   ✅ Saved ${newComments.length} new comment(s) for ${product.productName}`);
        return {
            success: true,
            newCommentsCount: newComments.length,
            message: `Saved ${newComments.length} new comments`
        };

    } catch (error) {
        console.error(`   ❌ Error fetching comments for ${product.productName}:`, error.message);
        product.scrapeStatus = 'failed';
        product.lastScraped = new Date();
        await product.save();
        return { success: false, message: error.message };
    }
};

// Cron job to fetch latest comments
const startCronJob = () => {
    // Run every 5 minutes for faster updates
    // Cron pattern: '*/5 * * * *' = every 5 minutes
    // You can change this to:
    // '*/10 * * * *' = every 10 minutes
    // '*/15 * * * *' = every 15 minutes
    // '*/30 * * * *' = every 30 minutes
    cron.schedule('*/60 * * * *', async () => {
        console.log('🕐 Cron job started: Fetching latest Instagram comments...');

        try {
            // Find all Instagram products
            const instagramProducts = await Product.find({
                platform: 'instagram',
                scrapeStatus: { $ne: 'failed' } // Skip products that are in failed state
            });

            if (instagramProducts.length === 0) {
                console.log('   ℹ️ No Instagram products found to fetch comments for');
                return;
            }

            console.log(`   📦 Found ${instagramProducts.length} Instagram product(s) to check`);

            // Fetch comments for each product sequentially to avoid rate limits
            for (const product of instagramProducts) {
                await fetchLatestCommentsForProduct(product);
                // Small delay between products to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            console.log('✅ Cron job completed: Finished fetching latest comments');
        } catch (error) {
            console.error('❌ Cron job error:', error.message);
        }
    });

    console.log('✅ Cron job scheduled: Will fetch latest Instagram comments every 5 minutes');
};

module.exports = {
    startCronJob,
    fetchLatestCommentsForProduct
};

