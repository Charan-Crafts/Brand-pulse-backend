require("dotenv").config();
const { InferenceClient } = require("@huggingface/inference");

const sentiment = async (req, res) => {
    const { responses } = req.body;

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
            sentiment: s.label,
            confidence: s.score
        }));

        return res.json({
            success: true,
            data: finalOutput
        });

    } catch (err) {
        console.error("Error:", err);
        res.status(500).json({ error: "Sentiment analysis failed" });
    }
};

module.exports = { sentiment };
