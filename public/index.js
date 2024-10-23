const peer = new RTCPeerConnection({
  iceServers: [
    {
      urls: "stun:stun.stunprotocol.org"
    }
  ]
});

// Connecting to socket
const socket = io('https://video-call-app-ciwe.onrender.com');

// Track current stream and camera mode
let currentStream;
let facingMode = 'user'; // 'user' for front camera, 'environment' for back camera
let selectedUser;

const onSocketConnected = async () => {
  const constraints = {
    audio: true,
    video: { facingMode: facingMode }
  };
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;
    const localVideo = document.querySelector('#localVideo');
    localVideo.srcObject = stream;
    
    // Set initial mirroring based on starting camera mode
    if (facingMode === 'user') {
      localVideo.style.transform = 'scaleX(-1)';
    } else {
      localVideo.style.transform = 'scaleX(1)';
    }
    
    stream.getTracks().forEach(track => peer.addTrack(track, stream));
  } catch (error) {
    console.error('Error accessing media devices:', error);
  }
};

let callButton = document.querySelector('#call');

// Handle call button
callButton.addEventListener('click', async () => {
  const localPeerOffer = await peer.createOffer();
  await peer.setLocalDescription(new RTCSessionDescription(localPeerOffer));
  
  sendMediaOffer(localPeerOffer);
});

// Flip camera functionality
const flipCamera = async () => {
  try {
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
    }

    // Toggle facingMode
    facingMode = facingMode === 'user' ? 'environment' : 'user';

    // Update video mirroring based on camera mode
    const localVideo = document.querySelector('#localVideo');
    if (facingMode === 'user') {
      localVideo.style.transform = 'scaleX(-1)';
    } else {
      localVideo.style.transform = 'scaleX(1)';
    }

    const constraints = {
      audio: true,
      video: { facingMode: facingMode }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;
    
    localVideo.srcObject = stream;

    // Remove old tracks from peer connection
    const senders = peer.getSenders();
    senders.forEach(sender => {
      if (sender.track.kind === 'video') {
        peer.removeTrack(sender);
      }
    });

    // Add new track to peer connection
    const videoTrack = stream.getVideoTracks()[0];
    peer.addTrack(videoTrack, stream);

    // Renegotiate the connection if we're in a call
    if (selectedUser) {
      const localPeerOffer = await peer.createOffer();
      await peer.setLocalDescription(new RTCSessionDescription(localPeerOffer));
      
      socket.emit('mediaOffer', {
        offer: localPeerOffer,
        from: socket.id,
        to: selectedUser
      });
    }

  } catch (error) {
    console.error('Error switching camera:', error);
    facingMode = facingMode === 'user' ? 'environment' : 'user';
  }
};

// Create media offer
socket.on('mediaOffer', async (data) => {
  await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
  const peerAnswer = await peer.createAnswer();
  await peer.setLocalDescription(new RTCSessionDescription(peerAnswer));

  sendMediaAnswer(peerAnswer, data);
});

// Create media answer
socket.on('mediaAnswer', async (data) => {
  await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
});

// ICE layer
peer.onicecandidate = (event) => {
  sendIceCandidate(event);
}

socket.on('remotePeerIceCandidate', async (data) => {
  try {
    const candidate = new RTCIceCandidate(data.candidate);
    await peer.addIceCandidate(candidate);
  } catch (error) {
    // Handle error, this will be rejected very often
  }
})

peer.addEventListener('track', (event) => {
  const [stream] = event.streams;
  document.querySelector('#remoteVideo').srcObject = stream;
})



const sendMediaAnswer = (peerAnswer, data) => {
  socket.emit('mediaAnswer', {
    answer: peerAnswer,
    from: socket.id,
    to: data.from
  })
}

const sendMediaOffer = (localPeerOffer) => {
  socket.emit('mediaOffer', {
    offer: localPeerOffer,
    from: socket.id,
    to: selectedUser
  });
};

const sendIceCandidate = (event) => {
  socket.emit('iceCandidate', {
    to: selectedUser,
    candidate: event.candidate,
  });
}

const onUpdateUserList = ({ userIds }) => {
  const usersList = document.querySelector('#usersList');
  const usersToDisplay = userIds.filter(id => id !== socket.id);

  usersList.innerHTML = '';
  
  usersToDisplay.forEach(user => {
    const userItem = document.createElement('div');
    userItem.innerHTML = user;
    userItem.className = 'user-item';
    userItem.addEventListener('click', () => {
      const userElements = document.querySelectorAll('.user-item');
      userElements.forEach((element) => {
        element.classList.remove('user-item--touched');
      })
      userItem.classList.add('user-item--touched');
      selectedUser = user;
    });
    usersList.appendChild(userItem);
  });
};

socket.on('update-user-list', onUpdateUserList);

// Initialize flip camera button
document.addEventListener('DOMContentLoaded', () => {
  const flipBtn = document.querySelector('#flip-camera-btn');
  
  // Only show flip button if device has multiple cameras
  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    navigator.mediaDevices.enumerateDevices()
      .then(devices => {
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        if (videoDevices.length <= 1) {
          flipBtn.style.display = 'none';
        }
      })
      .catch(err => {
        console.error('Error enumerating devices:', err);
      });
  }

  flipBtn.addEventListener('click', flipCamera);
});

const handleSocketConnected = async () => {
  onSocketConnected();
  socket.emit('requestUserList');
};

socket.on('connect', handleSocketConnected);
