const io = require('socket.io-client');
const SERVER_URL = 'http://localhost:3001';

async function runBotTest() {
    console.log('Starting Bot verification test...');
    const client = io(SERVER_URL);

    const cleanup = () => {
        client.close();
    };

    try {
        await new Promise(resolve => client.on('connect', resolve));
        console.log('Client connected');

        let connectedRoomId = null;

        await new Promise(resolve => {
            client.once('joined-room', (data) => {
                connectedRoomId = data.roomId;
                console.log(`Joined room: ${connectedRoomId}`);
                resolve();
            });

            client.emit('join-room', {
                roomId: 'BOT001',
                playerName: 'SoloTester',
                abilityType: 'dash',
                userId: 'test-user-1'
            });
        });

        await new Promise(resolve => setTimeout(resolve, 500));

        console.log(`Requesting to add bot to ${connectedRoomId}...`);
        // Add a bot
        console.log('Adding bot...');
        client.emit('add-bot', connectedRoomId);

        // Toggle ready for our main client
        await new Promise(resolve => {
            setTimeout(() => {
                console.log('Toggling ready...');
                client.emit('toggle-ready', connectedRoomId);
                resolve();
            }, 500);
        });

        console.log('Waiting for game start...');
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout waiting for game start')), 5000);

            client.on('game-event', (event) => {
                if (event.type === 'game-started') {
                    console.log('Received game-started event!');
                    clearTimeout(timeout);
                    resolve();
                }
            });

            // Also listen for game state updates indicating active phase
            client.on('game-state-update', (state) => {
                if (state.gamePhase === 'spawn' || state.gamePhase === 'active') {
                    console.log(`Game phase is now ${state.gamePhase}`);
                    clearTimeout(timeout);
                    resolve();
                }
            });
        });

        console.log('Bot Test Passed: Game started with bot!');

    } catch (error) {
        console.error('Bot Test Failed:', error);
        process.exit(1);
    } finally {
        cleanup();
        process.exit(0);
    }
}

runBotTest();
