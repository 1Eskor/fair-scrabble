import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithCustomToken,
  signInAnonymously,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  collection
} from 'firebase/firestore';

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyBm8sYdEMIP9xr2jFxlek_3SJeGaRz-L5U",
  authDomain: "fair-scrabble.firebaseapp.com",
  projectId: "fair-scrabble",
  storageBucket: "fair-scrabble.firebasestorage.app",
  messagingSenderId: "1009249669396",
  appId: "1:1009249669396:web:335c0cae30b7ec79da7201",
  measurementId: "G-WFNEFFJBKQ"
};


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'scrabble-even-dist';

// --- TILE VALUES REFERENCE ---
const TILE_SCORES = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
  _: 0
};

// --- HELPER FOR SHUFFLING ---
const shuffleArray = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// --- EVEN TILE DISTRIBUTION ALGORITHM ---
const generateEvenDecks = (gridSize, numPlayers = 2, evenDistributionMode = false) => {
  const size = Number(gridSize);
  let playerSpecials = []; 
  let playerBlanksCount = 0;
  let playerSCount = 0;
  let standardLettersPool = {};

  if (size === 15) {
    // 100 tiles total
    playerSpecials = ['Z', 'Q', 'X', 'J'];
    playerBlanksCount = 2;
    playerSCount = 4;
    standardLettersPool = {
      A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, K: 1, L: 4, M: 2,
      N: 6, O: 8, P: 2, R: 6, T: 6, U: 4, V: 2, W: 2, Y: 2
    };
  } else if (size === 17) {
    // 146 tiles total (20 specials/blanks/S + 126 standards)
    playerSpecials = ['Z', 'Q', 'X', 'J', 'Z', 'Q', 'X', 'J'];
    playerBlanksCount = 4; 
    playerSCount = 8; 
    standardLettersPool = {
      A: 12, B: 3, C: 3, D: 5, E: 15, F: 3, G: 4, H: 3, I: 12, K: 2, L: 5, M: 3,
      N: 8, O: 11, P: 3, R: 8, T: 8, U: 6, V: 3, W: 3, Y: 3
    };
  } else {
    // 19x19 Grid: 180 tiles total (34 specials/blanks/S + 146 standards)
    playerSpecials = [
      'Z', 'Q', 'X', 'J', 'Z', 'Q', 'X', 'J',
      'Z', 'Q', 'X', 'J', 'Z', 'Q', 'X', 'J'
    ];
    playerBlanksCount = 6; 
    playerSCount = 12; 
    standardLettersPool = {
      A: 14, B: 4, C: 4, D: 6, E: 17, F: 4, G: 5, H: 4, I: 14, K: 2, L: 6, M: 4,
      N: 9, O: 12, P: 4, R: 9, T: 9, U: 7, V: 4, W: 4, Y: 4
    };
  }

  if (numPlayers === 3) {
    playerBlanksCount = 3; // 1 blank per player
    playerSCount = 3; // 1 S per player
    const pool = ['Q', 'Z', 'J', 'X'];
    // Give exactly 6 random specials total (2 per player)
    playerSpecials = [
      ...pool,
      pool[Math.floor(Math.random() * pool.length)],
      pool[Math.floor(Math.random() * pool.length)]
    ];
  }

  const shuffledSpecials = shuffleArray(playerSpecials);

  const decks = Array.from({ length: numPlayers }, () => []);

  const dealToDecks = (items, makeItem) => {
    items.forEach((item, index) => {
      decks[index % numPlayers].push(makeItem(item));
    });
  };

  const getTileScore = (letter) => {
    if (numPlayers === 3) {
      if (letter === 'Q' || letter === 'Z') return 9;
      if (letter === 'J' || letter === 'X') return 7;
    }
    return TILE_SCORES[letter] || 0;
  };

  dealToDecks(shuffledSpecials, letter => ({ id: Math.random().toString(), letter, score: getTileScore(letter) }));
  
  const blanks = Array.from({ length: playerBlanksCount }, () => '_');
  dealToDecks(blanks, letter => ({ id: Math.random().toString(), letter, score: 0 }));

  const esses = Array.from({ length: playerSCount }, () => 'S');
  dealToDecks(esses, letter => ({ id: Math.random().toString(), letter, score: 1 }));

  if (evenDistributionMode) {
    let remainderPool = [];
    Object.entries(standardLettersPool).forEach(([letter, qty]) => {
      const perPlayer = Math.floor(qty / numPlayers);
      const remainder = qty % numPlayers;
      
      for (let i = 0; i < perPlayer * numPlayers; i++) {
        decks[i % numPlayers].push({ id: Math.random().toString(), letter, score: getTileScore(letter) });
      }
      for (let i = 0; i < remainder; i++) {
        remainderPool.push(letter);
      }
    });
    remainderPool = shuffleArray(remainderPool);
    dealToDecks(remainderPool, letter => ({ id: Math.random().toString(), letter, score: getTileScore(letter) }));
  } else {
    let standards = [];
    Object.entries(standardLettersPool).forEach(([letter, qty]) => {
      for (let i = 0; i < qty; i++) {
        standards.push(letter);
      }
    });
    standards = shuffleArray(standards);
    dealToDecks(standards, letter => ({ id: Math.random().toString(), letter, score: getTileScore(letter) }));
  }

  const resultDecks = {};
  decks.forEach((deck, idx) => {
    resultDecks[`deck${idx + 1}`] = shuffleArray(deck);
  });
  return resultDecks;
};

// --- SYMMETRICAL BOARD BONUS CONFIGURATION ---
const getBonus = (r, c, size) => {
  const h = Math.floor(size / 2);
  if (r === h && c === h) return 'star'; // Center Star

  const dx = Math.abs(r - h);
  const dy = Math.abs(c - h);

  // Standardize to octant symmetry where x <= y
  const x = Math.min(dx, dy);
  const y = Math.max(dx, dy);

  if (size === 15) {
    // TW
    if (x === 0 && y === 7) return 'TW';
    if (x === 7 && y === 7) return 'TW';
    // DW
    if (x === y && x >= 3 && x <= 6) return 'DW';
    // TL
    if ((x === 1 && y === 5) || (x === 5 && y === 5)) return 'TL';
    // DL
    if (x === 0 && y === 3) return 'DL';
    if (x === 2 && y === 6) return 'DL';
    if (x === 3 && y === 7) return 'DL';
    if (x === 6 && y === 6) return 'DL';
    return null;
  } else if (size === 17) {
    // TW
    if (x === 0 && y === 8) return 'TW';
    if (x === 8 && y === 8) return 'TW';
    // DW
    if (x === y && x >= 3 && x <= 7) return 'DW';
    if (x === 0 && y === 4) return 'DW';
    // TL
    if ((x === 2 && y === 6) || (x === 6 && y === 6) || (x === 2 && y === 8)) return 'TL';
    // DL
    if (x === 0 && y === 2) return 'DL';
    if (x === 3 && y === 8) return 'DL';
    if (x === 4 && y === 6) return 'DL';
    if (x === 7 && y === 7) return 'DL';
    return null;
  } else {
    // 19x19 Grid
    // TW
    if (x === 0 && y === 9) return 'TW';
    if (x === 9 && y === 9) return 'TW';
    // DW
    if (x === y && x >= 4 && x <= 8) return 'DW';
    if (x === 0 && y === 5) return 'DW';
    // TL
    if ((x === 2 && y === 7) || (x === 7 && y === 7) || (x === 2 && y === 9)) return 'TL';
    // DL
    if (x === 0 && y === 3) return 'DL';
    if (x === 4 && y === 9) return 'DL';
    if (x === 5 && y === 7) return 'DL';
    if (x === 8 && y === 8) return 'DL';
    return null;
  }
};

