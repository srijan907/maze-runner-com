// data/messageHandler.js
export default async function Handler(chatUpdate, Matrix, logger) {
    try {
        const message = chatUpdate.messages[0];
        if (!message) return;

        // Your message handling logic here
        console.log('Received message:', message);
    } catch (error) {
        logger.error('Error handling message:', error);
    }
}
