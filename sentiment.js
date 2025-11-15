require("dotenv").config();
const { InferenceClient } = require("@huggingface/inference");

const sentiment=  async ()=> {
    try {
        const client = new InferenceClient(process.env.HUGGING_FACE_API_KEY);

        const results = await client.textClassification({
            model: "cardiffnlp/twitter-roberta-base-sentiment-latest",
            inputs: [
                "Amazing product! Exceeded my expectations.",
                "Waste of money. Very disappointed with the quality.",
            ],
        });

        const finalSentiments = results.map(item => {
            // CASE 1 → item = array of label objects (old HuggingFace format)
            if (Array.isArray(item)) {
                return item.reduce((max, obj) =>
                    obj.score > max.score ? obj : max
                );
            }

            // CASE 2 → item = single object (new format)
            return item;
        });

        console.log("Final Sentiments:", finalSentiments);

    } catch (err) {
        console.error("Error:", err);
    }
}

module.exports = { sentiment };
