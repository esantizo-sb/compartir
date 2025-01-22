let peer = null;
let currentStream = null;
let connections = new Map();

// Inicializar vista del profesor
function initializeTeacher() {
  document.getElementById('roleSelector').classList.add('hidden');
  document.getElementById('teacherView').classList.remove('hidden');
  
  // Crear ID aleatorio para la sala
  const roomId = Math.random().toString(36).substring(2, 8);
  document.getElementById('roomId').textContent = roomId;
  
  // Inicializar PeerJS con el roomId específico
  peer = new Peer(roomId);
  
  peer.on('open', (id) => {
    console.log('Mi ID de peer es:', id);
    showSuccessMessage('Sala creada exitosamente');
  });

  peer.on('error', (error) => {
    console.error('Error en PeerJS:', error);
    showErrorMessage('Error en la conexión. Por favor recarga la página.');
  });
  
  // Manejar conexiones entrantes
  peer.on('connection', handleNewConnection);
  
  // Configurar botones de compartir pantalla
  document.getElementById('startSharing').addEventListener('click', startSharing);
  document.getElementById('stopSharing').addEventListener('click', stopSharing);
  
  initializeVideoControls('teacher');
  initializeChat('teacher');
}

// Inicializar vista del estudiante
function initializeStudent() {
  document.getElementById('roleSelector').classList.add('hidden');
  document.getElementById('studentView').classList.remove('hidden');
  
  // Solo inicializamos los controles de video para el estudiante
  // (resolución y pantalla completa)
  initializeVideoControls('student');
  initializeChat('student');
}

// Función para que el estudiante se una a una sala
function joinRoom() {
  const roomId = document.getElementById('roomInput').value.trim();
  const studentName = document.getElementById('studentNameInput').value.trim();
  
  if (!roomId || !studentName) {
    showErrorMessage('Por favor ingresa el ID de sala y tu nombre');
    return;
  }
  
  if (peer) {
    peer.destroy();
  }
  
  peer = new Peer();
  
  peer.on('error', (error) => {
    console.error('Error en PeerJS:', error);
    if (error.type === 'peer-unavailable') {
      showErrorMessage('No se encontró la sala especificada');
    } else {
      showErrorMessage('Error de conexión. Por favor intenta de nuevo.');
    }
  });

  peer.on('open', (id) => {
    const conn = peer.connect(roomId, {
      metadata: { name: studentName }
    });
    
    conn.on('open', () => {
      console.log('Conectado al profesor');
      document.getElementById('joinForm').classList.add('hidden');
      showSuccessMessage('Conectado exitosamente a la sala');
      
      // Guardar la conexión para uso posterior
      window.teacherConnection = conn;
    });

    conn.on('error', (error) => {
      console.error('Error en la conexión:', error);
      showErrorMessage('Error al conectar con el profesor');
    });

    conn.on('data', (data) => {
      if (data.type === 'chat') {
        const sender = data.isPrivate ? 'Profesor (Privado)' : 'Profesor';
        addMessageToChat(sender, data.message);
      }
    });

    // Recibir stream del profesor
    peer.on('call', (call) => {
      call.answer();
      call.on('stream', (remoteStream) => {
        const remoteVideo = document.getElementById('remoteVideo');
        remoteVideo.srcObject = remoteStream;
        showSuccessMessage('Recibiendo transmisión del profesor');
      });
    });
  });
}

function handleNewConnection(conn) {
  const studentName = conn.metadata.name;
  connections.set(conn.peer, {
    connection: conn,
    name: studentName
  });
  updateStudentList();
  
  conn.on('close', () => {
    connections.delete(conn.peer);
    updateStudentList();
    console.log('Estudiante desconectado');
  });

  conn.on('data', (data) => {
    if (data.type === 'chat') {
      const messagePrefix = data.isPrivate ? `${studentName} (Privado)` : studentName;
      addMessageToChat(messagePrefix, data.message);
    }
  });
  
  showSuccessMessage(`Nuevo estudiante conectado: ${studentName}`);
}

// Iniciar compartir pantalla
async function startSharing() {
  try {
    currentStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 }
      },
      audio: true
    });
    
    document.getElementById('localVideo').srcObject = currentStream;
    document.getElementById('startSharing').classList.add('hidden');
    document.getElementById('stopSharing').classList.remove('hidden');
    
    // Enviar stream a todos los estudiantes conectados
    connections.forEach((data) => {
      peer.call(data.connection.peer, currentStream);
    });
    
    currentStream.getVideoTracks()[0].onended = () => {
      stopSharing();
    };
    
    showSuccessMessage('Compartiendo pantalla exitosamente');
  } catch (err) {
    console.error('Error al compartir pantalla:', err);
    showErrorMessage('Error al compartir pantalla. Por favor intenta de nuevo.');
  }
}

// Detener compartir pantalla
function stopSharing() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    document.getElementById('localVideo').srcObject = null;
    currentStream = null;
  }
  
  document.getElementById('startSharing').classList.remove('hidden');
  document.getElementById('stopSharing').classList.add('hidden');
  showSuccessMessage('Se detuvo la compartición de pantalla');
}

