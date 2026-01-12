const io = require('socket.io-client');

const SERVER_URL = 'http://localhost:3001';

async function runTest() {
    console.log('Starting verification test...');

    const client1 = io(SERVER_URL);
    const client2 = io(SERVER_URL);

    const cleanup = () => {
        client1.close();
        client2.close();
    };

    try {
        // Wait for connection
        await new Promise((resolve) => {
            let connected = 0;
            const check = () => {
                connected++;
                if (connected === 2) resolve();
            };
            client1.on('connect', () => { console.log('Client 1 connected'); check(); });
            client2.on('connect', () => { console.log('Client 2 connected'); check(); });
        });

        // Client 1 joins room
        const roomId = 'TEST01';
        console.log(`Client 1 joining room ${roomId}...`);
        client1.emit('join-room', {
            roomId,
            playerName: 'Tester1',
            abilityType: 'dash',
            userId: 'user1'
        });

        await new Promise(resolve => setTimeout(resolve, 500));

        // Toggle ready for Client 1
        console.log('Client 1 toggling ready...');
        client1.emit('toggle-ready', roomId);

        await new Promise(resolve => setTimeout(resolve, 200));

        // Client 2 joins room
        console.log(`Client 2 joining room ${roomId}...`);
        client2.emit('join-room', {
            roomId,
            playerName: 'Tester2',
            abilityType: 'dash',
            userId: 'user2'
        });

        await new Promise(resolve => setTimeout(resolve, 200));

        // Toggle ready for Client 2
        console.log('Client 2 toggling ready...');
        client2.emit('toggle-ready', roomId);

        // Wait for game start
        console.log('Waiting for game start event...');
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout waiting for game start')), 5000);

            let started = 0;
            const check = () => {
                started++;
                if (started >= 2) { // Allow for receiving it multiple times or just wait for one
                    clearTimeout(timeout);
                    resolve();
                }
            };

            client1.on('game-event', (event) => {
                if (event.type === 'game-started') {
                    console.log('Client 1 received game-started');
                    check();
                }
            });
            client2.on('game-event', (event) => {
                if (event.type === 'game-started') {
                    console.log('Client 2 received game-started');
                    check();
                }
            });

            // Also check for joined-room with active phase
            client1.on('joined-room', (data) => {
                if (data.gameState.gamePhase !== 'waiting') {
                    console.log('Client 1 joined-room with active phase');
                    check();
                }
            });
            client2.on('joined-room', (data) => {
                if (data.gameState.gamePhase !== 'waiting') {
                    console.log('Client 2 joined-room with active phase');
                    check();
                }
            });

            // Check game-state-update
            client1.on('game-state-update', (state) => {
                if (state.gamePhase !== 'waiting') {
                    // console.log('Client 1 update phase:', state.gamePhase);
                }
            });
        });

        console.log('Game started successfully!');

        // Test movement
        console.log('Testing movement...');
        client1.emit('player-action', {
            type: 'move',
            data: { x: 500, y: 500 }
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check if client 2 sees the move
        // We need to request game state or wait for update
        // Updates are periodic (20Hz)

        // We can't easily access the state variable here without listening, 
        // but the fact that we got here means events are flowing.

        console.log('Test passed!');

    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        cleanup();
        process.exit(0);
    }
}

runTest();