export default function App() {
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState(() => localStorage.getItem('active_room_id') || '');
  const [roomData, setRoomData] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Theme State ('dark' | 'light')
  const [theme, setTheme] = useState(() => localStorage.getItem('scrabble_theme') || 'dark');

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('scrabble_theme', nextTheme);
  };

  // Colours Toggle State (defaults to true)
  const [coloursEnabled, setColoursEnabled] = useState(() => {
    const stored = localStorage.getItem('scrabble_colours');
    return stored === null ? true : stored === 'true';
  });

  // Lobby Pre-select State
  const [selectedGridSize, setSelectedGridSize] = useState(15);
  const [diagonalAllowed, setDiagonalAllowed] = useState(false);
  const [backwardsAllowed, setBackwardsAllowed] = useState(false);
  const [diagonalBackwardsAllowed, setDiagonalBackwardsAllowed] = useState(false);
  const [validationMode, setValidationMode] = useState('manual');
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timerDuration, setTimerDuration] = useState(90);
  const [threePlayerMode, setThreePlayerMode] = useState(false);
  const [evenDistributionMode, setEvenDistributionMode] = useState(false);
  const [joinInput, setJoinInput] = useState('');
  const [handicapEnabled, setHandicapEnabled] = useState(false);
  const [handicapP1, setHandicapP1] = useState(0);
  const [handicapP2, setHandicapP2] = useState(0);
  const [handicapP3, setHandicapP3] = useState(0);

  // Local Game State
  const [selectedRackTile, setSelectedRackTile] = useState(null);
  const [tentativePlaced, setTentativePlaced] = useState({}); // "r,c" -> { id, letter, score, isBlank }
  const [boardZoom, setBoardZoom] = useState(1);
  const [chatInput, setChatInput] = useState('');
  const [blankModalOpen, setBlankModalOpen] = useState(false);
  const [pendingBlankCoords, setPendingBlankCoords] = useState(null);
  const [exchangeMode, setExchangeMode] = useState(false);
  const [selectedExchangeIds, setSelectedExchangeIds] = useState([]);

  // Custom Dictionary Tool state
  const [dictWord, setDictWord] = useState('');
  const [dictResult, setDictResult] = useState(null);
  const [dictChecking, setDictChecking] = useState(false);

  const chatContainerRef = useRef(null);
  const prevChatLengthRef = useRef(0);

  // SOWPODS Dictionary Loading
  const [dictLoaded, setDictLoaded] = useState(false);

  useEffect(() => {
    const loadDict = async () => {
      try {
        const res = await fetch('/sowpods.txt');
        if (res.ok) {
          const text = await res.text();
          const words = text.split(/\r?\n/).map(w => w.trim().toUpperCase()).filter(w => w.length > 0);
          window.SOWPODS_DICT = new Set(words);
          setDictLoaded(true);
        }
      } catch (err) {
        console.error("Failed to load dictionary:", err);
      }
    };
    loadDict();
  }, []);

  // --- SIGN IN AND RUN AUTH (RULE 3) ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth init failure:", err);
        setError("Authentication failure. Please reload.");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (loadedUser) => {
      setUser(loadedUser);
      // Auto assign username if not set
      if (loadedUser) {
        const storedName = localStorage.getItem('scrabble_nickname');
        if (storedName) setUsername(storedName);
        else {
          const randName = `Player_${loadedUser.uid.substring(0, 5)}`;
          setUsername(randName);
          localStorage.setItem('scrabble_nickname', randName);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // --- REAL-TIME FIRESTORE LISTENER (RULE 1 & 3) ---
  useEffect(() => {
    if (!user || !roomId) return;
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.players && data.players[user.uid]) {
          setRoomData(data);
          setError('');
        } else {
          localStorage.removeItem('active_room_id');
          setRoomId('');
          setRoomData(null);
        }
      } else {
        setError("Room has been disbanded or does not exist.");
        localStorage.removeItem('active_room_id');
        setRoomId('');
        setRoomData(null);
      }
    }, (err) => {
      console.error("Snapshot error:", err);
      setError("Synchronizing error: " + err.message);
    });
    return () => unsubscribe();
  }, [user, roomId]);

  // Scroll chat to bottom only when a new message is actually added
  useEffect(() => {
    const currentLength = roomData?.chat?.length || 0;
    if (currentLength > prevChatLengthRef.current) {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    }
    prevChatLengthRef.current = currentLength;
  }, [roomData?.chat?.length]);

  // Save nickname
  const saveNickname = (name) => {
    const cleanName = name.trim().substring(0, 15) || 'Anonymous';
    setUsername(cleanName);
    localStorage.setItem('scrabble_nickname', cleanName);

    // If in room, update nickname in Firestore
    if (roomData && roomId) {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
      const updatedPlayers = { ...roomData.players };
      if (updatedPlayers[user.uid]) {
        updatedPlayers[user.uid].name = cleanName;
        updateDoc(roomRef, { players: updatedPlayers });
      }
    }
  };

  // --- GAME LOBBY OPERATIONS ---
  const handleCreateRoom = async (gridSize, config) => {
    if (!user) return;
    setError('');
    const newRoomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    
    const maxPlayers = config.threePlayerMode ? 3 : 2;
    const decks = generateEvenDecks(gridSize, maxPlayers, config.evenDistributionMode);

    const rackSize = gridSize === 15 ? 7 : (gridSize === 17 ? 8 : 9);

    const initialRoom = {
      roomId: newRoomId,
      gridSize,
      rackSize,
      maxPlayers,
      evenDistributionMode: !!config.evenDistributionMode,
      diagonalAllowed: config.diagonalAllowed,
      backwardsAllowed: config.backwardsAllowed,
      diagonalBackwardsAllowed: config.diagonalBackwardsAllowed,
      validationMode: config.validationMode, // 'strict' or 'manual'
      timerEnabled: config.timerEnabled,
      timerDuration: config.timerDuration,
      turnStartTime: Date.now(),
      status: 'waiting',
      handicapEnabled: !!config.handicapEnabled,
      handicaps: config.handicapEnabled ? config.handicaps : [0, 0, 0],
      players: {
        [user.uid]: {
          uid: user.uid,
          name: username,
          score: config.handicapEnabled ? (config.handicaps?.[0] || 0) : 0,
          deck: decks.deck1,
          rack: [],
          isReady: false,
          lastActive: Date.now()
        }
      },
      playerOrder: [user.uid],
      activePlayerId: user.uid,
      board: {}, // "r,c" -> { letter, score, isBlank, placedBy, turnIndex }
      history: [
        {
          id: Math.random().toString(),
          timestamp: Date.now(),
          type: 'system',
          message: `${username} created the room with ${gridSize}x${gridSize} grid.`
        }
      ],
      chat: [],
      turnIndex: 0,
      consecutiveZeroTurns: 0,
      createdAt: Date.now()
    };

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', newRoomId), initialRoom);
      localStorage.setItem('active_room_id', newRoomId);
      setRoomId(newRoomId);
      showTemporarySuccess("Room created successfully!");
    } catch (err) {
      setError("Failed to create room: " + err.message);
    }
  };

  const handleJoinRoom = async (targetId) => {
    if (!user || !targetId) return;
    const cleanId = targetId.trim().toUpperCase();
    setError('');

    try {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', cleanId);
      const snap = await getDoc(roomRef);
      if (!snap.exists()) {
        setError("Room ID not found.");
        return;
      }

      const data = snap.data();
      if (data.status !== 'waiting' && !data.players[user.uid]) {
        setError("This game is already in progress or full.");
        return;
      }

      const updatedPlayers = { ...data.players };
      const updatedOrder = [...data.playerOrder];
      const maxPlayers = data.maxPlayers || 2;

      if (!updatedPlayers[user.uid]) {
        const currentCount = Object.keys(updatedPlayers).length;
        if (currentCount >= maxPlayers) {
          setError("Room is full.");
          return;
        }

        // Get the appropriate deck
        const decks = generateEvenDecks(data.gridSize, maxPlayers, data.evenDistributionMode);
        const myDeckKey = `deck${currentCount + 1}`;
        const myDeck = decks[myDeckKey];

        const initialScore = (data.handicapEnabled && data.handicaps) ? (data.handicaps[currentCount] || 0) : 0;

        updatedPlayers[user.uid] = {
          uid: user.uid,
          name: username,
          score: initialScore,
          deck: myDeck,
          rack: [],
          isReady: true,
          lastActive: Date.now()
        };
        updatedOrder.push(user.uid);
      }

      const finalPlayers = { ...updatedPlayers };
      const currentCount = Object.keys(finalPlayers).length;

      // If room is not full yet, just join and wait
      if (currentCount < maxPlayers) {
        await updateDoc(roomRef, {
          players: finalPlayers,
          playerOrder: updatedOrder,
          history: [
            ...data.history,
            {
              id: Math.random().toString(),
              timestamp: Date.now(),
              type: 'system',
              message: `${username} joined the room.`
            }
          ]
        });
        localStorage.setItem('active_room_id', cleanId);
        setRoomId(cleanId);
        showTemporarySuccess("Joined room. Waiting for players...");
        return;
      }

      // Automatically start the game since we have all players connected now
      const rackSize = data.rackSize;

      // Draw initial racks for all players
      updatedOrder.forEach(uid => {
        const p = finalPlayers[uid];
        if (p.rack.length === 0) {
          const freshDeck = [...p.deck];
          const newRack = [];
          for (let i = 0; i < rackSize; i++) {
            if (freshDeck.length > 0) {
              newRack.push(freshDeck.shift());
            }
          }
          p.deck = freshDeck;
          p.rack = newRack;
        }
      });

      await updateDoc(roomRef, {
        players: finalPlayers,
        playerOrder: updatedOrder,
        status: 'playing',
        turnStartTime: Date.now(),
        history: [
          ...data.history,
          {
            id: Math.random().toString(),
            timestamp: Date.now(),
            type: 'system',
            message: `${username} joined. Tiles distributed evenly! Game started.`
          }
        ]
      });

      localStorage.setItem('active_room_id', cleanId);
      setRoomId(cleanId);
    } catch (err) {
      setError("Failed to join room: " + err.message);
    }
  };

  const handleLeaveRoom = async () => {
    if (!user || !roomData) return;
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);

    try {
      const updatedPlayers = { ...roomData.players };
      delete updatedPlayers[user.uid];
      const updatedOrder = roomData.playerOrder.filter(id => id !== user.uid);

      if (updatedOrder.length === 0) {
        // Delete room or leave empty
        await updateDoc(roomRef, { status: 'disbanded' });
      } else {
        await updateDoc(roomRef, {
          players: updatedPlayers,
          playerOrder: updatedOrder,
          status: 'waiting',
          history: [
            ...roomData.history,
            {
              id: Math.random().toString(),
              timestamp: Date.now(),
              type: 'system',
              message: `${username} left the game.`
            }
          ]
        });
      }
      localStorage.removeItem('active_room_id');
      setRoomId('');
      setRoomData(null);
      setTentativePlaced({});
      setSelectedRackTile(null);
    } catch (err) {
      setError("Leaving room failed: " + err.message);
    }
  };

  // --- SEND CHAT MESSAGE ---
  const sendChatMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !roomData || !roomId) return;

    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    const newMsg = {
      id: Math.random().toString(),
      senderId: user.uid,
      senderName: username,
      text: chatInput.trim().substring(0, 150),
      timestamp: Date.now()
    };

    try {
      await updateDoc(roomRef, {
        chat: [...(roomData.chat || []), newMsg]
      });
      setChatInput('');
    } catch (err) {
      setError("Chat delivery failed: " + err.message);
    }
  };

  // --- TILE PLACEMENT ACTIONS ---
  const selectRackTile = async (tileIndex) => {
    if (exchangeMode) {
      const tile = roomData.players[user.uid].rack[tileIndex];
      if (selectedExchangeIds.includes(tile.id)) {
        setSelectedExchangeIds(selectedExchangeIds.filter(id => id !== tile.id));
      } else {
        setSelectedExchangeIds([...selectedExchangeIds, tile.id]);
      }
    } else {
      if (selectedRackTile === null) {
        setSelectedRackTile(tileIndex);
      } else if (selectedRackTile === tileIndex) {
        // Deselect if clicked again
        setSelectedRackTile(null);
      } else {
        // Swap tiles!
        const myPlayer = roomData?.players?.[user.uid];
        if (!myPlayer) return;
        const newRack = [...myPlayer.rack];
        
        const temp = newRack[selectedRackTile];
        newRack[selectedRackTile] = newRack[tileIndex];
        newRack[tileIndex] = temp;
        
        setSelectedRackTile(null);

        // Save new rack order to Firestore
        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
        try {
          await updateDoc(roomRef, {
            [`players.${user.uid}.rack`]: newRack
          });
        } catch (e) {
          console.error("Failed to update rearranged rack order:", e);
        }
      }
    }
  };

  const placeTileOnBoard = (r, c) => {
    if (selectedRackTile === null || !roomData) return;
    if (roomData.activePlayerId !== user.uid) {
      setError("Wait for your turn!");
      return;
    }

    const key = `${r},${c}`;
    if (roomData.board[key] || tentativePlaced[key]) {
      setError("Cell is already occupied.");
      return;
    }

    const myRack = [...roomData.players[user.uid].rack];
    const tileToPlace = myRack[selectedRackTile];

    if (tileToPlace.letter === '_') {
      // Trigger blank letter modal select
      setPendingBlankCoords({ r, c, tileIndex: selectedRackTile });
      setBlankModalOpen(true);
      return;
    }

    // Place actual letter
    const newTentative = { ...tentativePlaced };
    newTentative[key] = { ...tileToPlace, originRackIndex: selectedRackTile };
    setTentativePlaced(newTentative);

    // Tentatively remove from local UI rack by making it invisible/empty placeholder
    setSelectedRackTile(null);
  };

  const selectBlankLetter = (letter) => {
    if (!pendingBlankCoords || !roomData) return;
    const { r, c, tileIndex } = pendingBlankCoords;
    const key = `${r},${c}`;

    const myRack = [...roomData.players[user.uid].rack];
    const tileToPlace = myRack[tileIndex];

    const newTentative = { ...tentativePlaced };
    newTentative[key] = {
      ...tileToPlace,
      letter, // The blank now represents this selected letter
      isBlank: true,
      originRackIndex: tileIndex
    };

    setTentativePlaced(newTentative);
    setBlankModalOpen(false);
    setPendingBlankCoords(null);
    setSelectedRackTile(null);
  };

  const removeTentativeTile = (r, c) => {
    const key = `${r},${c}`;
    if (!tentativePlaced[key]) return;

    const newTentative = { ...tentativePlaced };
    delete newTentative[key];
    setTentativePlaced(newTentative);
    setSelectedRackTile(null);
  };

  const recallAllTentative = () => {
    setTentativePlaced({});
    setSelectedRackTile(null);
  };

  const shuffleRack = async () => {
    if (!roomData || !roomId) return;
    const myPlayer = roomData.players[user.uid];
    const shuffledRack = shuffleArray(myPlayer.rack);

    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    const updatedPlayers = { ...roomData.players };
    updatedPlayers[user.uid].rack = shuffledRack;

    try {
      await updateDoc(roomRef, { players: updatedPlayers });
    } catch (err) {
      setError("Rack shuffle failed.");
    }
  };

  // --- GAME LOGIC VALIDATION AND SCORING ---
  const validatePlacement = () => {
    const coords = Object.keys(tentativePlaced).map(key => {
      const [r, c] = key.split(',').map(Number);
      return { r, c, tile: tentativePlaced[key] };
    });

    if (coords.length === 0) {
      return { valid: false, error: "Please place some tiles on the board first." };
    }

    const size = roomData.gridSize;
    const h = Math.floor(size / 2);
    const isFirstMove = Object.keys(roomData.board).length === 0;

    // First move must cover the center star
    if (isFirstMove) {
      const coversCenter = coords.some(co => co.r === h && co.c === h);
      if (!coversCenter) {
        return { valid: false, error: "The very first move of the game must cross the center Star." };
      }
    }

    // Single tile check
    if (coords.length === 1) {
      const single = coords[0];
      if (!isFirstMove) {
        // Must connect orthogonally or diagonally
        const hasAdjacency = checkAdjacency(single.r, single.c);
        if (!hasAdjacency) {
          return { valid: false, error: "Your tile must connect to existing letters on the board." };
        }
      }
      return { valid: true, coords };
    }

    // Determine direction vector
    // Let's analyze alignment of all placed coordinates
    const r0 = coords[0].r;
    const c0 = coords[0].c;
    const dr = coords[1].r - r0;
    const dc = coords[1].c - c0;

    // Compute simple Greatest Common Divisor (GCD) for step increments
    const getGcd = (a, b) => b === 0 ? Math.abs(a) : getGcd(b, a % b);
    const stepGcd = getGcd(dr, dc);
    const udr = dr / stepGcd; // Unit row step
    const udc = dc / stepGcd; // Unit col step

    // Check direction legitimacy
    const isHorizontal = udr === 0 && Math.abs(udc) === 1;
    const isVertical = Math.abs(udr) === 1 && udc === 0;
    const isDiagonal = Math.abs(udr) === 1 && Math.abs(udc) === 1;

    let dirValid = isHorizontal || isVertical;
    if (isDiagonal && (roomData.diagonalAllowed || roomData.diagonalBackwardsAllowed)) {
      dirValid = true;
    }

    if (!dirValid) {
      return { valid: false, error: "All tiles placed in a turn must form a single straight line." };
    }

    // Check if ALL tentative coordinates are collinear on this line
    for (let i = 2; i < coords.length; i++) {
      const curDr = coords[i].r - r0;
      const curDc = coords[i].c - c0;
      if (curDr * udc !== curDc * udr) {
        return { valid: false, error: "Your words must be arranged in a continuous straight line." };
      }
    }

    // Continuity Check: Ensure no empty spaces between the extremes of your line
    // Find min and max step indices along the line
    const getStepIndex = (c) => {
      return udr !== 0 ? (c.r - r0) / udr : (c.c - c0) / udc;
    };
    const sortedCoords = [...coords].sort((a, b) => getStepIndex(a) - getStepIndex(b));
    const minProj = getStepIndex(sortedCoords[0]);
    const maxProj = getStepIndex(sortedCoords[sortedCoords.length - 1]);

    for (let p = minProj; p <= maxProj; p++) {
      const steps = p - minProj;
      const stepRow = sortedCoords[0].r + steps * udr;
      const stepCol = sortedCoords[0].c + steps * udc;
      const key = `${stepRow},${stepCol}`;

      if (!roomData.board[key] && !tentativePlaced[key]) {
        return { valid: false, error: "Words cannot have blank gaps inside them!" };
      }
    }

    // Connection Check: If not first move, at least one tile must be adjacent to permanent board letters
    if (!isFirstMove) {
      const anyAdjacent = coords.some(co => checkAdjacency(co.r, co.c));
      if (!anyAdjacent) {
        return { valid: false, error: "Your word must connect to an existing tile on the board." };
      }
    }

    return { valid: true, coords, direction: { dr: udr, dc: udc } };
  };

  const checkAdjacency = (r, c) => {
    const orthogonalDirections = [
      [1, 0], [-1, 0], [0, 1], [0, -1]
    ];
    const diagonalDirections = [
      [1, 1], [1, -1], [-1, 1], [-1, -1]
    ];

    let searchDirs = [...orthogonalDirections];
    if (roomData.diagonalAllowed || roomData.diagonalBackwardsAllowed) {
      searchDirs = [...searchDirs, ...diagonalDirections];
    }

    for (let [dr, dc] of searchDirs) {
      const checkKey = `${r + dr},${c + dc}`;
      if (roomData.board[checkKey]) return true;
    }
    return false;
  };

  // Walk in a specific direction (dr, dc) from a cell to accumulate letters of a formed word
  const traverseWord = (startR, startC, dr, dc) => {
    let r = startR;
    let c = startC;

    // Find the ultimate boundary start point
    while (true) {
      const prevR = r - dr;
      const prevC = c - dc;
      const prevKey = `${prevR},${prevC}`;
      if (roomData.board[prevKey] || tentativePlaced[prevKey]) {
        r = prevR;
        c = prevC;
      } else {
        break;
      }
    }

    // Now gather all contiguous letters marching forward
    const wordCells = [];
    while (true) {
      const key = `${r},${c}`;
      const cell = tentativePlaced[key] || roomData.board[key];
      if (cell) {
        wordCells.push({ r, c, tile: cell, isNew: !!tentativePlaced[key] });
        r += dr;
        c += dc;
      } else {
        break;
      }
    }

    return wordCells;
  };

  // Evaluate the full list of words formed by this turn and calculate their values
  const getFormedWordsAndScores = () => {
    const validation = validatePlacement();
    if (!validation.valid) return { error: validation.error, words: [] };

    const { coords, direction } = validation;
    const formedWordsList = [];

    const normalizeDirection = (dir) => {
      if (!dir) return dir;
      if (dir.dc > 0) return dir;
      if (dir.dc < 0) return { dr: -dir.dr, dc: -dir.dc };
      if (dir.dr > 0) return dir;
      return { dr: -dir.dr, dc: -dir.dc };
    };

    // Direction candidates for searching words
    // If we only placed 1 tile, we must scan ALL axes (horizontal, vertical, and diagonals if enabled)
    // If we placed multiple, we check the primary axis of placement, plus perpendicular axes for each tile
    let axesToScan = [];
    if (coords.length === 1) {
      axesToScan = [
        { dr: 0, dc: 1 }, // Horizontal
        { dr: 1, dc: 0 }  // Vertical
      ];
      if (roomData.diagonalAllowed || roomData.diagonalBackwardsAllowed) {
        axesToScan.push({ dr: 1, dc: 1 });
        axesToScan.push({ dr: -1, dc: 1 });
      }
    } else {
      // Primary axis
      const normPrimary = normalizeDirection(direction);
      axesToScan.push(normPrimary);

      // Determine if the primary axis is diagonal
      const isPrimaryDiagonal = Math.abs(normPrimary.dr) === 1 && Math.abs(normPrimary.dc) === 1;

      // Select candidate crossing axes based on the room rules
      let candidateDirs = [
        { dr: 0, dc: 1 },
        { dr: 1, dc: 0 }
      ];
      if (roomData.diagonalAllowed || roomData.diagonalBackwardsAllowed) {
        // If diagonals are enabled, any placed tile (even orthogonal plays) can form diagonal cross-words!
        candidateDirs.push({ dr: 1, dc: 1 });
        candidateDirs.push({ dr: -1, dc: 1 });
      }

      coords.forEach(co => {
        candidateDirs.forEach(dir => {
          const normDir = normalizeDirection(dir);
          const isPrimaryDir = (normDir.dr === normPrimary.dr && normDir.dc === normPrimary.dc);
          if (!isPrimaryDir) {
            axesToScan.push({ dr: normDir.dr, dc: normDir.dc, fromCoord: co });
          }
        });
      });
    }

    // Track unique starting-and-ending cells to filter duplicates
    const registeredWordSignatures = new Set();

    axesToScan.forEach(axis => {
      const anchor = axis.fromCoord || coords[0];
      const wordCells = traverseWord(anchor.r, anchor.c, axis.dr, axis.dc);

      if (wordCells.length > 1) {
        // Unique key for this sequence of tiles
        const first = wordCells[0];
        const last = wordCells[wordCells.length - 1];
        const sig = `${first.r},${first.c}-${last.r},${last.c}`;

        if (!registeredWordSignatures.has(sig)) {
          registeredWordSignatures.add(sig);

          // Get string representaton
          const normalString = wordCells.map(wc => wc.tile.letter).join('');
          const backwardString = [...normalString].reverse().join('');

          // Let's calculate Scrabble point value
          let score = 0;
          let wordMultiplier = 1;

          wordCells.forEach(wc => {
            const val = wc.tile.isBlank ? 0 : (wc.tile.score !== undefined ? wc.tile.score : (TILE_SCORES[wc.tile.letter] || 0));
            if (wc.isNew) {
              const bonus = getBonus(wc.r, wc.c, roomData.gridSize);
              if (bonus === 'DL') score += val * 2;
              else if (bonus === 'TL') score += val * 3;
              else {
                score += val;
                if (bonus === 'DW' || bonus === 'star') wordMultiplier *= 2;
                if (bonus === 'TW') wordMultiplier *= 3;
              }
            } else {
              score += val;
            }
          });

          const totalWordScore = score * wordMultiplier;
          const normAxis = normalizeDirection({ dr: axis.dr, dc: axis.dc });
          formedWordsList.push({
            cells: wordCells,
            forwardWord: normalString,
            backwardWord: backwardString,
            score: totalWordScore,
            axis: normAxis
          });
        }
      }
    });

    // Filter accidental cross-system words for single tile plays
    if (coords.length === 1 && formedWordsList.length > 0) {
      // Find the main word (longest word)
      let mainWord = null;
      let maxLen = 0;
      formedWordsList.forEach(w => {
        if (w.forwardWord.length > maxLen) {
          maxLen = w.forwardWord.length;
          mainWord = w;
        }
      });

      if (mainWord) {
        // Tie-breaker: prefer orthogonal if there is a tie for longest word
        const longestWords = formedWordsList.filter(w => w.forwardWord.length === maxLen);
        const hasOrthogonalLongest = longestWords.some(w => !(Math.abs(w.axis.dr) === 1 && Math.abs(w.axis.dc) === 1));
        
        const isMainDiagonal = hasOrthogonalLongest ? false : (Math.abs(mainWord.axis.dr) === 1 && Math.abs(mainWord.axis.dc) === 1);
        
        // Keep only words on the same system (diagonal vs orthogonal)
        const filteredList = formedWordsList.filter(w => {
          const isDiag = Math.abs(w.axis.dr) === 1 && Math.abs(w.axis.dc) === 1;
          return isMainDiagonal ? isDiag : !isDiag;
        });

        // Mutate formedWordsList to reflect the filtered items
        formedWordsList.length = 0;
        formedWordsList.push(...filteredList);
      }
    }

    // Bingo calculation: Did player use their entire rack?
    let bingoBonus = 0;
    const placedCount = Object.keys(tentativePlaced).length;
    if (placedCount === roomData.rackSize) {
      if (roomData.gridSize === 15) bingoBonus = 50;
      else if (roomData.gridSize === 17) bingoBonus = 60;
      else bingoBonus = 70;
    }

    // --- 2-AXIS RULE VALIDATION ---
    const isFirstMove = Object.keys(roomData.board).length === 0;
    if (formedWordsList.length > 0 && !isFirstMove) {
      // 1. Identify the main word of this play
      let mainWord = null;
      if (coords.length > 1) {
        // Multi-tile plays: main word is the one matching the placement axis
        const mainAxis = normalizeDirection(direction);
        mainWord = formedWordsList.find(w => w.axis.dr === mainAxis.dr && w.axis.dc === mainAxis.dc);
      } else {
        // Single-tile plays: main word is the longest formed word
        let maxLen = 0;
        formedWordsList.forEach(w => {
          if (w.forwardWord.length > maxLen) {
            maxLen = w.forwardWord.length;
            mainWord = w;
          }
        });
      }

      if (mainWord) {
        const mainWordLen = mainWord.forwardWord.length;
        if (mainWordLen >= 3) {
          // Check if at least one cell of mainWord is shared with another word on a different axis.
          // This other word could either be a newly formed word (in formedWordsList)
          // or an existing word on the board.
          let hasCrossAxisConnection = false;

          // Define all possible direction vectors normalized
          const possibleDirs = [
            { dr: 0, dc: 1 }, // Horizontal
            { dr: 1, dc: 0 }  // Vertical
          ];
          if (roomData.diagonalAllowed || roomData.diagonalBackwardsAllowed) {
            possibleDirs.push({ dr: 1, dc: 1 });
            possibleDirs.push({ dr: -1, dc: 1 });
          }

          const mainAxisNorm = normalizeDirection(mainWord.axis);

          // Rule 2.1: Main Axis Privilege
          // H or V plays do not require a cross-axis bridge. Only diagonals do.
          const isDiagonal = mainAxisNorm.dr !== 0 && mainAxisNorm.dc !== 0;
          
          if (isDiagonal) {
            for (const mc of mainWord.cells) {
            for (const dir of possibleDirs) {
              const normDir = normalizeDirection(dir);
              const isDifferentAxis = (normDir.dr !== mainAxisNorm.dr || normDir.dc !== mainAxisNorm.dc);
              if (!isDifferentAxis) continue;

              // Traverse word on this different axis starting from cell mc
              const wordCells = traverseWord(mc.r, mc.c, normDir.dr, normDir.dc);
              if (wordCells.length >= 2) {
                hasCrossAxisConnection = true;
                break;
              }
            }
            if (hasCrossAxisConnection) break;
          }

          if (!hasCrossAxisConnection) {
            return {
              words: [],
              error: `2-Axis Rule: The ${mainWordLen}-letter main word "${mainWord.forwardWord}" must connect to at least one word on a different axis.`
            };
          }
        } // end if (isDiagonal)
        } // end if (mainWordLen >= 3)
      } // end if (mainWord)
    } // end if (formedWordsList.length > 0 && !isFirstMove)

    // --- DICTIONARY VALIDATION & FORGIVENESS ---
    const finalWordsList = [];
    if (roomData.validationMode === 'strict') {
      const wordValidity = new Map();
      for (const w of formedWordsList) {
        const isValid = checkWordLocal(w.forwardWord) ||
          (roomData.backwardsAllowed && checkWordLocal(w.backwardWord)) ||
          (roomData.diagonalBackwardsAllowed && checkWordLocal(w.backwardWord));
        wordValidity.set(w, isValid);
      }

      const isSingleTilePlay = coords.length === 1;
      const hasAtLeastOneValidWord = Array.from(wordValidity.values()).some(v => v);

      let mainWord = null;
      if (isSingleTilePlay) {
        let maxLen = 0;
        formedWordsList.forEach(w => {
          if (w.forwardWord.length > maxLen) {
            maxLen = w.forwardWord.length;
            mainWord = w;
          }
        });
      } else if (coords.length > 1) {
        const mainAxis = normalizeDirection(direction);
        mainWord = formedWordsList.find(w => w.axis.dr === mainAxis.dr && w.axis.dc === mainAxis.dc);
      }

      const crossWords = formedWordsList.filter(w => w !== mainWord);
      const isMainWordValid = mainWord ? wordValidity.get(mainWord) : true;
      const hasValidCrossWord = crossWords.some(w => wordValidity.get(w));

      for (const w of formedWordsList) {
        if (!wordValidity.get(w)) {
          let isForgiven = false;

          if (isSingleTilePlay) {
            if (hasAtLeastOneValidWord) isForgiven = true;
          } else {
            if (w === mainWord) {
              isForgiven = false; // Main word must be valid
            } else {
              if (isMainWordValid && hasValidCrossWord) {
                isForgiven = true;
              }
            }
          }

          if (!isForgiven) {
            return {
              words: [],
              error: `"${w.forwardWord}" was not recognized as a valid English word! Play rejected.`
            };
          }
          // If forgiven, we omit it from finalWordsList so it receives no points
        } else {
          finalWordsList.push(w);
        }
      }
    } else {
      finalWordsList.push(...formedWordsList);
    }

    return {
      valid: true,
      words: finalWordsList,
      bingoBonus,
      totalScore: finalWordsList.reduce((sum, w) => sum + w.score, 0) + bingoBonus
    };
  };

  const calculateEndgame = (currentPlayers, triggeringPlayerId, outOfTiles, history = []) => {
    const updated = JSON.parse(JSON.stringify(currentPlayers));
    let outBonus = 0;
    const details = [];

    Object.entries(updated).forEach(([uid, player]) => {
      let deduction = 0;
      player.rack.forEach(tile => {
        deduction += tile.score;
      });
      player.score -= deduction;
      
      if (deduction > 0) {
        details.push(`${player.name} lost ${deduction} pts for unplayed tiles.`);
      }

      if (uid !== triggeringPlayerId) {
        outBonus += deduction;
      }
    });

    if (outOfTiles && triggeringPlayerId && updated[triggeringPlayerId]) {
      updated[triggeringPlayerId].score += outBonus;
      if (outBonus > 0) {
        details.push(`${updated[triggeringPlayerId].name} received a +${outBonus} pt bonus for going out!`);
      }
    }

    const playerList = Object.values(updated).sort((a, b) => b.score - a.score);
    let scorecardStr = "";
    if (playerList.length >= 2) {
      const winner = playerList[0];
      const losers = playerList.slice(1);
      
      let losersNamesStr = "";
      if (losers.length === 1) {
        losersNamesStr = losers[0].name.toUpperCase();
      } else {
        losersNamesStr = losers.map(l => l.name.toUpperCase()).slice(0, -1).join(", ") + " AND " + losers[losers.length - 1].name.toUpperCase();
      }

      const trashTalk = `THE CHAMP IS HERE! THE CHAMP IS HERE! THE WINNER IS ${winner.name.toUpperCase()}.\n${losersNamesStr} IS GARBAGE! WILLIAM MONTGOMERY KNOWS THEY'RE GARBAGE, BOB LAZAR KNOWS THEY'RE GARBAGE, JOE ROGAN KNOWS THEY'RE GARBAGE, G.I JOEL KNOWS THEY'RE GARBAGE, BRENDAN SCHAUB KNOWS THEY'RE GARBAGE, MARLIN HILL KNOW'S THEY'RE GARBAGE, CASEY ROCKET KNOW'S THEY'RE GARBAGE, MIRANDA COSGROVE KNOWS THEY'RE GARBAGE. EVERYONE KNOWS THEY'RE GARBAGE!`;
      
      // Generate scorecard text
      const sc = [];
      sc.push(trashTalk);
      sc.push("");
      sc.push("----------------------------------------");
      sc.push("           FINAL SCORE CARD             ");
      sc.push("----------------------------------------");
      playerList.forEach((p, idx) => {
        sc.push(`${idx + 1}. ${p.name}: ${p.score} pts`);
      });
      sc.push("----------------------------------------");
      sc.push("         TURN-BY-TURN RECAP             ");
      sc.push("----------------------------------------");
      
      history.forEach(item => {
        if (item.type === 'turn') {
          const wordsStr = (item.words || []).map(w => `"${w.word}"`).join(', ');
          sc.push(`${item.playerName} played ${wordsStr || 'word'} for ${item.points} points`);
        } else if (item.type === 'pass') {
          sc.push(`${item.playerName}: skipped`);
        } else if (item.type === 'exchange') {
          sc.push(`${item.playerName}: exchanged tiles`);
        }
      });
      sc.push("----------------------------------------");
      scorecardStr = sc.join("\n");
    }

    return { 
      players: updated, 
      detailsStr: details.join(' '),
      scorecardStr
    };
  };

  // Submit words, increment scores, refill rack, toggle active user
  const handlePlayTurn = async () => {
    if (!roomData || !roomId) return;
    if (roomData.activePlayerId !== user.uid) return;

    setError('');
    const scoreData = getFormedWordsAndScores();
    if (scoreData.error) {
      setError(scoreData.error);
      return;
    }

    if (scoreData.words.length === 0) {
      setError("Placed letters must form at least one valid word.");
      return;
    }

    // Success! Update Firestore room
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    const updatedBoard = { ...roomData.board };
    const myPlayer = roomData.players[user.uid];
    if (!myPlayer) {
      setError("Player data not found.");
      return;
    }
    const myRack = [...myPlayer.rack];
    const myDeck = [...myPlayer.deck];

    // Build lists of letters placed to remove from rack
    const placedTileIds = Object.values(tentativePlaced).map(t => t.id);
    const updatedRack = myRack.filter(tile => !placedTileIds.includes(tile.id));

    // Place on perm board
    Object.entries(tentativePlaced).forEach(([key, tile]) => {
      updatedBoard[key] = {
        letter: tile.letter,
        score: tile.isBlank ? 0 : tile.score,
        isBlank: !!tile.isBlank,
        placedBy: user.uid,
        turnIndex: roomData.turnIndex
      };
    });

    // Refill rack from player's private balanced deck
    const needed = roomData.rackSize - updatedRack.length;
    for (let i = 0; i < needed; i++) {
      if (myDeck.length > 0) {
        updatedRack.push(myDeck.shift());
      }
    }

    // Toggle turn cyclically
    const currentIndex = roomData.playerOrder.indexOf(user.uid);
    const nextPlayerId = roomData.playerOrder[(currentIndex + 1) % roomData.playerOrder.length] || user.uid;
    const turnPoints = scoreData.totalScore;
    const finalScore = (myPlayer.score || 0) + turnPoints;

    // Fetch definitions for history asynchronously
    const wordsWithDefs = await Promise.all(scoreData.words.map(async (w) => {
      let validWord = w.forwardWord;
      if (!checkWordLocal(w.forwardWord) && (roomData.backwardsAllowed || roomData.diagonalBackwardsAllowed) && checkWordLocal(w.backwardWord)) {
        validWord = w.backwardWord;
      }
      const def = await fetchWordDefinition(validWord);
      if (def) {
        return `"${validWord}" (${w.score} pts): ${def}`;
      }
      return `"${validWord}" (${w.score} pts)`;
    }));
    const wordsPlacedStr = wordsWithDefs.join(' | ');

    const bingoMsg = scoreData.bingoBonus > 0 ? ` BINGO (+${scoreData.bingoBonus} pts)!` : '';
    const turnMessage = `${myPlayer.name} played ${wordsPlacedStr} for a total of ${turnPoints} pts.${bingoMsg}`;

    const updatedPlayers = { ...roomData.players };
    updatedPlayers[user.uid] = {
      ...myPlayer,
      score: finalScore,
      rack: updatedRack,
      deck: myDeck
    };

    // Prepare History action (structured for scorecard)
    const historyItem = {
      id: Math.random().toString(),
      timestamp: Date.now(),
      type: 'turn',
      message: turnMessage,
      playerName: myPlayer.name,
      playerUid: user.uid,
      words: scoreData.words.map(w => ({ word: w.forwardWord, score: w.score })),
      points: turnPoints
    };

    const isGameOver = updatedRack.length === 0 && myDeck.length === 0;

    let finalUpdateObj = {
      board: updatedBoard,
      players: updatedPlayers,
      activePlayerId: nextPlayerId,
      turnStartTime: Date.now(),
      history: [...roomData.history, historyItem],
      turnIndex: roomData.turnIndex + 1,
      consecutiveZeroTurns: 0
    };

    if (isGameOver) {
      const { players: finalPlayers, detailsStr, scorecardStr } = calculateEndgame(updatedPlayers, user.uid, true, [...roomData.history, historyItem]);
      finalUpdateObj.players = finalPlayers;
      finalUpdateObj.status = 'finished';
      finalUpdateObj.history.push({
        id: Math.random().toString(),
        timestamp: Date.now() + 1,
        type: 'system',
        message: `GAME OVER! ${myPlayer.name} used their last tile. ${detailsStr}`
      });
      if (scorecardStr) {
        finalUpdateObj.history.push({
          id: Math.random().toString(),
          timestamp: Date.now() + 2,
          type: 'scorecard',
          message: scorecardStr
        });
      }
    }

    try {
      await updateDoc(roomRef, finalUpdateObj);

      // Clear local placements
      setTentativePlaced({});
      setSelectedRackTile(null);
      showTemporarySuccess("Awesome play! Turn successfully passed.");
    } catch (err) {
      setError("Turn execution failed: " + err.message);
    }
  };

  // Helper to submit valid tile placements or pass turn when timer runs out
  const handleAutoPlayOrPass = async () => {
    if (!roomData || !roomId || roomData.activePlayerId !== user.uid) return;

    // Check if there are any tiles on the board
    const placedCount = Object.keys(tentativePlaced).length;
    if (placedCount > 0) {
      const scoreData = getFormedWordsAndScores();
      if (!scoreData.error && scoreData.words && scoreData.words.length > 0) {
        // Valid play exists! Let's submit it.
        setError('');
        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
        const updatedBoard = { ...roomData.board };
        const myPlayer = roomData.players[user.uid];
        if (myPlayer) {
          const myRack = [...myPlayer.rack];
          const myDeck = [...myPlayer.deck];

          // Build lists of letters placed to remove from rack
          const placedTileIds = Object.values(tentativePlaced).map(t => t.id);
          const updatedRack = myRack.filter(tile => !placedTileIds.includes(tile.id));

          // Place on perm board
          Object.entries(tentativePlaced).forEach(([key, tile]) => {
            updatedBoard[key] = {
              letter: tile.letter,
              score: tile.isBlank ? 0 : tile.score,
              isBlank: !!tile.isBlank,
              placedBy: user.uid,
              turnIndex: roomData.turnIndex
            };
          });

          // Refill rack from player's private balanced deck
          const needed = roomData.rackSize - updatedRack.length;
          for (let i = 0; i < needed; i++) {
            if (myDeck.length > 0) {
              updatedRack.push(myDeck.shift());
            }
          }

          // Toggle turn cyclically
          const currentIndex = roomData.playerOrder.indexOf(user.uid);
          const nextPlayerId = roomData.playerOrder[(currentIndex + 1) % roomData.playerOrder.length] || user.uid;
          const turnPoints = scoreData.totalScore;
          const finalScore = (myPlayer.score || 0) + turnPoints;

          // Fetch definitions for history asynchronously
          const wordsWithDefs = await Promise.all(scoreData.words.map(async (w) => {
            let validWord = w.forwardWord;
            if (!checkWordLocal(w.forwardWord) && (roomData.backwardsAllowed || roomData.diagonalBackwardsAllowed) && checkWordLocal(w.backwardWord)) {
              validWord = w.backwardWord;
            }
            const def = await fetchWordDefinition(validWord);
            if (def) {
              return `"${validWord}" (${w.score} pts): ${def}`;
            }
            return `"${validWord}" (${w.score} pts)`;
          }));
          const wordsPlacedStr = wordsWithDefs.join(' | ');

          const bingoMsg = scoreData.bingoBonus > 0 ? ` BINGO (+${scoreData.bingoBonus} pts)!` : '';
          const turnMessage = `${myPlayer.name} played ${wordsPlacedStr} for a total of ${turnPoints} pts.${bingoMsg}`;

          const updatedPlayers = { ...roomData.players };
          updatedPlayers[user.uid] = {
            ...myPlayer,
            score: finalScore,
            rack: updatedRack,
            deck: myDeck
          };

          // Prepare History action (structured for scorecard)
          const historyItem = {
            id: Math.random().toString(),
            timestamp: Date.now(),
            type: 'turn',
            message: turnMessage,
            playerName: myPlayer.name,
            playerUid: user.uid,
            words: scoreData.words.map(w => ({ word: w.forwardWord, score: w.score })),
            points: turnPoints
          };

          const isGameOver = updatedRack.length === 0 && myDeck.length === 0;

          let finalUpdateObj = {
            board: updatedBoard,
            players: updatedPlayers,
            activePlayerId: nextPlayerId,
            turnStartTime: Date.now(),
            history: [...roomData.history, historyItem],
            turnIndex: roomData.turnIndex + 1,
            consecutiveZeroTurns: 0
          };

          if (isGameOver) {
            const { players: finalPlayers, detailsStr, scorecardStr } = calculateEndgame(updatedPlayers, user.uid, true, [...roomData.history, historyItem]);
            finalUpdateObj.players = finalPlayers;
            finalUpdateObj.status = 'finished';
            finalUpdateObj.history.push({
              id: Math.random().toString(),
              timestamp: Date.now() + 1,
              type: 'system',
              message: `GAME OVER! ${myPlayer.name} used their last tile. ${detailsStr}`
            });
            if (scorecardStr) {
              finalUpdateObj.history.push({
                id: Math.random().toString(),
                timestamp: Date.now() + 2,
                type: 'scorecard',
                message: scorecardStr
              });
            }
          }

          try {
            await updateDoc(roomRef, finalUpdateObj);
            // Clear local placements
            setTentativePlaced({});
            setSelectedRackTile(null);
            showTemporarySuccess("Time up! Auto-played tiles on the board.");
            return;
          } catch (err) {
            console.error("Auto-play submission failed: ", err);
          }
        }
      }
    }

    // If we didn't play (or it failed), pass the turn!
    await handlePassTurn(true);
  };

  // Skip turn action
  const handlePassTurn = async (isTimeout = false) => {
    if (!roomData || !roomId || roomData.activePlayerId !== user.uid) return;
    setError('');

    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    const currentIndex = roomData.playerOrder.indexOf(user.uid);
    const nextPlayerId = roomData.playerOrder[(currentIndex + 1) % roomData.playerOrder.length] || user.uid;
    const myPlayer = roomData.players[user.uid];

    const historyItem = {
      id: Math.random().toString(),
      timestamp: Date.now(),
      type: 'pass',
      message: isTimeout 
        ? `${myPlayer.name} passed their turn (timer expired).` 
        : `${myPlayer.name} passed their turn.`,
      playerName: myPlayer.name,
      playerUid: user.uid
    };

    const newConsecutiveZero = (roomData.consecutiveZeroTurns || 0) + 1;
    const maxPasses = (roomData.maxPlayers || 2) * 3;
    const isGameOver = newConsecutiveZero >= maxPasses;

    let finalUpdateObj = {
      activePlayerId: nextPlayerId,
      turnStartTime: Date.now(),
      history: [...roomData.history, historyItem],
      turnIndex: roomData.turnIndex + 1,
      consecutiveZeroTurns: newConsecutiveZero
    };

    if (isGameOver) {
      const { players: finalPlayers, detailsStr, scorecardStr } = calculateEndgame(roomData.players, null, false, [...roomData.history, historyItem]);
      finalUpdateObj.players = finalPlayers;
      finalUpdateObj.status = 'finished';
      finalUpdateObj.history.push({
        id: Math.random().toString(),
        timestamp: Date.now() + 1,
        type: 'system',
        message: `GAME OVER! ${maxPasses} consecutive zero-score turns passed. ${detailsStr}`
      });
      if (scorecardStr) {
        finalUpdateObj.history.push({
          id: Math.random().toString(),
          timestamp: Date.now() + 2,
          type: 'scorecard',
          message: scorecardStr
        });
      }
    }

    try {
      await updateDoc(roomRef, finalUpdateObj);
      recallAllTentative();
      showTemporarySuccess("You passed your turn.");
    } catch (err) {
      setError("Pass action failed: " + err.message);
    }
  };

  // Skip turn action on behalf of another player who timed out/disconnected
  const handlePassTurnForPlayer = async (targetPlayerId) => {
    if (!roomData || !roomId) return;
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    const currentIndex = roomData.playerOrder.indexOf(targetPlayerId);
    const nextPlayerId = roomData.playerOrder[(currentIndex + 1) % roomData.playerOrder.length] || targetPlayerId;
    const targetPlayer = roomData.players[targetPlayerId];
    if (!targetPlayer) return;

    const historyItem = {
      id: Math.random().toString(),
      timestamp: Date.now(),
      type: 'pass',
      message: `${targetPlayer.name} passed their turn (timer expired).`,
      playerName: targetPlayer.name,
      playerUid: targetPlayerId
    };

    const newConsecutiveZero = (roomData.consecutiveZeroTurns || 0) + 1;
    const maxPasses = (roomData.maxPlayers || 2) * 3;
    const isGameOver = newConsecutiveZero >= maxPasses;

    let finalUpdateObj = {
      activePlayerId: nextPlayerId,
      turnStartTime: Date.now(),
      history: [...roomData.history, historyItem],
      turnIndex: roomData.turnIndex + 1,
      consecutiveZeroTurns: newConsecutiveZero
    };

    if (isGameOver) {
      const { players: finalPlayers, detailsStr, scorecardStr } = calculateEndgame(roomData.players, null, false, [...roomData.history, historyItem]);
      finalUpdateObj.players = finalPlayers;
      finalUpdateObj.status = 'finished';
      finalUpdateObj.history.push({
        id: Math.random().toString(),
        timestamp: Date.now() + 1,
        type: 'system',
        message: `GAME OVER! ${maxPasses} consecutive zero-score turns passed. ${detailsStr}`
      });
      if (scorecardStr) {
        finalUpdateObj.history.push({
          id: Math.random().toString(),
          timestamp: Date.now() + 2,
          type: 'scorecard',
          message: scorecardStr
        });
      }
    }

    try {
      await updateDoc(roomRef, finalUpdateObj);
    } catch (err) {
      console.error("Pass action on behalf of player failed:", err);
    }
  };

  // Exchange selected tiles from rack and shuffle them back into player's deck
  const handleExchangeTiles = async () => {
    if (!roomData || !roomId || roomData.activePlayerId !== user.uid) return;
    if (selectedExchangeIds.length === 0) {
      setError("Select at least one tile from your rack to exchange.");
      return;
    }

    setError('');
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    const myPlayer = roomData.players[user.uid];
    const myRack = [...myPlayer.rack];
    const myDeck = [...myPlayer.deck];

    // Separate exchanged tiles and remaining tiles
    const tilesToReturn = myRack.filter(t => selectedExchangeIds.includes(t.id));
    const keptRack = myRack.filter(t => !selectedExchangeIds.includes(t.id));

    // Refill rack from deck first
    const drawnRack = [...keptRack];
    for (let i = 0; i < tilesToReturn.length; i++) {
      if (myDeck.length > 0) {
        drawnRack.push(myDeck.shift());
      }
    }

    // Now return old tiles to the private deck and shuffle
    const updatedDeck = shuffleArray([...myDeck, ...tilesToReturn]);

    const currentIndex = roomData.playerOrder.indexOf(user.uid);
    const nextPlayerId = roomData.playerOrder[(currentIndex + 1) % roomData.playerOrder.length] || user.uid;
    const historyItem = {
      id: Math.random().toString(),
      timestamp: Date.now(),
      type: 'exchange',
      message: `${myPlayer.name} exchanged ${tilesToReturn.length} tiles.`,
      playerName: myPlayer.name,
      playerUid: user.uid
    };

    const updatedPlayers = { ...roomData.players };
    updatedPlayers[user.uid] = {
      ...myPlayer,
      rack: drawnRack,
      deck: updatedDeck
    };

    const newConsecutiveZero = (roomData.consecutiveZeroTurns || 0) + 1;
    const maxPasses = (roomData.maxPlayers || 2) * 3;
    const isGameOver = newConsecutiveZero >= maxPasses;

    let finalUpdateObj = {
      players: updatedPlayers,
      activePlayerId: nextPlayerId,
      turnStartTime: Date.now(),
      history: [...roomData.history, historyItem],
      turnIndex: roomData.turnIndex + 1,
      consecutiveZeroTurns: newConsecutiveZero
    };

    if (isGameOver) {
      const { players: finalPlayers, detailsStr, scorecardStr } = calculateEndgame(updatedPlayers, null, false, [...roomData.history, historyItem]);
      finalUpdateObj.players = finalPlayers;
      finalUpdateObj.status = 'finished';
      finalUpdateObj.history.push({
        id: Math.random().toString(),
        timestamp: Date.now() + 1,
        type: 'system',
        message: `GAME OVER! ${maxPasses} consecutive zero-score turns passed. ${detailsStr}`
      });
      if (scorecardStr) {
        finalUpdateObj.history.push({
          id: Math.random().toString(),
          timestamp: Date.now() + 2,
          type: 'scorecard',
          message: scorecardStr
        });
      }
    }

    try {
      await updateDoc(roomRef, finalUpdateObj);

      // Reset exchange state
      setExchangeMode(false);
      setSelectedExchangeIds([]);
      recallAllTentative();
      showTemporarySuccess("Tiles exchanged successfully.");
    } catch (err) {
      setError("Exchange operation failed: " + err.message);
    }
  };

  // Dictionary lookup function
  const checkWordLocal = (word) => {
    if (!word || word.length < 2) return false;
    if (window.SOWPODS_DICT) {
      return window.SOWPODS_DICT.has(word.toUpperCase());
    }
    // Fallback if dictionary failed to load
    return true; 
  };

  const fetchWordDefinition = async (word) => {
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const meaningsList = [];
          data.forEach(entry => {
            if (entry.meanings) {
              entry.meanings.forEach(meaning => {
                const pos = meaning.partOfSpeech || "";
                if (meaning.definitions) {
                  meaning.definitions.slice(0, 2).forEach(defObj => {
                    if (defObj.definition) {
                      meaningsList.push(`[${pos}] ${defObj.definition}`);
                    }
                  });
                }
              });
            }
          });
          const uniqueMeanings = [...new Set(meaningsList)];
          if (uniqueMeanings.length > 0) {
            return uniqueMeanings.slice(0, 3).join("; ");
          }
        }
      }
    } catch (e) {}
    return null;
  };

  const handleDictCheck = async (e) => {
    e.preventDefault();
    if (!dictWord.trim()) return;
    setDictChecking(true);
    setDictResult(null);

    const lookup = dictWord.trim().toLowerCase();
    
    // 1. Instant local validation
    const isValid = checkWordLocal(lookup);
    
    // 2. Fetch definition if valid
    let def = null;
    if (isValid) {
      def = await fetchWordDefinition(lookup);
    }

    setDictResult({ word: lookup, valid: isValid, definition: def, error: !isValid && !window.SOWPODS_DICT });
    setDictChecking(false);
  };

  // Helper messages UI
  const showTemporarySuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => {
      setSuccessMsg('');
    }, 4000);
  };

  // Helper to copy room ID to clipboard (safe replacement for navigator.clipboard)
  const copyRoomIdToClipboard = () => {
    const el = document.createElement('textarea');
    el.value = roomId;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showTemporarySuccess(`Room ID "${roomId}" copied to clipboard!`);
  };

  // Check Game Info and Status
  const isMyTurn = roomData && roomData.activePlayerId === user.uid;
  const opponents = roomData ? Object.values(roomData.players).filter(p => p.uid !== user.uid) : [];
  const opponent = opponents[0] || null;
  const me = roomData ? roomData.players[user.uid] : null;

  // Real-time placement scoring evaluation
  const scoreReport = roomData ? getFormedWordsAndScores() : null;

  const isWordValid = (w) => {
    if (!roomData) return false;
    return checkWordLocal(w.forwardWord) ||
           (roomData.backwardsAllowed && checkWordLocal(w.backwardWord)) ||
           (roomData.diagonalBackwardsAllowed && checkWordLocal(w.backwardWord));
  };
  const hasValidWord = scoreReport && scoreReport.words && scoreReport.words.some(isWordValid);

  // Track remaining tiles (unplayed tiles in decks and racks)
  const remainingCounts = (() => {
    if (!roomData || !roomData.players) return {};
    const counts = {};
    Object.values(roomData.players).forEach(p => {
      if (p.deck) {
        p.deck.forEach(t => {
          let char = (t.letter || '').toUpperCase();
          if (char === '_') char = '?';
          if (char) {
            counts[char] = (counts[char] || 0) + 1;
          }
        });
      }
      if (p.rack) {
        p.rack.forEach(t => {
          let char = (t.letter || '').toUpperCase();
          if (char === '_') char = '?';
          if (char) {
            counts[char] = (counts[char] || 0) + 1;
          }
        });
      }
    });
    return counts;
  })();

  const sortedLetters = Object.keys(remainingCounts).sort((a, b) => {
    if (a === '?') return 1;
    if (b === '?') return -1;
    return a.localeCompare(b);
  });

  // Turn Timer & Auto-Pass Logic
  const [remainingTime, setRemainingTime] = useState(0);
  const lastPassedTurnIndexRef = useRef(-1);

  // Flash red warning when timer hits 10 seconds
  const [shouldFlashRed, setShouldFlashRed] = useState(false);
  useEffect(() => {
    if (coloursEnabled && remainingTime === 10) {
      setShouldFlashRed(true);
      const timer = setTimeout(() => {
        setShouldFlashRed(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [remainingTime, coloursEnabled]);

  useEffect(() => {
    if (!roomData || roomData.status !== 'playing' || !roomData.timerEnabled) return;

    const tick = () => {
      const start = roomData.turnStartTime || Date.now();
      const passed = Math.floor((Date.now() - start) / 1000);
      const left = Math.max(0, roomData.timerDuration - passed);
      setRemainingTime(left);

      // Auto-pass if time is up
      if (left === 0) {
        if (roomData.activePlayerId === user?.uid) {
          if (lastPassedTurnIndexRef.current !== roomData.turnIndex) {
            lastPassedTurnIndexRef.current = roomData.turnIndex;
            handleAutoPlayOrPass();
          }
        } else {
          // If it is NOT my turn, wait for a 1.5-second grace period
          // to let the active player's client handle its timeout first.
          const actualPassed = (Date.now() - start) / 1000;
          if (actualPassed >= roomData.timerDuration + 1.5) {
            // Find connected standby players who are not the active player
            const connectedNonActive = roomData.playerOrder.filter(uid => {
              if (uid === roomData.activePlayerId) return false;
              const p = roomData.players[uid];
              return p && p.lastActive && (Date.now() - p.lastActive <= 15000);
            });
            // First standby connected player triggers pass on behalf of target
            if (connectedNonActive[0] === user?.uid) {
              if (lastPassedTurnIndexRef.current !== roomData.turnIndex) {
                lastPassedTurnIndexRef.current = roomData.turnIndex;
                handlePassTurnForPlayer(roomData.activePlayerId);
              }
            }
          }
        }
      }
    };

    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [roomData?.status, roomData?.timerEnabled, roomData?.turnStartTime, roomData?.timerDuration, roomData?.activePlayerId, user?.uid, roomData?.players, roomData?.playerOrder]);

  // Online Presence Heartbeat Effect
  useEffect(() => {
    if (!roomData || !roomId || !user) return;
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    
    const setHeartbeat = async () => {
      try {
        await updateDoc(roomRef, {
          [`players.${user.uid}.lastActive`]: Date.now()
        });
      } catch (e) {
        console.error("Initial heartbeat error:", e);
      }
    };
    setHeartbeat();

    const intervalId = setInterval(async () => {
      try {
        await updateDoc(roomRef, {
          [`players.${user.uid}.lastActive`]: Date.now()
        });
      } catch (e) {
        console.error("Interval heartbeat error:", e);
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [roomId, user?.uid]);

  // Responsive Board Calculations
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 768);
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const isMobile = windowWidth < 768;
  const baseCellSize = isMobile ? 24 : 38;
  const cellSize = Math.round(baseCellSize * boardZoom);

  const isDark = theme === 'dark';

  return (
    <div className={`min-h-screen font-sans flex flex-col antialiased transition-colors duration-200 ${
      isDark 
        ? 'bg-[#0e1013] text-[#e2e8f0] selection:bg-[#2a2e37] selection:text-slate-950' 
        : 'bg-[#f8fafc] text-[#1e293b] selection:bg-slate-200 selection:text-slate-900'
    }`}>

      {/* --- HEADER --- */}
      <header className={`border-b shadow-xl py-4 px-6 z-30 transition-colors duration-200 ${
        isDark ? 'bg-[#15181d] border-[#21252d]' : 'bg-white border-slate-200'
      }`}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">

          {/* Logo & Heading */}
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-[#e3cb98] to-[#d7be8a] border border-[#bfa573] text-[#2d2008] font-black text-2xl h-10 w-10 flex items-center justify-center rounded-lg shadow-md tracking-wider">
              S
            </div>
            <div>
              <h1 className={`font-extrabold text-lg md:text-xl leading-tight transition-colors duration-200 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>FairScrabble Live</h1>
              <p className={`text-xs transition-colors duration-200 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>100% Even Tile Distribution & Multi-Directions</p>
            </div>
          </div>

          {/* Nickname, Theme and Lobby Info */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors duration-200 ${
              isDark ? 'bg-[#111317] border-[#21252d]' : 'bg-slate-100 border-slate-200'
            }`}>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className={isDark ? 'text-slate-400' : 'text-slate-505'}>Handle:</span>
              <input
                type="text"
                value={username}
                onChange={(e) => saveNickname(e.target.value)}
                className={`bg-transparent border-b hover:border-slate-400 focus:border-slate-500 focus:outline-none font-semibold w-32 px-1 py-0.5 transition ${
                  isDark ? 'border-slate-700 text-slate-300' : 'border-slate-300 text-slate-750'
                }`}
                placeholder="Your Nickname"
                title="Change nickname anytime"
              />
            </div>

            <button
              onClick={toggleTheme}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold border transition ${
                isDark 
                  ? 'bg-slate-600 hover:bg-slate-500 border-slate-500 text-white' 
                  : 'bg-slate-200 hover:bg-slate-300 border-slate-300 text-slate-800'
              }`}
              title="Toggle Light/Dark Mode"
            >
              {isDark ? '☀️ Light Mode' : '🌙 Dark Mode'}
            </button>

            {/* Colours Toggle Switch */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-bold transition ${
              isDark 
                ? 'bg-slate-800 border-slate-700 text-slate-200' 
                : 'bg-slate-100 border-slate-250 text-slate-700'
            }`}>
              <span>🎨 Colours</span>
              <button
                type="button"
                onClick={() => {
                  const nextColours = !coloursEnabled;
                  setColoursEnabled(nextColours);
                  localStorage.setItem('scrabble_colours', nextColours ? 'true' : 'false');
                }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  coloursEnabled ? 'bg-emerald-500' : 'bg-slate-400'
                }`}
                title="Toggle warn & validation colour features"
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    coloursEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {roomData && (
              <button
                onClick={handleLeaveRoom}
                className={`text-xs font-bold px-3 py-2 rounded-lg border transition ${
                  isDark 
                    ? 'bg-[#2a1313] hover:bg-[#351818] border-[#421d1d] text-[#fca5a5]' 
                    : 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-600'
                }`}
              >
                Quit Room
              </button>
            )}
          </div>

        </div>
      </header>

      {/* --- MAIN BODY --- */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col gap-6">

        {/* Global Notifications */}
        {error && (
          <div className={`p-4 rounded-xl text-sm font-medium flex items-center justify-between shadow-lg border transition-colors ${
            isDark 
              ? 'bg-[#2a1313]/80 border-[#421d1d]/80 text-[#fca5a5]' 
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}>
            <span>⚠️ {error}</span>
            <button onClick={() => setError('')} className="hover:text-white font-bold ml-3 text-lg">&times;</button>
          </div>
        )}

        {successMsg && (
          <div className={`p-4 rounded-xl text-sm font-medium flex items-center justify-between shadow-lg border animate-bounce transition-colors ${
            isDark 
              ? 'bg-[#132a1d]/80 border-[#1d422b]/80 text-[#86efac]' 
              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}>
            <span>✅ {successMsg}</span>
            <button onClick={() => setSuccessMsg('')} className="hover:text-white font-bold ml-3 text-lg">&times;</button>
          </div>
        )}

        {/* --- ROOM CREATION / JOIN LOBBY --- */}
        {!roomData ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start my-auto">

            {/* Intro Features */}
            <div className={`lg:col-span-7 space-y-6 p-6 md:p-8 rounded-2xl border transition-colors ${
              isDark ? 'bg-[#15181d]/50 border-[#21252d]' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <h2 className={`text-2xl md:text-3xl font-extrabold transition-colors ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Mathematically Balanced Scrabble</h2>
              <p className={`text-sm md:text-base leading-relaxed transition-colors ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                Tired of losing matches because your opponent drew both Blank tiles, both high-pointers (<span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-850'}`}>Z</span>, <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-850'}`}>Q</span>), and all the S's?
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs md:text-sm">
                <div className={`border p-4 rounded-xl transition-colors ${isDark ? 'bg-[#111317] border-[#21252d]' : 'bg-slate-50 border-slate-200'}`}>
                  <h4 className={`font-bold mb-2 transition-colors ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>⚖️ Perfectly Even Tile Bags</h4>
                  <p className={`leading-normal transition-colors ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Z, Q, X, and J are split 50/50 randomly. Each player gets exactly 1 Blank tile, and the S's are divided equally. Racks scale with grid sizes: 15x15 (7), 17x17 (8), 19x19 (9).
                  </p>
                </div>

                <div className={`border p-4 rounded-xl transition-colors ${isDark ? 'bg-[#111317] border-[#21252d]' : 'bg-slate-50 border-slate-200'}`}>
                  <h4 className={`font-bold mb-2 transition-colors ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>🧭 Rule Modifiers</h4>
                  <p className={`leading-normal transition-colors ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Break traditional geometry boundaries! Play words diagonally down/up, backwards left, or backwards-diagonals to maximize points on premium squares.
                  </p>
                </div>
              </div>

              {/* Live Status */}
              <div className={`border p-4 rounded-xl text-sm flex items-center gap-3 transition-colors ${
                isDark ? 'bg-slate-400/10 border-[#4f5666]/20 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'
              }`}>
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-slate-400"></span>
                </span>
                <span>Configure a custom battle and share the Room Code with your friend to connect instantly.</span>
              </div>
            </div>

            {/* Config & Forms */}
            <div className="lg:col-span-5 space-y-6">

              {/* Creator Settings Card */}
              <div className={`border p-6 rounded-2xl shadow-xl space-y-4 transition-colors ${
                isDark ? 'bg-[#15181d] border-[#21252d]' : 'bg-white border-slate-200'
              }`}>
                <h3 className={`text-lg font-bold flex items-center gap-2 transition-colors ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                  🛠️ Create Custom Game
                </h3>

                {/* Grid Size Selection */}
                <div className="space-y-2">
                  <label className={`text-xs font-semibold uppercase tracking-wider block transition-colors ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Grid & Tile Scale</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { size: 15, label: '15x15 (Standard)', tiles: '100 tiles • 7 rack' },
                      { size: 17, label: '17x17 Grid', tiles: '146 tiles • 8 rack' },
                      { size: 19, label: '19x19 Grid', tiles: '180 tiles • 9 rack' }
                    ].map(opt => {
                      const isActive = selectedGridSize === opt.size;
                      return (
                        <button
                          key={opt.size}
                          type="button"
                          onClick={() => setSelectedGridSize(opt.size)}
                          className={`p-3 rounded-xl border text-center transition flex flex-col justify-center items-center gap-1 ${
                            isActive
                              ? isDark
                                ? 'bg-slate-700 border-slate-500 text-white font-bold'
                                : 'bg-slate-200 border-slate-400 text-slate-900 font-bold'
                              : isDark
                                ? 'bg-[#111317] border-[#21252d] hover:border-slate-700 text-slate-400'
                                : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-500'
                          }`}
                        >
                          <span className="font-extrabold text-base">{opt.size}x{opt.size}</span>
                          <span className={`text-[9px] text-center leading-tight transition-colors ${
                            isActive
                              ? isDark ? 'text-slate-300' : 'text-slate-600'
                              : isDark ? 'text-slate-500' : 'text-slate-400'
                          }`}>{opt.tiles}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Additional Settings Toggles */}
                <div className={`space-y-3 p-4 rounded-xl border transition-colors ${
                  isDark ? 'bg-[#111317]/50 border-[#21252d]' : 'bg-slate-50 border-slate-200'
                }`}>
                  <label className={`text-xs font-semibold uppercase tracking-wider block mb-1 transition-colors ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}>Permitted Directions</label>

                  <label className={`flex items-center justify-between p-1 rounded-lg cursor-pointer transition ${
                    isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-200/40'
                  }`}>
                    <span className="text-sm font-medium">Diagonal Placement</span>
                    <input
                      type="checkbox"
                      checked={diagonalAllowed}
                      onChange={(e) => setDiagonalAllowed(e.target.checked)}
                      className="accent-slate-500 h-4 w-4"
                    />
                  </label>

                  <label className={`flex items-center justify-between p-1 rounded-lg cursor-pointer transition ${
                    isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-200/40'
                  }`}>
                    <span className="text-sm font-medium">Backwards Spelling</span>
                    <input
                      type="checkbox"
                      checked={backwardsAllowed}
                      onChange={(e) => setBackwardsAllowed(e.target.checked)}
                      className="accent-slate-500 h-4 w-4"
                    />
                  </label>

                  <label className={`flex items-center justify-between p-1 rounded-lg cursor-pointer transition ${
                    isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-200/40'
                  }`}>
                    <span className="text-sm font-medium">Diagonal & Backwards</span>
                    <input
                      type="checkbox"
                      checked={diagonalBackwardsAllowed}
                      onChange={(e) => setDiagonalBackwardsAllowed(e.target.checked)}
                      className="accent-slate-500 h-4 w-4"
                    />
                  </label>
                </div>

                <div className="space-y-2">
                  <label className={`text-xs font-semibold uppercase tracking-wider block transition-colors ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}>Turn Timer</label>
                  <div className={`p-4 rounded-xl border flex flex-col gap-3 transition-colors ${
                    isDark ? 'bg-[#111317]/50 border-[#21252d]' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <label className={`flex items-center justify-between cursor-pointer transition ${
                      isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-200/40'
                    }`}>
                      <span className="text-sm font-medium">Enable Timer</span>
                      <input
                        type="checkbox"
                        checked={timerEnabled}
                        onChange={(e) => setTimerEnabled(e.target.checked)}
                        className="accent-slate-500 h-4 w-4"
                      />
                    </label>
                    {timerEnabled && (
                      <div className="flex items-center justify-between pt-2 border-t border-slate-700/30">
                        <span className="text-sm font-medium">Seconds (15-300):</span>
                        <input
                          type="number"
                          min="15"
                          max="300"
                          value={timerDuration}
                          onChange={(e) => {
                            let val = parseInt(e.target.value, 10);
                            if (isNaN(val)) val = 15;
                            // We allow typing without strict bounds on every keystroke, but we'll clamp it on blur or let standard validation handle it.
                            // Actually it's better to just clamp it on change or let HTML min/max handle it.
                            setTimerDuration(val);
                          }}
                          onBlur={(e) => {
                            let val = parseInt(e.target.value, 10);
                            if (isNaN(val) || val < 15) setTimerDuration(15);
                            else if (val > 300) setTimerDuration(300);
                          }}
                          className={`text-sm rounded-lg p-1.5 border font-bold w-20 text-center ${
                            isDark ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-800'
                          }`}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className={`text-xs font-semibold uppercase tracking-wider block transition-colors ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}>Player Count</label>
                  <div className={`flex items-center justify-between p-3 rounded-xl border transition-colors cursor-pointer ${
                    isDark ? 'bg-[#111317] border-[#21252d]' : 'bg-slate-50 border-slate-200'
                  }`} onClick={() => setThreePlayerMode(!threePlayerMode)}>
                    <span className={`text-sm font-bold flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                      👥 3-Player Mode
                    </span>
                    <input
                      type="checkbox"
                      checked={threePlayerMode}
                      onChange={(e) => setThreePlayerMode(e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      className="accent-slate-500 h-4 w-4"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className={`text-xs font-semibold uppercase tracking-wider block transition-colors ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}>Tile Distribution</label>
                  <div className={`flex items-center justify-between p-3 rounded-xl border transition-colors cursor-pointer ${
                    isDark ? 'bg-[#111317] border-[#21252d]' : 'bg-slate-50 border-slate-200'
                  }`} onClick={() => setEvenDistributionMode(!evenDistributionMode)}>
                    <span className={`text-sm font-bold flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                      ⚖️ Even Distribution
                    </span>
                    <input
                      type="checkbox"
                      checked={evenDistributionMode}
                      onChange={(e) => setEvenDistributionMode(e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      className="accent-slate-500 h-4 w-4"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className={`flex items-center justify-between p-3 rounded-xl border transition-colors cursor-pointer ${
                    isDark ? 'bg-[#111317] border-[#21252d]' : 'bg-slate-50 border-slate-200'
                  }`} onClick={() => setHandicapEnabled(!handicapEnabled)}>
                    <span className={`text-sm font-bold flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                      🎁 Handicap Mode
                    </span>
                    <input
                      type="checkbox"
                      checked={handicapEnabled}
                      onChange={(e) => setHandicapEnabled(e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      className="accent-slate-500 h-4 w-4"
                    />
                  </div>

                  {handicapEnabled && (
                    <div className={`p-4 rounded-xl border space-y-3 transition-colors ${
                      isDark ? 'bg-[#111317]/50 border-[#21252d]' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Player 1:</span>
                        <input
                          type="number"
                          min="0"
                          max="1000"
                          value={handicapP1}
                          onChange={(e) => setHandicapP1(Math.min(1000, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                          className={`text-xs rounded-lg p-1.5 border font-bold w-20 text-center ${
                            isDark ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-800'
                          }`}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Player 2:</span>
                        <input
                          type="number"
                          min="0"
                          max="1000"
                          value={handicapP2}
                          onChange={(e) => setHandicapP2(Math.min(1000, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                          className={`text-xs rounded-lg p-1.5 border font-bold w-20 text-center ${
                            isDark ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-800'
                          }`}
                        />
                      </div>
                      {threePlayerMode && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Player 3:</span>
                          <input
                            type="number"
                            min="0"
                            max="1000"
                            value={handicapP3}
                            onChange={(e) => setHandicapP3(Math.min(1000, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                            className={`text-xs rounded-lg p-1.5 border font-bold w-20 text-center ${
                              isDark ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-800'
                            }`}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className={`text-xs font-semibold uppercase tracking-wider block transition-colors ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}>Spell Check Mode</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setValidationMode('manual')}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition ${
                        validationMode === 'manual'
                          ? isDark ? 'bg-slate-700 border-slate-500 text-white' : 'bg-slate-200 border-slate-400 text-slate-800'
                          : isDark ? 'bg-[#111317] border-[#21252d] text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}
                    >
                      🗣️ Self-Judge Mode (Default)
                    </button>
                    <button
                      type="button"
                      onClick={() => setValidationMode('strict')}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition ${
                        validationMode === 'strict'
                          ? isDark ? 'bg-slate-700 border-slate-500 text-white' : 'bg-slate-200 border-slate-400 text-slate-800'
                          : isDark ? 'bg-[#111317] border-[#21252d] text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}
                      title="Checks placed words against official dictionary API"
                    >
                      📚 Auto-Check Strict
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleCreateRoom(selectedGridSize, {
                    diagonalAllowed,
                    backwardsAllowed,
                    diagonalBackwardsAllowed,
                    validationMode,
                    timerEnabled,
                    timerDuration,
                    threePlayerMode,
                    evenDistributionMode,
                    handicapEnabled,
                    handicaps: [handicapP1, handicapP2, handicapP3]
                  })}
                  className={`w-full font-black text-sm py-3 px-4 rounded-xl shadow-lg transition active:scale-[0.98] border ${
                    isDark 
                      ? 'bg-slate-200 hover:bg-slate-300 border-slate-300 text-slate-900' 
                      : 'bg-slate-200 hover:bg-slate-300 border-slate-300 text-slate-950'
                  }`}
                >
                  Create Lobby & Wait
                </button>
              </div>

              {/* Join Existing Card */}
              <div className={`border p-6 rounded-2xl shadow-xl space-y-4 transition-colors ${
                isDark ? 'bg-[#15181d] border-[#21252d]' : 'bg-white border-slate-200'
              }`}>
                <h3 className={`text-lg font-bold flex items-center gap-2 transition-colors ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                  🎮 Join Existing Game
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter Room Code (e.g. J9FX4)"
                    className={`flex-1 focus:outline-none rounded-xl py-3 px-4 uppercase font-black text-center tracking-widest placeholder:normal-case placeholder:font-normal transition-colors border ${
                      isDark 
                        ? 'bg-[#111317] border-[#21252d] hover:border-slate-700 focus:border-slate-500 text-slate-300 placeholder:text-slate-500' 
                        : 'bg-slate-50 border-slate-200 hover:border-slate-300 focus:border-slate-400 text-slate-800 placeholder:text-slate-400'
                    }`}
                    value={joinInput}
                    onChange={(e) => setJoinInput(e.target.value)}
                  />
                  <button
                    onClick={() => handleJoinRoom(joinInput)}
                    className={`font-black px-6 py-3 rounded-xl shadow-md transition active:scale-[0.98] border ${
                      isDark 
                        ? 'bg-slate-200 hover:bg-slate-300 border-slate-300 text-slate-900' 
                        : 'bg-slate-200 hover:bg-slate-300 border-slate-300 text-slate-950'
                    }`}
                  >
                    Join
                  </button>
                </div>
              </div>

            </div>
          </div>
        ) : (
          /* --- ACTIVE GAMEPLAY VIEW --- */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

            {/* Left Column: Board and Player Controls (8 Cols) */}
            <div className="lg:col-span-8 space-y-4 flex flex-col items-center">

              {/* Game Info Bar */}
              <div className={`w-full p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl border transition-all duration-300 ${
                shouldFlashRed
                  ? isDark ? 'bg-[#7f1d1d] border-[#991b1b]' : 'bg-[#fee2e2] border-[#fca5a5]'
                  : isDark ? 'bg-[#15181d] border-[#21252d]' : 'bg-white border-slate-200'
              }`}>

                {/* Share Room Info */}
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-colors ${
                  isDark ? 'bg-[#111317] border-[#21252d]' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Room Code:</span>
                  <span className={`font-extrabold text-sm tracking-wider ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{roomId}</span>
                  <button
                    onClick={copyRoomIdToClipboard}
                    className="p-1 hover:bg-slate-850 rounded text-slate-400 hover:text-slate-600 transition"
                    title="Copy Room ID"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 002 2h2a2 2 0 002-2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                  </button>
                </div>

                {/* Match Status / Turn indicator */}
                <div className="flex items-center gap-3">
                  {roomData.status === 'playing' ? (
                    <div className="flex items-center gap-2">
                      <div className={`px-4 py-2 rounded-xl border text-sm font-bold flex items-center gap-2 transition-colors ${
                        isMyTurn
                          ? isDark
                            ? 'bg-slate-800 border-slate-600 text-white animate-pulse'
                            : 'bg-amber-50 border-amber-300 text-amber-850 animate-pulse'
                          : isDark
                            ? 'bg-[#111317] border-[#21252d] text-slate-400'
                            : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${
                          isMyTurn 
                            ? isDark ? 'bg-slate-300' : 'bg-amber-500' 
                            : isDark ? 'bg-slate-600' : 'bg-slate-400'
                        }`}></span>
                        {isMyTurn ? "Your Turn!" : `${roomData.players[roomData.activePlayerId]?.name || "Opponent"}'s Turn`}
                      </div>
                      
                      {roomData.timerEnabled && (
                        <div className={`px-3 py-2 rounded-xl border text-sm font-bold flex items-center gap-2 transition-colors ${
                          isDark ? 'bg-[#111317] border-[#21252d] text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}>
                          ⏳ {remainingTime}s
                        </div>
                      )}
                    </div>
                  ) : roomData.status === 'finished' ? (
                    <div className={`px-4 py-2 rounded-xl border text-sm font-black flex items-center gap-2 transition-colors shadow-lg ${
                      isDark ? 'bg-indigo-900 border-indigo-700 text-indigo-100' : 'bg-indigo-100 border-indigo-300 text-indigo-800'
                    }`}>
                      🏆 GAME OVER
                    </div>
                  ) : (
                    <div className={`border px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                      isDark ? 'bg-[#111317] border-[#21252d] text-rose-400' : 'bg-rose-50 border-rose-200 text-rose-600'
                    }`}>
                      Game Waiting
                    </div>
                  )}
                </div>

                {/* Grid Zoom Scale Controls */}
                <div className={`flex items-center gap-1 p-1 rounded-xl border transition-colors ${
                  isDark ? 'bg-[#111317] border-[#21252d]' : 'bg-slate-50 border-slate-200'
                }`}>
                  <button
                    onClick={() => setBoardZoom(Math.max(0.6, boardZoom - 0.1))}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg font-bold text-sm transition ${
                      isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-200 text-slate-700'
                    }`}
                    title="Zoom Out"
                  >
                    A-
                  </button>
                  <button
                    onClick={() => setBoardZoom(1)}
                    className={`px-2 py-1 text-[11px] font-medium transition ${
                      isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-450 hover:text-slate-700'
                    }`}
                    title="Reset Zoom"
                  >
                    100%
                  </button>
                  <button
                    onClick={() => setBoardZoom(Math.min(1.4, boardZoom + 0.1))}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg font-bold text-sm transition ${
                      isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-200 text-slate-700'
                    }`}
                    title="Zoom In"
                  >
                    A+
                  </button>
                </div>

              </div>

              {/* Interactive Scrabble Board Display */}
              <div className={`w-full p-1.5 md:p-6 rounded-2xl shadow-2xl overflow-auto flex justify-start md:justify-center border transition-colors ${
                isDark ? 'bg-[#15181d] border-[#21252d]' : 'bg-white border-slate-200'
              }`}>
                <div className={`select-none p-1.5 md:p-2 rounded-xl border transition-colors ${
                  isDark ? 'bg-[#111317] border-slate-900' : 'bg-slate-200 border-slate-300'
                }`}>
                  <div
                    className="grid"
                    style={{
                      gap: isMobile ? '2px' : '4px',
                      gridTemplateColumns: `repeat(${roomData.gridSize}, ${cellSize}px)`,
                      gridTemplateRows: `repeat(${roomData.gridSize}, ${cellSize}px)`
                    }}
                  >
                    {Array.from({ length: roomData.gridSize }).map((_, r) => (
                      Array.from({ length: roomData.gridSize }).map((_, c) => {
                        const key = `${r},${c}`;
                        const permTile = roomData.board[key];
                        const tempTile = tentativePlaced[key];
                        const bonus = getBonus(r, c, roomData.gridSize);

                        // Layout styling for special squares
                        let cellBg = '';
                        let cellLabel = '';

                        if (isDark) {
                          cellBg = 'bg-[#262a33] hover:bg-[#2e333e] border border-[#323743] text-slate-400';
                          if (bonus === 'TW') {
                            cellBg = 'bg-[#782b2b] border border-[#8f3636] text-[#e2b4b4]';
                            cellLabel = 'TW';
                          } else if (bonus === 'DW') {
                            cellBg = 'bg-[#914d4d] border border-[#a85b5b] text-[#eed3d3]';
                            cellLabel = 'DW';
                          } else if (bonus === 'TL') {
                            cellBg = 'bg-[#162d4c] border border-[#203c62] text-[#a8c0e0]';
                            cellLabel = 'TL';
                          } else if (bonus === 'DL') {
                            cellBg = 'bg-[#26415a] border border-[#335372] text-[#bcd5eb]';
                            cellLabel = 'DL';
                          } else if (bonus === 'star') {
                            cellBg = 'bg-[#914d4d] border border-[#a85b5b] text-[#eed3d3]';
                            cellLabel = '★';
                          }
                        } else {
                          // Light theme classic pastel/bright Scrabble board styling
                          cellBg = 'bg-[#f8fafc] hover:bg-[#cbd5e1]/40 border border-slate-300 text-slate-400';
                          if (bonus === 'TW') {
                            cellBg = 'bg-[#f43f5e] border border-[#fda4af] text-white';
                            cellLabel = 'TW';
                          } else if (bonus === 'DW') {
                            cellBg = 'bg-[#fda4af] border border-[#fecdd3] text-[#881337]';
                            cellLabel = 'DW';
                          } else if (bonus === 'TL') {
                            cellBg = 'bg-[#2563eb] border border-[#93c5fd] text-white';
                            cellLabel = 'TL';
                          } else if (bonus === 'DL') {
                            cellBg = 'bg-[#7dd3fc] border border-[#bae6fd] text-[#0c4a6e]';
                            cellLabel = 'DL';
                          } else if (bonus === 'star') {
                            cellBg = 'bg-[#fda4af] border border-[#fecdd3] text-[#881337]';
                            cellLabel = '★';
                          }
                        }

                        return (
                          <div
                            key={key}
                            onClick={() => {
                              if (tempTile) {
                                removeTentativeTile(r, c);
                              } else {
                                placeTileOnBoard(r, c);
                              }
                            }}
                            className={`rounded-md cursor-pointer flex flex-col items-center justify-center relative transition transform duration-150 shadow-sm ${cellBg}`}
                            style={{ width: `${cellSize}px`, height: `${cellSize}px` }}
                          >
                            {/* Render permanent tile */}
                            {permTile && (
                              <div 
                                className="absolute inset-0 bg-[#d7be8a] border border-[#bfa573] rounded-sm text-[#2d2008] flex flex-col items-center justify-center font-extrabold shadow scale-[0.96]"
                                style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}
                              >
                                <span className={`leading-none ${permTile.isBlank ? 'italic' : ''}`} style={{ fontSize: `${cellSize * 0.55}px` }}>{permTile.letter}</span>
                                <span className="absolute font-bold leading-none" style={{ fontSize: `${cellSize * 0.24}px`, bottom: `${cellSize * 0.06}px`, right: `${cellSize * 0.06}px` }}>{permTile.score}</span>
                                {permTile.isBlank && <span className="absolute bg-amber-500 rounded-full ring-1 ring-white/30" style={{ top: `${cellSize * 0.06}px`, right: `${cellSize * 0.06}px`, width: `${cellSize * 0.14}px`, height: `${cellSize * 0.14}px` }} title="Blank representation" />}
                              </div>
                            )}

                            {/* Render tentative tile */}
                            {tempTile && (
                              <div 
                                className="absolute inset-0 bg-[#e3cb98] border-2 border-amber-500 rounded-sm text-[#2d2008] flex flex-col items-center justify-center font-extrabold shadow scale-[0.96] ring-1 ring-[#4f5666]"
                                style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}
                              >
                                <span className={`leading-none ${tempTile.isBlank ? 'italic' : ''}`} style={{ fontSize: `${cellSize * 0.55}px` }}>{tempTile.letter}</span>
                                <span className="absolute font-bold leading-none" style={{ fontSize: `${cellSize * 0.24}px`, bottom: `${cellSize * 0.06}px`, right: `${cellSize * 0.06}px` }}>{tempTile.score}</span>
                                {tempTile.isBlank && <span className="absolute bg-amber-500 rounded-full ring-1 ring-white/30" style={{ top: `${cellSize * 0.06}px`, right: `${cellSize * 0.06}px`, width: `${cellSize * 0.14}px`, height: `${cellSize * 0.14}px` }} />}
                              </div>
                            )}

                            {/* Render default bonus label if empty */}
                            {!permTile && !tempTile && (
                              <span className="font-black tracking-tighter" style={{ fontSize: `${cellSize * 0.32}px` }}>{cellLabel}</span>
                            )}
                          </div>
                        );
                      })
                    ))}
                  </div>
                </div>
              </div>

              {/* Rack Controls Section */}
              <div className={`w-full border p-4 md:p-6 rounded-2xl shadow-xl space-y-4 transition-colors ${
                isDark ? 'bg-[#15181d] border-[#21252d]' : 'bg-white border-slate-200'
              }`}>

                {/* Rack Tiles */}
                <div className="flex flex-col items-center gap-3">
                  <span className={`text-xs font-semibold uppercase tracking-widest block transition-colors ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {exchangeMode ? "Select Tiles to Exchange" : "Your Tile Rack"}
                  </span>

                  <div className={`flex items-center gap-2 md:gap-3 p-3 rounded-2xl border shadow-inner max-w-full overflow-x-auto transition-all duration-300 ${
                    shouldFlashRed
                      ? isDark ? 'bg-[#7f1d1d] border-[#991b1b]' : 'bg-[#fee2e2] border-[#fca5a5]'
                      : isDark ? 'bg-[#111317] border-[#21252d]' : 'bg-slate-100 border-slate-200'
                  }`}>
                    {me?.rack.map((tile, idx) => {
                      // Check if tile is tentatively placed on the board right now
                      const isPlaced = Object.values(tentativePlaced).some(t => t.id === tile.id);
                      const isSelectedExchange = selectedExchangeIds.includes(tile.id);

                      return (
                        <button
                          key={tile.id}
                          disabled={isPlaced && !exchangeMode}
                          onClick={() => selectRackTile(idx)}
                          style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}
                          className={`w-10 h-12 md:w-12 md:h-14 shrink-0 rounded-sm flex flex-col items-center justify-center relative font-extrabold shadow transition transform active:scale-95 ${
                            isPlaced
                              ? isDark
                                ? 'opacity-20 cursor-not-allowed bg-[#1f232b] border border-dashed border-[#2a2e37]'
                                : 'opacity-20 cursor-not-allowed bg-slate-200 border border-dashed border-slate-350'
                              : isSelectedExchange
                                ? 'bg-[#782b2b] border-2 border-[#8f3636] text-white scale-105'
                                : selectedRackTile === idx
                                  ? 'bg-[#e3cb98] border-2 border-amber-500 text-[#2d2008] -translate-y-2 ring-4 ring-amber-500/30'
                                  : 'bg-[#d7be8a] text-[#2d2008] border border-[#bfa573] hover:bg-[#e3cb98]'
                          }`}
                        >
                          <span className="text-lg md:text-xl leading-none font-extrabold">{tile.letter === '_' ? '' : tile.letter}</span>
                          <span className="absolute bottom-1 right-1 text-[9px] md:text-[10px] leading-none font-bold">{tile.score}</span>

                          {/* Indicator for blanks */}
                          {tile.letter === '_' && (
                            <span className="absolute top-1 left-1.5 w-2.5 h-2.5 rounded-full bg-amber-500 ring-1 ring-white/30" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Score Summary of Pending Play */}
                {Object.keys(tentativePlaced).length > 0 && scoreReport && (
                  <div className={`p-4 rounded-xl flex flex-col gap-2 border transition-all duration-300 ${
                    (coloursEnabled && hasValidWord)
                      ? isDark ? 'bg-[#064e3b]/30 border-[#059669]/30' : 'bg-[#f0fdf4] border-[#bbf7d0]'
                      : isDark ? 'bg-[#111317]/80 border-[#21252d]' : 'bg-slate-50 border-slate-200 shadow-inner'
                  }`}>
                    <div className="flex justify-between items-center text-sm">
                      <span className={`font-bold flex items-center gap-1.5 transition-colors ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                        <span>📝 Words formed:</span>
                        {scoreReport.words.map((w, i) => {
                          const valid = isWordValid(w);
                          return (
                            <span key={i} className={`px-2 py-0.5 rounded text-xs font-mono transition-all duration-200 border ${
                              (coloursEnabled && valid)
                                ? isDark ? 'bg-[#14532d] text-[#4ade80] border-[#16a34a]/30' : 'bg-[#dcfce7] text-[#15803d] border-[#bbf7d0]'
                                : isDark ? 'bg-slate-800 border-transparent text-white' : 'bg-slate-200 border-transparent text-slate-805'
                            }`}>
                              {w.forwardWord} ({w.score} pts)
                              {(roomData.backwardsAllowed || roomData.diagonalBackwardsAllowed) && w.forwardWord !== w.backwardWord && ` / ${w.backwardWord}`}
                            </span>
                          );
                        })}
                      </span>
                      <span className={`font-extrabold text-base transition-colors ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        +{scoreReport.totalScore} pts
                      </span>
                    </div>
                    {scoreReport.bingoBonus > 0 && (
                      <div className="text-xs text-[#4ade80] font-bold">
                        🔥 BINGO BONUS! Used all {roomData.rackSize} tiles! (+{scoreReport.bingoBonus} pts)
                      </div>
                    )}
                    {scoreReport.error && (
                      <div className="text-xs text-rose-455">
                        ❌ Invalid layout: {scoreReport.error}
                      </div>
                    )}
                  </div>
                )}

                {/* Buttons controls */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-2">

                  {/* Exchange mode trigger */}
                  {!exchangeMode ? (
                    <button
                      type="button"
                      onFocus={(e) => e.target.blur()}
                      disabled={roomData?.status === 'finished'}
                      onClick={() => {
                        setExchangeMode(true);
                        setSelectedExchangeIds([]);
                        setSelectedRackTile(null);
                      }}
                      className={`font-bold py-2.5 px-3 rounded-xl text-xs transition border ${
                        isDark 
                          ? 'bg-slate-600 hover:bg-slate-500 text-white border-slate-500' 
                          : 'bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300'
                      }`}
                    >
                      🔄 Exchange Tiles
                    </button>
                  ) : (
                    <div className="col-span-2 md:col-span-1 flex gap-1">
                      <button
                        type="button"
                        onFocus={(e) => e.target.blur()}
                        onClick={handleExchangeTiles}
                        className={`flex-1 font-bold py-2.5 px-2 rounded-xl text-xs transition border ${
                          isDark 
                            ? 'bg-[#782b2b] hover:bg-[#8f3636] border-[#8f3636] text-white' 
                            : 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700'
                        }`}
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onFocus={(e) => e.target.blur()}
                        onClick={() => {
                          setExchangeMode(false);
                          setSelectedExchangeIds([]);
                        }}
                        className={`font-bold px-3 py-2.5 rounded-xl text-xs transition border ${
                          isDark 
                            ? 'bg-slate-600 hover:bg-slate-500 text-white border-slate-500' 
                            : 'bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300'
                        }`}
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onFocus={(e) => e.target.blur()}
                    onClick={shuffleRack}
                    disabled={roomData?.status === 'finished'}
                    className={`font-bold py-2.5 px-3 rounded-xl text-xs transition border ${
                      isDark 
                        ? 'bg-slate-600 hover:bg-slate-500 text-white border-slate-500 disabled:bg-slate-800 disabled:border-slate-700 disabled:text-slate-500' 
                        : 'bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    🔀 Shuffle Rack
                  </button>

                  <button
                    type="button"
                    onFocus={(e) => e.target.blur()}
                    onClick={recallAllTentative}
                    disabled={Object.keys(tentativePlaced).length === 0 || roomData?.status === 'finished'}
                    className={`font-bold py-2.5 px-3 rounded-xl text-xs transition border ${
                      isDark 
                        ? 'bg-slate-600 hover:bg-slate-500 text-white border-slate-500 disabled:bg-slate-800 disabled:border-slate-700 disabled:text-slate-500' 
                        : 'bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    ↩️ Recall All
                  </button>

                  <button
                    type="button"
                    onFocus={(e) => e.target.blur()}
                    onClick={handlePassTurn}
                    disabled={!isMyTurn || roomData?.status === 'finished'}
                    className={`font-bold py-2.5 px-3 rounded-xl text-xs transition border ${
                      isDark 
                        ? 'bg-slate-600 hover:bg-slate-500 text-white border-slate-500 disabled:bg-slate-800 disabled:border-slate-700 disabled:text-slate-500' 
                        : 'bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400'
                    } disabled:opacity-50`}
                  >
                    ⏭️ Pass Turn
                  </button>

                  <button
                    type="button"
                    onFocus={(e) => e.target.blur()}
                    onClick={handlePlayTurn}
                    disabled={!isMyTurn || Object.keys(tentativePlaced).length === 0 || roomData?.status === 'finished'}
                    className={`col-span-2 md:col-span-1 font-black py-2.5 px-3 rounded-xl text-xs shadow-lg transition active:scale-95 border ${
                      isDark 
                        ? 'bg-slate-300 hover:bg-slate-200 text-slate-955 border-slate-400 disabled:bg-slate-800 disabled:border-slate-700 disabled:text-slate-550' 
                        : 'bg-slate-200 hover:bg-slate-300 text-slate-955 border-slate-300 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-455'
                    } disabled:shadow-none disabled:opacity-50`}
                  >
                    🚀 Play Word
                  </button>
                </div>

              </div>

              {/* Interactive endgame visual scorecard */}
              {roomData.status === 'finished' && (
                <div className={`border p-5 rounded-2xl shadow-xl space-y-4 border-indigo-500/40 bg-indigo-950/20 backdrop-blur transition-all duration-300`}>
                  <h3 className="text-base font-extrabold text-indigo-400 flex items-center gap-2">
                    🏆 Final Game Scorecard
                  </h3>
                  <div className="space-y-2">
                    {Object.values(roomData.players).sort((a, b) => b.score - a.score).map((p, idx) => (
                      <div key={p.uid} className="flex justify-between items-center bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-300">{idx + 1}. {p.name}</span>
                          {idx === 0 && <span className="text-xs">👑</span>}
                        </div>
                        <span className="text-sm font-black text-indigo-300">{p.score} pts</span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Turn-by-Turn Recap</h4>
                    <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 text-[11px] font-mono leading-relaxed text-slate-300">
                      {roomData.history.filter(h => ['turn', 'pass', 'exchange'].includes(h.type)).map((item, idx) => {
                        if (item.type === 'turn') {
                          const wordsStr = (item.words || []).map(w => `"${w.word}"`).join(', ');
                          return (
                            <div key={item.id || idx}>
                              <span className="text-indigo-400 font-bold">{item.playerName}</span>: played {wordsStr || 'word'} for <span className="text-emerald-400 font-bold">{item.points} pts</span>
                            </div>
                          );
                        } else if (item.type === 'pass') {
                          return (
                            <div key={item.id || idx} className="text-slate-500">
                              <span className="text-indigo-400 font-bold">{item.playerName}</span>: skipped
                            </div>
                          );
                        } else if (item.type === 'exchange') {
                          return (
                            <div key={item.id || idx} className="text-slate-500">
                              <span className="text-indigo-400 font-bold">{item.playerName}</span>: exchanged tiles
                            </div>
                          );
                        }
                        return null;
                      })}
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Right Column: Game Metadata & Chat Panel (4 Cols) */}
            <div className="lg:col-span-4 space-y-6">

              {/* Scoreboard Card */}
              <div className={`border p-5 rounded-2xl shadow-xl space-y-4 transition-colors ${
                isDark ? 'bg-[#15181d] border-[#21252d]' : 'bg-white border-slate-200'
              }`}>
                <h3 className={`text-sm font-bold uppercase tracking-widest transition-colors ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Scoreboard</h3>
                <div className="space-y-3">
                  <div className={`p-4 rounded-xl border flex items-center justify-between transition ${
                    roomData.activePlayerId === user.uid
                      ? isDark
                        ? 'bg-slate-850 border-slate-700 ring-1 ring-slate-550/20'
                        : 'bg-amber-50 border-amber-300 ring-1 ring-amber-400/20'
                      : isDark
                        ? 'bg-[#111317] border-[#21252d]'
                        : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`font-extrabold transition-colors ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{username} (You)</span>
                        <span className="text-[10px] bg-[#21252d]/50 px-1.5 py-0.5 rounded text-[#94a3b8]">A</span>
                      </div>
                      <p className={`text-xs mt-1 transition-colors ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Remaining Tiles: {me?.deck.length}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-2xl font-black transition-colors ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{me?.score}</span>
                      <span className={`text-xs block transition-colors ${isDark ? 'text-slate-550' : 'text-slate-400'}`}>pts</span>
                    </div>
                  </div>

                  {roomData.playerOrder.filter(id => id !== user.uid).map((oppId, idx) => {
                    const opp = roomData.players[oppId];
                    if (!opp) return null;
                    const letterBadge = idx === 0 ? 'B' : 'C';
                    const badgeBg = idx === 0 ? 'bg-[#571c1c]/50 text-[#fca5a5]' : 'bg-[#1c5741]/50 text-[#a5fcd2]';
                    return (
                      <div key={oppId} className={`p-4 rounded-xl border flex items-center justify-between transition ${
                        roomData.activePlayerId === oppId
                          ? isDark
                            ? 'bg-slate-850 border-slate-700 ring-1 ring-slate-550/20'
                            : 'bg-amber-50 border-amber-300 ring-1 ring-amber-400/20'
                          : isDark
                            ? 'bg-[#111317] border-[#21252d]'
                            : 'bg-slate-50 border-slate-200'
                      }`}>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`font-extrabold transition-colors ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{opp.name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${badgeBg}`}>{letterBadge}</span>
                          </div>
                          <p className={`text-xs mt-1 transition-colors ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Remaining Tiles: {opp.deck.length}</p>
                        </div>
                        <div className="text-right">
                          <span className={`text-2xl font-black transition-colors ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{opp.score}</span>
                          <span className={`text-xs block transition-colors ${isDark ? 'text-slate-550' : 'text-slate-400'}`}>pts</span>
                        </div>
                      </div>
                    );
                  })}
                  
                  {roomData.playerOrder.length < (roomData.maxPlayers || 2) && (
                    <div className={`border p-4 rounded-xl text-center text-xs transition-colors ${
                      isDark ? 'bg-[#111317]/50 border-dashed border-[#21252d] text-slate-500' : 'bg-slate-50 border-dashed border-slate-250 text-slate-400'
                    }`}>
                      Waiting for opponents...
                    </div>
                  )}

                  {/* Remaining Tiles Section */}
                  <div className={`p-4 rounded-xl border transition ${
                    isDark ? 'bg-[#111317] border-[#21252d]' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-bold uppercase tracking-wider transition-colors ${isDark ? 'text-slate-400' : 'text-slate-550'}`}>
                        Remaining Tiles ({Object.values(remainingCounts).reduce((a, b) => a + b, 0)})
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                      {sortedLetters.map(letter => (
                        <div 
                          key={letter}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 border ${
                            isDark 
                              ? 'bg-[#15181d] border-[#21252d] text-slate-300' 
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          <span className={letter === '?' ? 'text-amber-500 font-extrabold' : (isDark ? 'text-slate-400' : 'text-slate-500')}>{letter}</span>
                          <span className={isDark ? 'text-slate-200' : 'text-slate-900'}>{remainingCounts[letter]}</span>
                        </div>
                      ))}
                      {sortedLetters.length === 0 && (
                        <span className="text-xs text-slate-500 italic">No remaining tiles</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* In-Game Live Word Verification Helper Tool */}
              <div className={`border p-4 rounded-2xl shadow-xl space-y-3 transition-colors ${
                isDark ? 'bg-[#15181d] border-[#21252d]' : 'bg-white border-slate-200'
              }`}>
                <h3 className={`text-sm font-bold uppercase tracking-widest transition-colors ${isDark ? 'text-slate-400' : 'text-slate-505'}`}>📚 SOWPODS Dictionary Lookup</h3>
                <form onSubmit={handleDictCheck} className="flex gap-2">
                  <input
                    type="text"
                    value={dictWord}
                    onChange={(e) => setDictWord(e.target.value)}
                    placeholder="Check any word..."
                    className={`flex-1 focus:outline-none rounded-xl py-1.5 px-3 text-xs font-mono transition-colors border ${
                      isDark 
                        ? 'bg-[#111317] border-[#21252d] hover:border-slate-700 focus:border-slate-500 text-slate-300' 
                        : 'bg-slate-50 border-slate-200 hover:border-slate-350 focus:border-slate-400 text-slate-800'
                    }`}
                  />
                  <button
                    type="submit"
                    className={`font-black text-xs px-4 rounded-xl transition border ${
                      isDark 
                        ? 'bg-slate-300 hover:bg-slate-200 border-slate-400 text-slate-900' 
                        : 'bg-slate-200 hover:bg-slate-300 border-slate-300 text-slate-900'
                    }`}
                  >
                    {dictChecking ? '...' : 'Verify'}
                  </button>
                </form>

                {dictResult && (
                  <div className="space-y-2">
                    <div className={`p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between border ${
                      dictResult.valid
                        ? isDark 
                          ? 'bg-[#132a1d]/50 border-[#1d422b]/60 text-emerald-300' 
                          : 'bg-emerald-50 border-emerald-250 text-emerald-700'
                        : isDark 
                          ? 'bg-[#2a1313]/50 border-[#421d1d]/60 text-rose-350' 
                          : 'bg-rose-50 border-rose-250 text-rose-700'
                    }`}>
                      <span>"{dictResult.word.toUpperCase()}" {dictResult.valid ? 'is a VALID English Word ✅' : 'is NOT in Dictionary ❌'}</span>
                    </div>
                    {dictResult.valid && dictResult.definition && (
                      <div className={`p-2 rounded-lg text-xs italic border ${
                        isDark ? 'bg-slate-800/50 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'
                      }`}>
                        <strong>Def:</strong> {dictResult.definition}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Real-time Log & History Actions */}
              <div className={`border p-4 rounded-2xl shadow-xl space-y-3 transition-colors ${
                isDark ? 'bg-[#15181d] border-[#21252d]' : 'bg-white border-slate-200'
              }`}>
                <h3 className={`text-sm font-bold uppercase tracking-widest transition-colors ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>📜 Game Play Log</h3>
                <div className={`h-32 overflow-y-auto space-y-1.5 pr-1 text-[11px] font-mono border-t pt-2 transition-colors ${
                  isDark ? 'border-slate-900' : 'border-slate-200'
                }`}>
                  {roomData.history?.slice().reverse().map((item, idx) => {
                    let color = isDark ? 'text-slate-400' : 'text-slate-600';
                    if (item.type === 'turn') color = isDark ? 'text-[#4ade80] font-semibold' : 'text-emerald-700 font-semibold';
                    if (item.type === 'pass') color = isDark ? 'text-slate-500' : 'text-slate-400';
                    if (item.type === 'exchange') color = isDark ? 'text-sky-400' : 'text-sky-700';
                    if (item.type === 'scorecard') color = isDark ? 'text-indigo-300 whitespace-pre border-t border-b border-indigo-900/50 py-2' : 'text-indigo-800 whitespace-pre border-t border-b border-indigo-100 py-2';

                    return (
                      <div key={item.id || idx} className={`${color} leading-tight`}>
                        {item.type === 'scorecard' ? (
                          item.message
                        ) : (
                          `[${new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}] ${item.message}`
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Chat Panel Box */}
              <div className={`border rounded-2xl shadow-xl flex flex-col h-64 overflow-hidden transition-colors ${
                isDark ? 'bg-[#15181d] border-[#21252d]' : 'bg-white border-slate-200'
              }`}>
                <div className={`border-b px-4 py-3 flex items-center justify-between transition-colors ${
                  isDark ? 'bg-[#111317] border-[#21252d]' : 'bg-slate-100 border-slate-200'
                }`}>
                  <h3 className={`text-sm font-bold uppercase tracking-widest transition-colors ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>💬 Room Chat</h3>
                </div>

                <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                  {(roomData.chat || []).length === 0 ? (
                    <p className={`text-xs italic text-center my-auto transition-colors ${isDark ? 'text-slate-650' : 'text-slate-400'}`}>No messages yet. Say hi!</p>
                  ) : (
                    roomData.chat.map((msg) => {
                      const isMe = msg.senderId === user.uid;
                      return (
                        <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                          <div className="flex items-baseline gap-1.5">
                            <span className={`text-[10px] font-bold transition-colors ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{msg.senderName}</span>
                            <span className={`text-[8px] transition-colors ${isDark ? 'text-slate-650' : 'text-slate-450'}`}>
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className={`mt-0.5 max-w-[85%] px-3 py-1.5 rounded-2xl text-xs leading-normal ${
                            isMe
                              ? isDark
                                ? 'bg-slate-300 text-slate-955 rounded-tr-none'
                                : 'bg-slate-205 text-slate-900 border border-slate-300 rounded-tr-none'
                              : isDark
                                ? 'bg-slate-800 text-slate-200 rounded-tl-none'
                                : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'
                          }`}>
                            {msg.text}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <form onSubmit={sendChatMessage} className={`border-t p-2 flex gap-2 transition-colors ${
                  isDark ? 'bg-[#111317] border-[#21252d]' : 'bg-slate-100 border-slate-200'
                }`}>
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type message..."
                    className={`flex-1 focus:outline-none rounded-xl py-2 px-3 text-xs transition-colors border ${
                      isDark 
                        ? 'bg-[#15181d] border-[#21252d] hover:border-slate-700 focus:border-slate-500' 
                        : 'bg-white border-slate-200 hover:border-slate-300 focus:border-slate-405 text-slate-800'
                    }`}
                    maxLength={150}
                  />
                  <button
                    type="submit"
                    className={`font-black text-xs px-4 rounded-xl transition border ${
                      isDark 
                        ? 'bg-slate-200 hover:bg-slate-300 border-slate-300 text-slate-900' 
                        : 'bg-slate-200 hover:bg-slate-300 border-slate-300 text-slate-950'
                    }`}
                  >
                    Send
                  </button>
                </form>
              </div>

              {/* Game Settings Display Card (moved to bottom) */}
              <div className={`border p-4 rounded-2xl text-xs space-y-2 transition-colors ${
                isDark ? 'bg-[#15181d] border-[#21252d]' : 'bg-white border-slate-200'
              }`}>
                <h4 className={`font-bold uppercase tracking-widest mb-1.5 transition-colors ${isDark ? 'text-slate-400' : 'text-slate-505'}`}>Game Settings</h4>
                <div className="grid grid-cols-2 gap-2 text-slate-350">
                  <div className={`p-2 rounded transition-colors ${isDark ? 'bg-[#111317]' : 'bg-slate-50 border border-slate-200'}`}>
                    <span className="text-slate-550 block">Grid Size:</span>
                    <span className={`font-extrabold transition-colors ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>{roomData.gridSize}x{roomData.gridSize}</span>
                  </div>
                  <div className={`p-2 rounded transition-colors ${isDark ? 'bg-[#111317]' : 'bg-slate-50 border border-slate-200'}`}>
                    <span className="text-slate-550 block">Rack Size:</span>
                    <span className={`font-extrabold transition-colors ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>{roomData.rackSize} tiles</span>
                  </div>
                  <div className={`p-2 rounded transition-colors ${isDark ? 'bg-[#111317]' : 'bg-slate-50 border border-slate-200'}`}>
                    <span className="text-slate-550 block">Diagonals:</span>
                    <span className={`font-extrabold transition-colors ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>{roomData.diagonalAllowed ? 'Allowed' : 'Disabled'}</span>
                  </div>
                  <div className={`p-2 rounded transition-colors ${isDark ? 'bg-[#111317]' : 'bg-slate-50 border border-slate-200'}`}>
                    <span className="text-slate-550 block">Backwards:</span>
                    <span className={`font-extrabold transition-colors ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>{roomData.backwardsAllowed ? 'Allowed' : (roomData.diagonalBackwardsAllowed ? 'Diag Only' : 'Disabled')}</span>
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}

      </main>

      {/* --- BLANK TILE CHARACTER SELECT MODAL --- */}
      {blankModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`p-6 rounded-2xl max-w-sm w-full space-y-4 shadow-2xl text-center border transition-colors ${
            isDark ? 'bg-[#15181d] border-[#21252d]' : 'bg-white border-slate-200'
          }`}>
            <h3 className={`text-base font-extrabold uppercase tracking-widest transition-colors ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              Choose Blank Tile Letter
            </h3>
            <p className={`text-xs transition-colors ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Select which character this blank tile represents. Its point value will remain 0.
            </p>

            <div className={`grid grid-cols-6 gap-1.5 justify-center max-h-48 overflow-y-auto p-2 rounded-xl transition-colors border ${
              isDark ? 'bg-[#111317]/60 border-[#21252d]' : 'bg-slate-100 border-slate-200'
            }`}>
              {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(char => (
                <button
                  key={char}
                  onClick={() => selectBlankLetter(char)}
                  className="bg-gradient-to-br from-amber-100 to-amber-200 hover:from-amber-200 hover:to-amber-300 border border-amber-300 text-[#2d2008] font-black py-2 rounded-lg text-sm transition transform active:scale-90"
                >
                  {char}
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                setBlankModalOpen(false);
                setPendingBlankCoords(null);
              }}
              className={`w-full py-2 rounded-xl text-xs font-bold transition border ${
                isDark 
                  ? 'bg-slate-700 hover:bg-slate-600 border-slate-600 text-white' 
                  : 'bg-slate-200 hover:bg-slate-300 border-slate-300 text-slate-800'
              }`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

    </div>
  );
}