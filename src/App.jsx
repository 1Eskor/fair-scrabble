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
const generateEvenDecks = (gridSize) => {
  // Let's create structured lists of tile configurations
  // We guarantee each player gets identical amounts of high points, blanks, S's, and balanced letters.

  let playerSpecials = []; // Individual high-scoring specials
  let playerBlanksCount = 0;
  let playerSCount = 0;
  let standardLettersPool = {};

  if (gridSize === 15) {
    // Standard 100 tiles total (50 per player)
    // High specials: Z (10), Q (10), X (8), J (8) -> 2 each randomly
    playerSpecials = ['Z', 'Q', 'X', 'J'];
    playerBlanksCount = 1; // 1 Blank each
    playerSCount = 2; // 2 S's each
    // Remaining balanced distribution of standard letters (90 tiles total -> 45 per player)
    standardLettersPool = {
      A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, K: 1, L: 4, M: 2,
      N: 6, O: 8, P: 2, R: 6, T: 6, U: 4, V: 2, W: 2, Y: 2
    };
  } else if (gridSize === 17) {
    // Medium-Large 130 tiles total (65 per player)
    // High specials: Exactly 1 of each (Z, Q, X, J) for each player! Extremely even.
    playerSpecials = ['Z', 'Q', 'X', 'J', 'Z', 'Q', 'X', 'J'];
    playerBlanksCount = 2; // 2 Blanks each
    playerSCount = 4; // 4 S's each
    // Remaining balanced distribution (110 tiles total -> 55 per player)
    standardLettersPool = {
      A: 12, B: 3, C: 3, D: 5, E: 15, F: 3, G: 4, H: 3, I: 12, K: 2, L: 5, M: 3,
      N: 8, O: 11, P: 3, R: 8, T: 8, U: 6, V: 3, W: 3, Y: 3
    };
  } else {
    // 19x19 Grid: Large 160 tiles total (80 per player)
    // High specials: Exactly 2 of each (Z, Q, X, J) for each player!
    playerSpecials = [
      'Z', 'Q', 'X', 'J', 'Z', 'Q', 'X', 'J',
      'Z', 'Q', 'X', 'J', 'Z', 'Q', 'X', 'J'
    ];
    playerBlanksCount = 3; // 3 Blanks each
    playerSCount = 6; // 6 S's each
    // Remaining balanced distribution (126 tiles total -> 63 per player)
    standardLettersPool = {
      A: 14, B: 4, C: 4, D: 6, E: 17, F: 4, G: 5, H: 4, I: 14, K: 2, L: 6, M: 4,
      N: 9, O: 12, P: 4, R: 9, T: 9, U: 7, V: 4, W: 4, Y: 4
    };
  }

  // Create standard letter deck
  let standards = [];
  Object.entries(standardLettersPool).forEach(([letter, qty]) => {
    for (let i = 0; i < qty; i++) {
      standards.push(letter);
    }
  });
  standards = shuffleArray(standards);

  // Split standard deck in half perfectly
  const halfLen = standards.length / 2;
  const standardsA = standards.slice(0, halfLen);
  const standardsB = standards.slice(halfLen);

  // Handle Big Specials distribution (Z, Q, X, J)
  const shuffledSpecials = shuffleArray(playerSpecials);
  const specialsHalf = shuffledSpecials.length / 2;
  const specialsA = shuffledSpecials.slice(0, specialsHalf);
  const specialsB = shuffledSpecials.slice(specialsHalf);

  // Construct Final Decks
  const createDeck = (specials, blanksCount, sCount, standardsList) => {
    const deck = [];
    // Add specials
    specials.forEach(letter => deck.push({ id: Math.random().toString(), letter, score: TILE_SCORES[letter] }));
    // Add blanks
    for (let i = 0; i < blanksCount; i++) {
      deck.push({ id: Math.random().toString(), letter: '_', score: 0 });
    }
    // Add S's
    for (let i = 0; i < sCount; i++) {
      deck.push({ id: Math.random().toString(), letter: 'S', score: 1 });
    }
    // Add Standards
    standardsList.forEach(letter => {
      deck.push({ id: Math.random().toString(), letter, score: TILE_SCORES[letter] });
    });
    return shuffleArray(deck);
  };

  return {
    deck1: createDeck(specialsA, playerBlanksCount, playerSCount, standardsA),
    deck2: createDeck(specialsB, playerBlanksCount, playerSCount, standardsB)
  };
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
  const [roomId, setRoomId] = useState('');
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

  // Lobby Pre-select State
  const [selectedGridSize, setSelectedGridSize] = useState(15);
  const [diagonalAllowed, setDiagonalAllowed] = useState(false);
  const [backwardsAllowed, setBackwardsAllowed] = useState(false);
  const [diagonalBackwardsAllowed, setDiagonalBackwardsAllowed] = useState(false);
  const [validationMode, setValidationMode] = useState('manual');
  const [joinInput, setJoinInput] = useState('');

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
        setRoomData(snapshot.data());
        setError('');
      } else {
        setError("Room has been disbanded or does not exist.");
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
    const { deck1, deck2 } = generateEvenDecks(gridSize);

    const rackSize = gridSize === 15 ? 7 : (gridSize === 17 ? 8 : 9);

    const initialRoom = {
      roomId: newRoomId,
      gridSize,
      rackSize,
      diagonalAllowed: config.diagonalAllowed,
      backwardsAllowed: config.backwardsAllowed,
      diagonalBackwardsAllowed: config.diagonalBackwardsAllowed,
      validationMode: config.validationMode, // 'strict' or 'manual'
      status: 'waiting',
      players: {
        [user.uid]: {
          uid: user.uid,
          name: username,
          score: 0,
          deck: deck1,
          rack: [],
          isReady: false
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
      createdAt: Date.now()
    };

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', newRoomId), initialRoom);
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

      if (!updatedPlayers[user.uid]) {
        if (Object.keys(updatedPlayers).length >= 2) {
          setError("Room is full.");
          return;
        }

        // Get the secondary deck for Player 2
        const { deck2 } = generateEvenDecks(data.gridSize);

        updatedPlayers[user.uid] = {
          uid: user.uid,
          name: username,
          score: 0,
          deck: deck2, // Assign Player 2 Even Deck
          rack: [],
          isReady: true
        };
        updatedOrder.push(user.uid);
      }

      // Automatically start the game since we have 2 players connected now
      const finalPlayers = { ...updatedPlayers };
      const rackSize = data.rackSize;

      // Draw initial racks for both players
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
  const selectRackTile = (tileIndex) => {
    if (exchangeMode) {
      const tile = roomData.players[user.uid].rack[tileIndex];
      if (selectedExchangeIds.includes(tile.id)) {
        setSelectedExchangeIds(selectedExchangeIds.filter(id => id !== tile.id));
      } else {
        setSelectedExchangeIds([...selectedExchangeIds, tile.id]);
      }
    } else {
      setSelectedRackTile(tileIndex);
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
      axesToScan.push(normalizeDirection(direction));
      // Scan all potential perpendicular crossing axes for each placed tile
      const possibleDirs = [
        { dr: 0, dc: 1 }, // Horizontal
        { dr: 1, dc: 0 }  // Vertical
      ];
      if (roomData.diagonalAllowed || roomData.diagonalBackwardsAllowed) {
        possibleDirs.push({ dr: 1, dc: 1 });
        possibleDirs.push({ dr: -1, dc: 1 });
      }

      coords.forEach(co => {
        possibleDirs.forEach(dir => {
          const normDir = normalizeDirection(dir);
          const normPrimary = normalizeDirection(direction);
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
            const val = wc.tile.isBlank ? 0 : TILE_SCORES[wc.tile.letter] || 0;
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
          formedWordsList.push({
            cells: wordCells,
            forwardWord: normalString,
            backwardWord: backwardString,
            score: totalWordScore
          });
        }
      }
    });

    // Bingo calculation: Did player use their entire rack?
    let bingoBonus = 0;
    const placedCount = Object.keys(tentativePlaced).length;
    if (placedCount === roomData.rackSize) {
      if (roomData.gridSize === 15) bingoBonus = 50;
      else if (roomData.gridSize === 17) bingoBonus = 60;
      else bingoBonus = 70;
    }

    return {
      valid: true,
      words: formedWordsList,
      bingoBonus,
      totalScore: formedWordsList.reduce((sum, w) => sum + w.score, 0) + bingoBonus
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

    // Handle Dictionary Validation if in Strict mode
    if (roomData.validationMode === 'strict') {
      // Validate all words synchronously against standard spellcheck or online checker
      // To provide extreme reliability, we let users "Self-Challenge" or run API validations.
      // In strict mode, we'll verify online via dictionary api.
      setError("Verifying words with online dictionary dictionaryapi.dev...");
      try {
        for (const w of scoreData.words) {
          const isValid = await checkWordOnline(w.forwardWord) ||
            (roomData.backwardsAllowed && await checkWordOnline(w.backwardWord)) ||
            (roomData.diagonalBackwardsAllowed && await checkWordOnline(w.backwardWord));
          if (!isValid) {
            setError(`"${w.forwardWord}" was not recognized as a valid English word! Play rejected.`);
            return;
          }
        }
      } catch (err) {
        setError("Word verification API timed out. Proceeding using self-judge validation.");
      }
    }

    // Success! Update Firestore room
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    const updatedBoard = { ...roomData.board };
    const myPlayer = roomData.players[user.uid];
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

    // Toggle turn
    const otherPlayerId = roomData.playerOrder.find(id => id !== user.uid) || user.uid;
    const turnPoints = scoreData.totalScore;
    const finalScore = myPlayer.score + turnPoints;

    const wordsPlacedStr = scoreData.words.map(w => {
      // Check if word was read backwards
      return `"${w.forwardWord}" (${w.score} pts)`;
    }).join(', ');

    const bingoMsg = scoreData.bingoBonus > 0 ? ` BINGO (+${scoreData.bingoBonus} pts)!` : '';
    const turnMessage = `${myPlayer.name} played ${wordsPlacedStr} for a total of ${turnPoints} pts.${bingoMsg}`;

    const updatedPlayers = { ...roomData.players };
    updatedPlayers[user.uid] = {
      ...myPlayer,
      score: finalScore,
      rack: updatedRack,
      deck: myDeck
    };

    // Prepare History action
    const historyItem = {
      id: Math.random().toString(),
      timestamp: Date.now(),
      type: 'turn',
      message: turnMessage,
      playerName: myPlayer.name,
      points: turnPoints
    };

    try {
      await updateDoc(roomRef, {
        board: updatedBoard,
        players: updatedPlayers,
        activePlayerId: otherPlayerId,
        history: [...roomData.history, historyItem],
        turnIndex: roomData.turnIndex + 1
      });

      // Clear local placements
      setTentativePlaced({});
      setSelectedRackTile(null);
      showTemporarySuccess("Awesome play! Turn successfully passed.");
    } catch (err) {
      setError("Turn execution failed: " + err.message);
    }
  };

  // Skip turn action
  const handlePassTurn = async () => {
    if (!roomData || !roomId || roomData.activePlayerId !== user.uid) return;
    setError('');

    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    const otherPlayerId = roomData.playerOrder.find(id => id !== user.uid) || user.uid;
    const myPlayer = roomData.players[user.uid];

    const historyItem = {
      id: Math.random().toString(),
      timestamp: Date.now(),
      type: 'pass',
      message: `${myPlayer.name} passed their turn.`
    };

    try {
      await updateDoc(roomRef, {
        activePlayerId: otherPlayerId,
        history: [...roomData.history, historyItem],
        turnIndex: roomData.turnIndex + 1
      });
      recallAllTentative();
      showTemporarySuccess("You passed your turn.");
    } catch (err) {
      setError("Pass action failed: " + err.message);
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

    const otherPlayerId = roomData.playerOrder.find(id => id !== user.uid) || user.uid;
    const historyItem = {
      id: Math.random().toString(),
      timestamp: Date.now(),
      type: 'exchange',
      message: `${myPlayer.name} exchanged ${tilesToReturn.length} tiles.`
    };

    const updatedPlayers = { ...roomData.players };
    updatedPlayers[user.uid] = {
      ...myPlayer,
      rack: drawnRack,
      deck: updatedDeck
    };

    try {
      await updateDoc(roomRef, {
        players: updatedPlayers,
        activePlayerId: otherPlayerId,
        history: [...roomData.history, historyItem],
        turnIndex: roomData.turnIndex + 1
      });

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
  const checkWordOnline = async (word) => {
    if (!word || word.length < 2) return false;
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`);
      return res.ok;
    } catch (e) {
      return false;
    }
  };

  const handleDictCheck = async (e) => {
    e.preventDefault();
    if (!dictWord.trim()) return;
    setDictChecking(true);
    setDictResult(null);

    const lookup = dictWord.trim().toLowerCase();
    try {
      const ok = await checkWordOnline(lookup);
      setDictResult({ word: lookup, valid: ok });
    } catch (err) {
      setDictResult({ word: lookup, valid: false, error: true });
    } finally {
      setDictChecking(false);
    }
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
                      { size: 17, label: '17x17 Grid', tiles: '130 tiles • 8 rack' },
                      { size: 19, label: '19x19 Grid', tiles: '160 tiles • 9 rack' }
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
                    validationMode
                  })}
                  className={`w-full font-black text-sm py-3 px-4 rounded-xl shadow-lg transition active:scale-[0.98] border ${
                    isDark 
                      ? 'bg-slate-350 hover:bg-slate-200 border-slate-400 text-slate-950' 
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
                        ? 'bg-slate-350 hover:bg-slate-200 border-slate-400 text-slate-950' 
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
              <div className={`w-full p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl border transition-colors ${
                isDark ? 'bg-[#15181d] border-[#21252d]' : 'bg-white border-slate-200'
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
                                <span className="leading-none" style={{ fontSize: `${cellSize * 0.55}px` }}>{permTile.letter}</span>
                                <span className="absolute font-bold leading-none" style={{ fontSize: `${cellSize * 0.24}px`, bottom: `${cellSize * 0.06}px`, right: `${cellSize * 0.06}px` }}>{permTile.score}</span>
                                {permTile.isBlank && <span className="absolute bg-[#8f3636] rounded-full" style={{ top: `${cellSize * 0.06}px`, right: `${cellSize * 0.06}px`, width: `${cellSize * 0.12}px`, height: `${cellSize * 0.12}px` }} title="Blank representation" />}
                              </div>
                            )}

                            {/* Render tentative tile */}
                            {tempTile && (
                              <div 
                                className="absolute inset-0 bg-[#e3cb98] border-2 border-amber-500 rounded-sm text-[#2d2008] flex flex-col items-center justify-center font-extrabold shadow scale-[0.96] ring-1 ring-[#4f5666]"
                                style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}
                              >
                                <span className="leading-none" style={{ fontSize: `${cellSize * 0.55}px` }}>{tempTile.letter}</span>
                                <span className="absolute font-bold leading-none" style={{ fontSize: `${cellSize * 0.24}px`, bottom: `${cellSize * 0.06}px`, right: `${cellSize * 0.06}px` }}>{tempTile.score}</span>
                                {tempTile.isBlank && <span className="absolute bg-[#8f3636] rounded-full" style={{ top: `${cellSize * 0.06}px`, right: `${cellSize * 0.06}px`, width: `${cellSize * 0.12}px`, height: `${cellSize * 0.12}px` }} />}
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

                  <div className={`flex items-center gap-2 md:gap-3 p-3 rounded-2xl border shadow-inner max-w-full overflow-x-auto transition-colors ${
                    isDark ? 'bg-[#111317] border-[#21252d]' : 'bg-slate-100 border-slate-200'
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
                            <span className="absolute top-1 left-1.5 w-2 h-2 rounded-full bg-slate-500/50" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Score Summary of Pending Play */}
                {Object.keys(tentativePlaced).length > 0 && scoreReport && (
                  <div className={`p-4 rounded-xl flex flex-col gap-2 border transition-colors ${
                    isDark ? 'bg-[#111317]/80 border-[#21252d]' : 'bg-slate-50 border-slate-200 shadow-inner'
                  }`}>
                    <div className="flex justify-between items-center text-sm">
                      <span className={`font-bold flex items-center gap-1.5 transition-colors ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                        <span>📝 Words formed:</span>
                        {scoreReport.words.map((w, i) => (
                          <span key={i} className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                            isDark ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-805'
                          }`}>
                            {w.forwardWord} ({w.score} pts)
                            {(roomData.backwardsAllowed || roomData.diagonalBackwardsAllowed) && w.forwardWord !== w.backwardWord && ` / ${w.backwardWord}`}
                          </span>
                        ))}
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
                    className={`font-bold py-2.5 px-3 rounded-xl text-xs transition border ${
                      isDark 
                        ? 'bg-slate-600 hover:bg-slate-500 text-white border-slate-500' 
                        : 'bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300'
                    }`}
                  >
                    🔀 Shuffle Rack
                  </button>

                  <button
                    type="button"
                    onFocus={(e) => e.target.blur()}
                    onClick={recallAllTentative}
                    disabled={Object.keys(tentativePlaced).length === 0}
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
                    disabled={!isMyTurn}
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
                    disabled={!isMyTurn || Object.keys(tentativePlaced).length === 0}
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

            </div>

            {/* Right Column: Game Metadata & Chat Panel (4 Cols) */}
            <div className="lg:col-span-4 space-y-6">

              {/* Scoreboard Card */}
              <div className={`border p-5 rounded-2xl shadow-xl space-y-4 transition-colors ${
                isDark ? 'bg-[#15181d] border-[#21252d]' : 'bg-white border-slate-200'
              }`}>
                <h3 className={`text-sm font-bold uppercase tracking-widest transition-colors ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Scoreboard</h3>
                <div className="space-y-3">

                  {/* Current Active Player */}
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

                  {/* Opponent Player */}
                  {opponent ? (
                    <div className={`p-4 rounded-xl border flex items-center justify-between transition ${
                      roomData.activePlayerId === opponent.uid
                        ? isDark
                          ? 'bg-slate-850 border-slate-700 ring-1 ring-slate-550/20'
                          : 'bg-amber-50 border-amber-300 ring-1 ring-amber-400/20'
                        : isDark
                          ? 'bg-[#111317] border-[#21252d]'
                          : 'bg-slate-50 border-slate-200'
                    }`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`font-extrabold transition-colors ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{opponent.name}</span>
                          <span className="text-[10px] bg-[#571c1c]/50 px-1.5 py-0.5 rounded text-[#fca5a5]">B</span>
                        </div>
                        <p className={`text-xs mt-1 transition-colors ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Remaining Tiles: {opponent.deck.length}</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-2xl font-black transition-colors ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{opponent.score}</span>
                        <span className={`text-xs block transition-colors ${isDark ? 'text-slate-550' : 'text-slate-400'}`}>pts</span>
                      </div>
                    </div>
                  ) : (
                    <div className={`border p-4 rounded-xl text-center text-xs transition-colors ${
                      isDark ? 'bg-[#111317]/50 border-dashed border-[#21252d] text-slate-500' : 'bg-slate-50 border-dashed border-slate-250 text-slate-400'
                    }`}>
                      Waiting for opponents...
                    </div>
                  )}

                </div>
              </div>

              {/* Game Settings Display Card */}
              <div className={`border p-4 rounded-2xl text-xs space-y-2 transition-colors ${
                isDark ? 'bg-[#15181d] border-[#21252d]' : 'bg-white border-slate-200'
              }`}>
                <h4 className={`font-bold uppercase tracking-widest mb-1.5 transition-colors ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Game Settings</h4>
                <div className="grid grid-cols-2 gap-2 text-slate-350">
                  <div className={`p-2 rounded transition-colors ${isDark ? 'bg-[#111317]' : 'bg-slate-50 border border-slate-200'}`}>
                    <span className="text-slate-500 block">Grid Size:</span>
                    <span className={`font-extrabold transition-colors ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>{roomData.gridSize}x{roomData.gridSize}</span>
                  </div>
                  <div className={`p-2 rounded transition-colors ${isDark ? 'bg-[#111317]' : 'bg-slate-50 border border-slate-200'}`}>
                    <span className="text-slate-500 block">Rack Size:</span>
                    <span className={`font-extrabold transition-colors ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>{roomData.rackSize} tiles</span>
                  </div>
                  <div className={`p-2 rounded transition-colors ${isDark ? 'bg-[#111317]' : 'bg-slate-50 border border-slate-200'}`}>
                    <span className="text-slate-500 block">Diagonals:</span>
                    <span className={`font-extrabold transition-colors ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>{roomData.diagonalAllowed ? 'Allowed' : 'Disabled'}</span>
                  </div>
                  <div className={`p-2 rounded transition-colors ${isDark ? 'bg-[#111317]' : 'bg-slate-50 border border-slate-200'}`}>
                    <span className="text-slate-500 block">Backwards:</span>
                    <span className={`font-extrabold transition-colors ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>{roomData.backwardsAllowed ? 'Allowed' : (roomData.diagonalBackwardsAllowed ? 'Diag Only' : 'Disabled')}</span>
                  </div>
                </div>
              </div>

              {/* In-Game Live Word Verification Helper Tool */}
              <div className={`border p-4 rounded-2xl shadow-xl space-y-3 transition-colors ${
                isDark ? 'bg-[#15181d] border-[#21252d]' : 'bg-white border-slate-200'
              }`}>
                <h3 className={`text-sm font-bold uppercase tracking-widest transition-colors ${isDark ? 'text-slate-400' : 'text-slate-505'}`}>📚 Online Dictionary Lookup</h3>
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

                    return (
                      <div key={item.id || idx} className={`${color} leading-tight`}>
                        [{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}] {item.message}
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

                {/* Messages panel */}
                <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                  {(roomData.chat || []).length === 0 ? (
                    <p className={`text-xs italic text-center my-auto transition-colors ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>No messages yet. Say hi!</p>
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
                                ? 'bg-slate-300 text-slate-950 rounded-tr-none'
                                : 'bg-slate-200 text-slate-900 border border-slate-300 rounded-tr-none'
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

                {/* Submit text */}
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
                        ? 'bg-slate-350 hover:bg-slate-200 border-slate-400 text-slate-950' 
                        : 'bg-slate-200 hover:bg-slate-300 border-slate-300 text-slate-950'
                    }`}
                  >
                    Send
                  </button>
                </form>
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
                  className="bg-gradient-to-br from-amber-100 to-amber-200 hover:from-amber-200 hover:to-amber-300 border border-amber-300 text-slate-955 font-black py-2 rounded-lg text-sm transition transform active:scale-90"
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