function updateStudentList() {
  const studentList = document.getElementById('studentList');
  studentList.innerHTML = '';
  
  connections.forEach((data, peerId) => {
    const li = document.createElement('li');
    li.className = 'student-item';
    li.innerHTML = `
      <span>${data.name}</span>
      <button onclick="sendPrivateMessage('${peerId}')">Mensaje Privado</button>
    `;
    studentList.appendChild(li);
  });
  
  document.getElementById('studentCount').textContent = connections.size;
}

function sendPrivateMessage(peerId) {
  const recipient = connections.get(peerId);
  if (!recipient) return;
  
  const message = prompt(`Enviar mensaje privado a ${recipient.name}:`);
  if (!message) return;
  
  recipient.connection.send({
    type: 'chat',
    message: message,
    isPrivate: true
  });
  
  addMessageToChat(`Mensaje privado para ${recipient.name}`, message);
}

// Mostrar mensajes de éxito
function showSuccessMessage(message) {
  const messageElement = document.getElementById('statusMessage');
  messageElement.textContent = message;
  messageElement.className = 'status-message success';
  setTimeout(() => {
    messageElement.textContent = '';
    messageElement.className = 'status-message';
  }, 3000);
}

// Mostrar mensajes de error
function showErrorMessage(message) {
  const messageElement = document.getElementById('statusMessage');
  messageElement.textContent = message;
  messageElement.className = 'status-message error';
  setTimeout(() => {
    messageElement.textContent = '';
    messageElement.className = 'status-message';
  }, 3000);
}

// Agregar controles de video
function initializeVideoControls(role = 'teacher') {
  // Controles de resolución
  const container = role === 'teacher' ? '#teacherView' : '#studentView';
  const resolutionButtons = document.querySelectorAll(`${container} .resolution-btn`);
  resolutionButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      const scale = parseFloat(e.target.dataset.scale);
      const videoContainer = e.target.closest('.teacher-view, .student-view');
      const video = videoContainer.querySelector('video');
      
      // Actualizar escala del video
      video.style.transform = `scale(${scale})`;
      
      // Actualizar estado activo de los botones
      videoContainer.querySelectorAll('.resolution-btn').forEach(btn => {
        btn.classList.remove('active');
      });
      e.target.classList.add('active');
    });
  });

  // Controles de pantalla completa
  const fullscreenButton = document.getElementById(
    role === 'teacher' ? 'teacherFullscreen' : 'studentFullscreen'
  );

  if (fullscreenButton) {
    fullscreenButton.addEventListener('click', () => {
      const videoContainer = document.querySelector(`${container} .video-container`);
      toggleFullscreen(videoContainer);
    });
  }
}

function toggleFullscreen(videoContainer) {
  if (!document.fullscreenElement) {
    videoContainer.requestFullscreen().catch(err => {
      console.error('Error al intentar pantalla completa:', err);
    });
  } else {
    document.exitFullscreen();
  }
}

// Manejar cambios en el estado de pantalla completa
document.addEventListener('fullscreenchange', () => {
  const containers = document.querySelectorAll('.video-container');
  containers.forEach(container => {
    if (document.fullscreenElement === container) {
      container.classList.add('fullscreen');
    } else {
      container.classList.remove('fullscreen');
    }
  });
});

// Funciones para el chat
function initializeChat(role) {
  const chatInput = document.getElementById('chatInput');
  const sendButton = document.getElementById('sendButton');
  
  sendButton.addEventListener('click', sendChatMessage);
  
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
  
  if (role === 'teacher') {
    const privateMessageSelect = document.getElementById('privateMessageSelect');
    connections.forEach((data) => {
      const option = document.createElement('option');
      option.value = data.connection.peer;
      option.textContent = data.name;
      privateMessageSelect.appendChild(option);
    });
  }
}

function sendChatMessage() {
  const chatInput = document.getElementById('chatInput');
  const message = chatInput.value.trim();
  const isTeacher = document.getElementById('teacherView').classList.contains('hidden') === false;
  
  if (!message) return;
  
  if (isTeacher) {
    const privateMessageSelect = document.getElementById('privateMessageSelect');
    const selectedPeerId = privateMessageSelect.value;
    const isPrivate = selectedPeerId !== '';
    
    if (!isPrivate) {
      // Enviar a todos los estudiantes
      connections.forEach((data) => {
        data.connection.send({
          type: 'chat',
          message: message,
          isPrivate: false
        });
      });
      addMessageToChat('Profesor (Todos)', message);
    } else {
      const recipient = connections.get(selectedPeerId);
      if (recipient) {
        recipient.connection.send({
          type: 'chat',
          message: message,
          isPrivate: true
        });
        addMessageToChat(`Profesor → ${recipient.name} (Privado)`, message);
      }
    }
  } else {
    // Estudiante envía al profesor
    if (window.teacherConnection) {
      window.teacherConnection.send({
        type: 'chat',
        message: message
      });
      addMessageToChat('Tú', message);
    }
  }
  
  chatInput.value = '';
}

function addMessageToChat(sender, message) {
  const chatMessages = document.getElementById('chatMessages');
  const messageElement = document.createElement('div');
  messageElement.className = 'chat-message';
  
  const timestamp = new Date().toLocaleTimeString();
  messageElement.innerHTML = `
    <span class="message-sender">${sender}</span>
    <span class="message-time">${timestamp}</span>
    <div class="message-content">${message}</div>
  `;
  
  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}