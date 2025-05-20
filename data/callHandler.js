// data/callHandler.js
export default async function Callupdate(json, Matrix) {
    try {
        const { from, status } = json;
        console.log(`Call from ${from}: ${status}`);
        
        if (status === 'offer') {
            // Auto-reject incoming calls
            await Matrix.sendMessage(from, { text: "Sorry, I don't accept calls." });
        }
    } catch (error) {
        console.error('Error handling call update:', error);
    }
}
