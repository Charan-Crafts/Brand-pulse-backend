const { ApifyClient } = require("apify-client");

const client = new ApifyClient({
    token: process.env.APIFY_API_KEY,
});

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
        const { instagramUrl, resultsLimit = 10 } = req.body;

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

        res.json(result);

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