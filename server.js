const express = require('express');
const path = require('path');
const app = express();
const http = require('http').createServer(app);

// Environment variables
const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://samyak-raj.github.io/video-call-app/public";

// Socket.IO setup with CORS
const io = require('socket.io')(http, {
  cors: {
    origin: ALLOWED_ORIGIN,
    methods: ["GET", "POST"]
  }
});

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('Server is running');
});

app.use(express.static(path.join(__dirname, './public')));

// Track connected users
let connectedUsers = [];

io.on('connection', socket => {
  console.log('User connected:', socket.id);
  connectedUsers.push(socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    connectedUsers = connectedUsers.filter(user => user !== socket.id)
    socket.broadcast.emit('update-user-list', { userIds: connectedUsers })
  })

  socket.on('mediaOffer', data => {
    socket.to(data.to).emit('mediaOffer', {
      from: data.from,
      offer: data.offer
    });
  });
  
  socket.on('mediaAnswer', data => {
    socket.to(data.to).emit('mediaAnswer', {
      from: data.from,
      answer: data.answer
    });
  });

  socket.on('iceCandidate', data => {
    socket.to(data.to).emit('remotePeerIceCandidate', {
      candidate: data.candidate
    })
  })

  socket.on('requestUserList', () => {
    socket.emit('update-user-list', { userIds: connectedUsers });
    socket.broadcast.emit('update-user-list', { userIds: connectedUsers });
  });
});

http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Allowing origin: ${ALLOWED_ORIGIN}`);
});

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});
