// ============================================================================
// PROJECT: Zetamac Race - Two-Player Arithmetic Game with Elo Rating
// FILE:    src/App.jsx
// DESCRIPTION:
// This file contains the complete React application for the Zetamac Race game.
// It integrates with Firebase Firestore for real-time multiplayer functionality,
// user authentication (anonymous), and Elo rating persistence.
//
// STRUCTURE:
// - Imports: React hooks, Firebase SDK modules.
// - Constants: Game duration, Elo factors, bot speeds.
// - FirebaseContext: React Context for sharing Firebase instances and user ID.
// - Utility Functions: `generateProblem`.
// - MessageBox Component: Custom modal for user notifications.
// - AuthWrapper Component: Handles Firebase initialization and user authentication.
// - GameLobby Component: Manages game creation (human/bot) and joining existing games.
// - GameRoom Component: Contains the core game logic, problem solving, timer,
//                       real-time score updates, and bot simulation.
// - App Component: The main entry point, managing navigation between lobby and game room.
//
// USAGE NOTES:
// - For local development, ensure your Firebase project details are filled in
//   the `localAppId` and `localFirebaseConfig` variables within `AuthWrapper`.
// - Ensure Firebase Firestore Security Rules are configured correctly for read/write access.
// - Global CSS (like `body` styles, animations) should ideally be in `index.html` or `index.css`.
// ============================================================================

// --- Module Imports ---
// React Core Imports: Essential hooks for building functional components
import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
// Firebase Core Imports: Functions for initializing Firebase and accessing services
import { initializeApp } from 'firebase/app';
// Firebase Authentication Imports: Functions for user authentication
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
// Firebase Firestore Imports: Functions for database operations
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where, addDoc, getDocs } from 'firebase/firestore';


// --- Constants ---
// Game duration in seconds
const GAME_DURATION_SECONDS = 120; // 2 minutes

// Elo Rating System Configuration
const ELO_K_FACTOR = 32; // K-factor determines how much Elo changes after a match. Higher K means bigger swings.
const STARTING_ELO = 200; // Initial Elo rating for new players.

// Bot Speed Configuration (in milliseconds per problem solved)
const BOT_1000_SPEED_MS = 3000; // Bot with 1000 Elo solves a question every 3 seconds
const BOT_2000_SPEED_MS = 1500; // Bot with 2000 Elo solves a question every 1.5 seconds


// --- React Context for Firebase and User ---
// This context provides Firebase `db` (Firestore instance), `auth` (Auth instance),
// and `userId` to any nested component without prop drilling.
const FirebaseContext = createContext(null);


// --- Utility Functions ---

/**
 * Generates a random arithmetic problem (addition, subtraction, multiplication, or division)
 * based on specified difficulty ranges.
 * - Addition/Subtraction: Numbers from 2 to 100.
 * - Multiplication: One factor from 2-12, other from 2-100.
 * - Division: Inverse of multiplication, ensuring whole number results, with divisor 2-12.
 * @returns {{problem: string, answer: number}} An object containing the problem string and its correct answer.
 */
const generateProblem = () => {
  const operations = ['+', '-', '*', '/'];
  const operation = operations[Math.floor(Math.random() * operations.length)]; // Randomly pick an operation
  let num1, num2, answer;

  switch (operation) {
    case '+':
    case '-':
      // Generate numbers for addition and subtraction between 2 and 100.
      num1 = Math.floor(Math.random() * 99) + 2; // (0-98) + 2 => 2-100
      num2 = Math.floor(Math.random() * 99) + 2; // (0-98) + 2 => 2-100
      if (num1 < num2) {
        [num1, num2] = [num2, num1]; // Swap numbers if num1 is smaller
      }
      answer = (operation === '+') ? num1 + num2 : num1 - num2; // Calculate answer
      break;

    case '*':
      // Generate factors for multiplication.
      let factor1 = Math.floor(Math.random() * 11) + 2; // Factor 1: (0-10) + 2 => 2-12
      let factor2 = Math.floor(Math.random() * 99) + 2; // Factor 2: (0-98) + 2 => 2-100
      // Randomly assign factors to num1 and num2 for varied problem appearance.
      if (Math.random() < 0.5) {
        num1 = factor1;
        num2 = factor2;
      } else {
        num1 = factor2;
        num2 = factor1;
      }
      answer = num1 * num2; // Calculate answer
      break;

    case '/':
      // Generate division problems by first creating a multiplication result
      // and then reversing it, ensuring a whole number quotient.
      let divisor = Math.floor(Math.random() * 11) + 2; // Divisor (num2) will be between 2-12
      let quotient = Math.floor(Math.random() * 99) + 2; // Quotient will be between 2-100
      num1 = divisor * quotient; // Dividend (num1) is the product
      num2 = divisor;          // Divisor (num2) is the chosen factor (2-12)
      answer = quotient;        // The answer is the calculated quotient
      break;

    default:
      // Fallback in case an unexpected operation is chosen (should not happen).
      num1 = 0;
      num2 = 0;
      answer = 0;
      break;
  }
  // Return the problem string and its numerical answer.
  return { problem: `${num1} ${operation} ${num2}`, answer };
};


// --- Custom UI Components ---

/**
 * MessageBox Component: A reusable modal dialog for displaying messages, errors, or confirmations.
 * Replaces native `alert()` and `confirm()` for better UI control.
 * @param {object} props - Component props.
 * @param {boolean} props.isOpen - Controls the visibility of the modal.
 * @param {string} props.title - The title text displayed at the top of the modal.
 * @param {string} props.message - The main content message of the modal.
 * @param {function} props.onClose - Callback function executed when the modal is closed (e.g., by clicking "Cancel" or "OK" if no `onConfirm`).
 * @param {boolean} [props.showCancel=false] - If true, a "Cancel" button is shown alongside "OK".
 * @param {function} [props.onConfirm] - Optional callback function executed when the "OK" button is clicked. If provided, `onClose` is not called on "OK".
 */
const MessageBox = ({ isOpen, title, message, onClose, showCancel = false, onConfirm }) => {
  if (!isOpen) return null; // If not open, render nothing.

  return (
    // Fixed overlay to cover the entire screen
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
      {/* Modal content box */}
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full border border-gray-300 transform transition-all scale-100 ease-out duration-300">
        <h3 className="text-2xl font-bold mb-4 text-gray-800 text-center">{title}</h3>
        <p className="text-gray-700 text-center mb-6 text-lg whitespace-pre-wrap">{message}</p>
        <div className="flex justify-center space-x-4">
          {showCancel && ( // Conditionally render Cancel button
            <button
              onClick={onClose}
              className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-opacity-75 text-lg font-semibold transition duration-200 ease-in-out shadow-md"
            >
              Cancel
            </button>
          )}
          <button
            onClick={onConfirm || onClose} // If onConfirm is provided, use it; otherwise, use onClose
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 text-lg font-semibold transition duration-200 ease-in-out shadow-lg"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};


/**
 * AuthWrapper Component: Handles Firebase initialization and manages authentication state.
 * It provides the `db`, `auth`, and `userId` instances via React Context to its children.
 * It also handles anonymous sign-in or custom token sign-in as provided by the environment.
 * @param {object} props - Component props.
 * @param {React.ReactNode} props.children - Child components that need Firebase access.
 */
const AuthWrapper = ({ children }) => {
  const [db, setDb] = useState(null); // Firestore instance
  const [auth, setAuth] = useState(null); // Firebase Auth instance
  const [userId, setUserId] = useState(null); // Current authenticated user's ID
  const [loading, setLoading] = useState(true); // Loading state for Firebase initialization
  const [error, setError] = useState(null); // Error state for initialization failures

  // useEffect hook to handle Firebase initialization and authentication on component mount
  useEffect(() => {
    try {
      // --- START LOCAL/CANVAS ENVIRONMENT CONFIGURATION ---
      // These variables are for configuring Firebase.
      // In the Canvas environment, `__app_id`, `__firebase_config`, and `__initial_auth_token`
      // are globally available.
      // For local development, we use `localAppId` and `localFirebaseConfig` placeholders.
      // You MUST replace these placeholders with your actual Firebase project details.
      const localAppId = 'zetamac-multiplayer-game-1096642033412'; // Replace with your Firebase Project ID
      const localFirebaseConfig = {
        apiKey: OPENAI_API_KEY, // Replace with your Firebase API Key
        authDomain: "zetamac-multiplayer-game.firebaseapp.com", // Replace with your Auth Domain
        projectId: "zetamac-multiplayer-game", // Replace with your Project ID
        storageBucket: "zetamac-multiplayer-game.appspot.com", // Replace with your Storage Bucket
        messagingSenderId: "1096642033412", // Replace with your Messaging Sender ID
        appId: "1:1096642033412:web:00d355f525568d981a8251", // Replace with your App ID
        measurementId: "G-KHMTENJKV4" // Replace with your Measurement ID (if Analytics is enabled)
      };

      // Determine which configuration to use based on whether Canvas environment variables are defined.
      const appId = typeof __app_id !== 'undefined' ? __app_id : localAppId;
      const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : localFirebaseConfig;
      const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
      // --- END LOCAL/CANVAS ENVIRONMENT CONFIGURATION ---

      // Log the configuration being used to the console for debugging purposes.
      console.log("Firebase Init: Using appId:", appId);
      console.log("Firebase Init: Using firebaseConfig:", firebaseConfig);

      // Validate that the Firebase config is complete before attempting initialization.
      if (!firebaseConfig || Object.keys(firebaseConfig).length === 0 || !firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId) {
        console.error("Firebase config is missing or incomplete. Required fields: apiKey, authDomain, projectId.");
        setError("Firebase configuration is missing or incomplete. Please check your config in src/App.jsx and Firebase Console.");
        setLoading(false);
        return; // Exit if config is invalid.
      }

      // Initialize the Firebase App with the provided configuration.
      const app = initializeApp(firebaseConfig);
      const authInstance = getAuth(app); // Get the Auth service instance.
      const dbInstance = getFirestore(app); // Get the Firestore service instance.

      // Store the initialized instances in state.
      setAuth(authInstance);
      setDb(dbInstance);

      // Set up an authentication state change listener. This runs whenever user's auth status changes.
      const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
        if (user) {
          // If a user is signed in, set their UID and ensure their profile exists in Firestore.
          setUserId(user.uid);
          console.log("Firebase Auth: User signed in with UID:", user.uid);

          try {
            // Reference to the user's private profile document.
            const userProfileRef = doc(dbInstance, `artifacts/${appId}/users/${user.uid}/profile`, user.uid);
            const userProfileSnap = await getDoc(userProfileRef);

            // If the user profile doesn't exist, create it with the starting Elo.
            if (!userProfileSnap.exists()) {
              await setDoc(userProfileRef, { elo: STARTING_ELO, lastUpdated: Date.now() });
              console.log("User profile created for UID:", user.uid);
            }
          } catch (profileError) {
            console.error("Error ensuring user profile exists:", profileError);
            // Log the error but do not block app loading.
          } finally {
            setLoading(false); // Authentication process is complete, stop loading.
          }
        } else {
          // If no user is signed in, attempt to sign in.
          try {
            if (initialAuthToken) {
              // If a custom auth token is provided (from Canvas environment), use it.
              await signInWithCustomToken(authInstance, initialAuthToken);
              console.log("Firebase Auth: Signed in with custom token.");
            } else {
              // Otherwise, sign in anonymously for the game to function without explicit login.
              await signInAnonymously(authInstance);
              console.log("Firebase Auth: Signed in anonymously.");
            }
          } catch (e) {
            // Handle cases where initial sign-in (custom token) fails.
            console.warn("Firebase Auth: Custom token sign-in failed, attempting anonymous sign-in:", e);
            try {
              await signInAnonymously(authInstance); // Fallback to anonymous sign-in.
              console.log("Firebase Auth: Fallback to anonymous sign-in successful.");
            } catch (anonError) {
              // Handle if anonymous sign-in also fails.
              console.error("Firebase Auth Error: Anonymous sign-in also failed:", anonError);
              setError(`Authentication failed: ${anonError.message}`); // Set a visible error.
            }
          } finally {
            // Note: setLoading(false) is handled in the `if (user)` block.
          }
        }
      });

      // Cleanup function: Unsubscribe from auth state changes when component unmounts.
      return () => unsubscribe();
    } catch (e) {
      // Catch any errors during the initial Firebase app initialization.
      console.error("Error initializing Firebase:", e);
      setError(`Failed to initialize Firebase: ${e.message}`);
      setLoading(false); // Stop loading on error.
    }
  }, []); // Empty dependency array ensures this effect runs only once on mount.

  // Render loading state while Firebase is initializing or authenticating.
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-gray-100">
        <p className="text-2xl font-semibold animate-pulse">Loading Firebase...</p>
      </div>
    );
  }

  // Render error state if Firebase initialization or authentication failed.
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-red-900 text-white p-4">
        <p className="text-2xl font-bold mb-4">Error</p>
        <p className="text-lg text-center">{error}</p>
        <p className="mt-4 text-sm">Please check the console for more details.</p>
      </div>
    );
  }

  // Render authenticating state if userId is not yet available after loading is false.
  if (!userId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-gray-100">
        <p className="text-2xl font-semibold animate-pulse">Authenticating...</p>
      </div>
    );
  }

  // If Firebase is initialized and user is authenticated, provide context to children.
  return (
    <FirebaseContext.Provider value={{ db, auth, userId }}>
      {children}
    </FirebaseContext.Provider>
  );
};


/**
 * GameLobby Component: Allows players to create new games (Vs Human or Vs Bots)
 * or join existing waiting games.
 * @param {object} props - Component props.
 * @param {function} props.onJoinGame - Callback to transition to the GameRoom with a specific game ID.
 */
const GameLobby = ({ onJoinGame }) => {
  const { db, userId } = useContext(FirebaseContext); // Access Firebase instances and user ID from context
  const [activeGames, setActiveGames] = useState([]); // State to store list of active 'waiting' games
  const [messageBox, setMessageBox] = useState({ isOpen: false, title: '', message: '', onConfirm: null }); // State for the custom message box
  const [gameIdToJoin, setGameIdToJoin] = useState(''); // State for manually entering a game ID to join

  // Firestore collection reference for public game data
  const appId = typeof __app_id !== 'undefined' ? __app_id : 'zetamac-multiplayer-game';
  const gamesCollectionRef = collection(db, `artifacts/${appId}/public/data/games`);

  // useEffect hook to listen for real-time updates to active (waiting) games.
  useEffect(() => {
    if (!db || !userId) return;

    // Create a query to get games with 'waiting' status.
    const q = query(gamesCollectionRef, where('status', '==', 'waiting'));
    // Subscribe to real-time updates using onSnapshot.
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Map snapshot documents to game objects.
      const games = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActiveGames(games); // Update state with active games.
    }, (error) => {
      // Handle errors during snapshot listening.
      console.error("Error fetching active games:", error);
      setMessageBox({ isOpen: true, title: 'Error', message: 'Failed to load active games.' });
    });

    // Cleanup function: Unsubscribe from snapshot listener when component unmounts.
    return () => unsubscribe();
  }, [db, userId]); // Dependencies: Re-run effect if `db` or `userId` changes.

  /**
   * Handles creating a new game, either against a human or a bot.
   * Updates Firestore and transitions to GameRoom.
   * @param {string} opponentType - 'human', 'bot-1000', or 'bot-2000'.
   */
  const createGame = async (opponentType = 'human') => {
    if (!db || !userId) {
      setMessageBox({ isOpen: true, title: 'Error', message: 'Firebase not ready. Please try again.' });
      return;
    }

    try {
      // Fetch player 1's current Elo rating, defaulting to STARTING_ELO if new.
      const userProfileRef = doc(db, `artifacts/${appId}/users/${userId}/profile`, userId);
      const userProfileSnap = await getDoc(userProfileRef);
      const player1Elo = userProfileSnap.exists() ? userProfileSnap.data().elo : STARTING_ELO;

      let player2InitialElo = STARTING_ELO;
      let player2Id = null; // Default to null for human opponent
      // Set bot-specific Elo and ID if playing against a bot.
      if (opponentType === 'bot-1000') {
        player2Id = 'BOT-1000-' + crypto.randomUUID(); // Assign a unique ID for the bot.
        player2InitialElo = 1000; // Set bot's starting Elo.
      } else if (opponentType === 'bot-2000') {
        player2Id = 'BOT-2000-' + crypto.randomUUID(); // Assign a unique ID for the bot.
        player2InitialElo = 2000; // Set bot's starting Elo.
      }

      // Add a new game document to the 'games' collection in Firestore.
      const newGameRef = await addDoc(gamesCollectionRef, {
        player1Id: userId,
        player1Score: 0,
        player1EloAtStart: player1Elo,
        player2Id: player2Id, // Will be null for human, or bot ID for bot game.
        player2Score: 0,
        player2EloAtStart: player2InitialElo,
        status: opponentType === 'human' ? 'waiting' : 'ready', // Bot games start directly in 'ready' state.
        opponentType: opponentType, // Store the type of opponent.
        currentProblem: null, // Initial problem will be generated when game starts.
        currentAnswer: null, // Initial answer will be generated when game starts.
        startTime: null, // Game start time.
        winnerId: null, // Winner ID (null until game ends).
        eloCalculated: false, // Flag to prevent multiple Elo calculations.
        createdAt: Date.now(), // Timestamp of game creation.
      });

      // Immediately transition to the GameRoom using the newly created game's ID.
      onJoinGame(newGameRef.id);

    } catch (e) {
      // Handle errors during game creation.
      console.error("Error creating game:", e);
      setMessageBox({ isOpen: true, title: 'Error', message: `Failed to create game: ${e.message}` });
    }
  };

  /**
   * Handles joining an existing game by its ID.
   * Updates Firestore to add player 2 and transitions to GameRoom.
   * @param {string} gameId - The ID of the game to join.
   */
  const joinGame = async (gameId) => {
    if (!db || !userId) {
      setMessageBox({ isOpen: true, title: 'Error', message: 'Firebase not ready. Please try again.' });
      return;
    }
    if (!gameId) {
      setMessageBox({ isOpen: true, title: 'Error', message: 'Please enter a Game ID.' });
      return;
    }

    try {
      // Get a reference to the game document.
      const gameRef = doc(gamesCollectionRef, gameId);
      // Fetch the current state of the game document.
      const gameSnap = await getDoc(gameRef);

      if (!gameSnap.exists()) {
        setMessageBox({ isOpen: true, title: 'Error', message: 'Game not found.' });
        return;
      }

      const gameData = gameSnap.data(); // Get game data.

      // Prevent joining if already Player 1 in this game.
      if (gameData.player1Id === userId) {
        onJoinGame(gameId); // Still transition to GameRoom if they are Player 1.
        return;
      }

      // Prevent joining if game already has a Player 2 (and it's not the current user).
      if (gameData.player2Id && gameData.player2Id !== userId) {
        setMessageBox({ isOpen: true, title: 'Game Full', message: 'This game already has two players.' });
        return;
      }

      // Prevent joining if game is already in progress or finished (should only join 'waiting' games).
      if (gameData.status !== 'waiting') {
        setMessageBox({ isOpen: true, title: 'Error', message: 'This game is already in progress or finished.' });
        return;
      }

      // Fetch player 2's current Elo rating, defaulting to STARTING_ELO if new.
      const userProfileRef = doc(db, `artifacts/${appId}/users/${userId}/profile`, userId);
      const userProfileSnap = await getDoc(userProfileRef);
      const player2Elo = userProfileSnap.exists() ? userProfileSnap.data().elo : STARTING_ELO;

      // Update the game document to add Player 2 and change status to 'ready'.
      await updateDoc(gameRef, {
        player2Id: userId,
        player2EloAtStart: player2Elo,
        status: 'ready', // Game is now ready to be started by Player 1.
      });

      onJoinGame(gameId); // Immediately transition to GameRoom.
    } catch (e) {
      // Handle errors during joining a game.
      console.error("Error joining game:", e);
      setMessageBox({ isOpen: true, title: 'Error', message: `Failed to join game: ${e.message}` });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-700 text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-5xl font-extrabold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600 animate-fade-in-down">
        Zetamac Race
      </h1>

      <p className="text-lg mb-6 text-gray-300 text-center">Your User ID: <span className="font-mono bg-gray-800 px-3 py-1 rounded-md text-sm">{userId}</span></p>

      {/* Create New Game section */}
      <div className="bg-gray-800 p-8 rounded-2xl shadow-xl border border-gray-700 max-w-md w-full mb-8 transform transition-all hover:scale-105 duration-300">
        <h2 className="text-3xl font-bold mb-6 text-center text-gray-100">Create New Game</h2>
        <button
          onClick={() => createGame('human')}
          className="w-full bg-green-600 text-white py-4 rounded-xl text-2xl font-bold shadow-lg hover:bg-green-700 transform hover:scale-105 transition duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-green-500 focus:ring-opacity-75 mb-4"
        >
          Create Game (Vs Human)
        </button>
        <button
          onClick={() => createGame('bot-1000')}
          className="w-full bg-indigo-600 text-white py-4 rounded-xl text-2xl font-bold shadow-lg hover:bg-indigo-700 transform hover:scale-105 transition duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-indigo-500 focus:ring-opacity-75 mb-4"
        >
          Create Game (Vs Bot 1000 Elo)
        </button>
        <button
          onClick={() => createGame('bot-2000')}
          className="w-full bg-purple-600 text-white py-4 rounded-xl text-2xl font-bold shadow-lg hover:bg-purple-700 transform hover:scale-105 transition duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-purple-500 focus:ring-opacity-75"
        >
          Create Game (Vs Bot 2000 Elo)
        </button>
      </div>

      {/* Join Game by ID section 
      <div className="bg-gray-800 p-8 rounded-2xl shadow-xl border border-gray-700 max-w-md w-full mb-8 transform transition-all hover:scale-105 duration-300">
        <h2 className="text-3xl font-bold mb-6 text-center text-gray-100">Join Game by ID</h2>
        <input
          type="text"
          placeholder="Enter Game ID"
          value={gameIdToJoin}
          onChange={(e) => setGameIdToJoin(e.target.value)}
          className="w-full p-4 mb-4 bg-gray-700 text-white border border-gray-600 rounded-xl text-xl placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
        <button
          onClick={() => joinGame(gameIdToJoin)}
          className="w-full bg-blue-600 text-white py-4 rounded-xl text-2xl font-bold shadow-lg hover:bg-blue-700 transform hover:scale-105 transition duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-blue-500 focus:ring-opacity-75"
        >
          Join Game
        </button>
      </div> */}

      {/* Active Games List section */}
      <div className="bg-gray-800 p-8 rounded-2xl shadow-xl border border-gray-700 max-w-2xl w-full">
        <h2 className="text-3xl font-bold mb-6 text-center text-gray-100">Active Games (Waiting)</h2>
        {activeGames.length === 0 ? (
          <p className="text-gray-400 text-center text-lg">No active games found. Create one!</p>
        ) : (
          <ul className="space-y-4">
            {activeGames.map((game) => (
              <li
                key={game.id}
                className="bg-gray-700 p-5 rounded-xl flex flex-col sm:flex-row justify-between items-center shadow-md border border-gray-600 transform transition-transform hover:scale-102 duration-200"
              >
                <div className="text-xl font-semibold mb-2 sm:mb-0 text-gray-200">
                  Game ID: <span className="font-mono text-blue-300">{game.id}</span>
                  <p className="text-base text-gray-400 mt-1">Player 1: {game.player1Id.substring(0, 8)}...</p>
                </div>
                <button
                  onClick={() => joinGame(game.id)}
                  className="bg-purple-600 text-white px-6 py-3 rounded-lg text-lg font-bold hover:bg-purple-700 transform hover:scale-105 transition duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-purple-500 focus:ring-opacity-75"
                >
                  Join
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Message Box UI */}
      <MessageBox
        isOpen={messageBox.isOpen}
        title={messageBox.title}
        message={messageBox.message}
        onClose={() => setMessageBox({ ...messageBox, isOpen: false })}
        onConfirm={messageBox.onConfirm}
      />
    </div>
  );
};


/**
 * GameRoom Component: The main game interface where arithmetic problems are solved,
 * scores are tracked, and the timer runs. Handles human-vs-human and human-vs-bot logic.
 * @param {object} props - Component props.
 * @param {string} props.gameId - The ID of the current game.
 * @param {function} props.onGameEnd - Callback to return to the lobby after the game ends.
 */
const GameRoom = ({ gameId, onGameEnd }) => {
  // Access Firebase instances and user ID from context.
  const { db, userId } = useContext(FirebaseContext);
  
  // State variables for game data, user input, feedback, timer, and game activity.
  const [game, setGame] = useState(null);
  const [isGameActive, setIsGameActive] = useState(false);
  const [timer, setTimer] = useState(GAME_DURATION_SECONDS);
  const [playerInput, setPlayerInput] = useState('');
  const [feedback, setFeedback] = useState('');
  const [messageBox, setMessageBox] = useState({ isOpen: false });
  const [resultsShown, setResultsShown] = useState(false); // Prevents modal from re-opening
  
  // Refs for DOM elements and intervals
  const inputRef = useRef(null);
  const botIntervalRef = useRef(null);

  const appId = typeof __app_id !== 'undefined' ? __app_id : 'zetamac-multiplayer-game';
  const gameRef = doc(db, `artifacts/${appId}/public/data/games`, gameId);

  // --- REFACTORED useEffect HOOKS for stability ---

  // Effect 1: Data Subscription. Only responsible for fetching and setting the 'game' state.
  useEffect(() => {
    if (!db || !gameId) return;
    
    const unsubscribe = onSnapshot(gameRef, (docSnap) => {
      if (docSnap.exists()) {
        setGame(docSnap.data());
      } else {
        // If the game document is deleted, show a message and trigger return to lobby
        setMessageBox({ isOpen: true, title: 'Game Ended', message: 'The game you were in no longer exists.', onConfirm: onGameEnd });
      }
    }, (error) => {
      console.error("GameRoom listener error:", error);
      setMessageBox({ isOpen: true, title: 'Connection Error', message: `Disconnected from game.`, onConfirm: onGameEnd });
    });
    
    return () => unsubscribe();
  }, [db, gameId, onGameEnd]);

  // Effect 2: Game Logic. Reacts to changes in the 'game' object from Firestore.
  useEffect(() => {
    if (!game) return;

    // --- Handle 'playing' state ---
    if (game.status === 'playing') {
      if (!isGameActive) setIsGameActive(true);
      const elapsed = Math.floor((Date.now() - game.startTime) / 1000);
      setTimer(Math.max(0, GAME_DURATION_SECONDS - elapsed));

      // Bot logic
      if (game.opponentType?.startsWith('bot') && !botIntervalRef.current) {
        const botSpeed = game.opponentType === 'bot-1000' ? BOT_1000_SPEED_MS : BOT_2000_SPEED_MS;
        botIntervalRef.current = setInterval(async () => {
          const currentDocSnap = await getDoc(gameRef);
          if (currentDocSnap.exists() && currentDocSnap.data().status === 'playing') {
            await updateDoc(gameRef, { player2Score: (currentDocSnap.data().player2Score || 0) + 1 });
          }
        }, botSpeed);
      }
    } 
    // --- Handle 'finished' state ---
    else if (game.status === 'finished') {
      if (isGameActive) setIsGameActive(false);
      
      if (botIntervalRef.current) {
        clearInterval(botIntervalRef.current);
        botIntervalRef.current = null;
      }
      
      // Only show results modal ONCE
      if (!resultsShown) {
        showGameResults(game);
        setResultsShown(true);
      }
    }

    // Cleanup for bot interval when component unmounts or game object changes
    return () => {
      if (botIntervalRef.current) {
        clearInterval(botIntervalRef.current);
        botIntervalRef.current = null;
      }
    };
  }, [game]); // This effect runs whenever the 'game' object from Firestore changes.

  // Effect 3: Countdown Timer. Reacts only to game activity and time changes.
  useEffect(() => {
    let timerInterval;
    if (isGameActive && timer > 0) {
      timerInterval = setInterval(() => {
        setTimer(prev => prev - 1);
      }, 1000);
    } else if (isGameActive && timer === 0) {
      // Timer ran out, end the game.
      endGame();
    }
    return () => clearInterval(timerInterval);
  }, [isGameActive, timer]);

  // Effect 4: Auto-focus input field
  useEffect(() => {
    if (isGameActive && game?.status === 'playing') {
      inputRef.current?.focus();
    }
  }, [isGameActive, game?.status, game?.currentProblem]);


  const startGame = async () => {
    if (!game || game.player1Id !== userId || game.status !== 'ready') return;
    try {
      const { problem, answer } = generateProblem();
      await updateDoc(gameRef, {
        status: 'playing',
        startTime: Date.now(),
        currentProblem: problem,
        currentAnswer: answer,
      });
    } catch (e) {
      console.error("Error starting game:", e);
    }
  };

  const handleInputChange = async (e) => {
    const value = e.target.value;
    setPlayerInput(value);
    if (!game || game.status !== 'playing') return;

    const expectedAnswerString = String(game.currentAnswer);
    if (value.length === expectedAnswerString.length) {
      if (value === expectedAnswerString) {
        setFeedback('Correct!');
        setPlayerInput('');
        try {
          const newScore = (userId === game.player1Id ? game.player1Score : game.player2Score) + 1;
          const { problem: nextProblem, answer: nextAnswer } = generateProblem();
          await updateDoc(gameRef, {
            currentProblem: nextProblem,
            currentAnswer: nextAnswer,
            [userId === game.player1Id ? 'player1Score' : 'player2Score']: newScore,
          });
        } catch (e) {
          console.error("Error updating on correct answer:", e);
        }
      } else {
        setFeedback('Incorrect!');
      }
      setTimeout(() => setFeedback(''), 500);
    }
  };

  const endGame = async () => {
    // To prevent multiple triggers, fetch the latest doc and only update if it's still 'playing'
    const currentDoc = await getDoc(gameRef);
    if (currentDoc.exists() && currentDoc.data().status === 'playing') {
      try {
        const gameData = currentDoc.data();
        let winnerId = null;
        if (gameData.player1Score > gameData.player2Score) {
          winnerId = gameData.player1Id;
        } else if (gameData.player2Score > gameData.player1Score) {
          winnerId = gameData.player2Id;
        }
        await updateDoc(gameRef, { status: 'finished', winnerId });
      } catch (e) {
        console.error("Error ending game:", e);
      }
    }
  };

  const showGameResults = (finalGameData) => {
    const isPlayer1 = finalGameData.player1Id === userId;
    let resultMessage = `Game Over!\n\nYour Score: ${isPlayer1 ? finalGameData.player1Score : finalGameData.player2Score}\nOpponent's Score: ${isPlayer1 ? finalGameData.player2Score : finalGameData.player1Score}\n\n`;

    if (finalGameData.winnerId === userId) {
      resultMessage += "You Win!\n";
    } else if (finalGameData.winnerId === null) {
      resultMessage += "It's a Draw!\n";
    } else {
      resultMessage += "You Lose!\n";
    }

    {/* // Check if the cloud function has finished its calculation
    if (finalGameData.eloCalculated) {
      const yourOldElo = isPlayer1 ? finalGameData.player1EloAtStart : finalGameData.player2EloAtStart;
      const yourNewElo = isPlayer1 ? finalGameData.player1NewElo : finalGameData.player2NewElo;
      const eloChange = yourNewElo - yourOldElo;
      resultMessage += `\nYour Elo: ${yourOldElo} -> ${yourNewElo} (${eloChange >= 0 ? '+' : ''}${eloChange})`;
    } else {
      resultMessage += "\nCalculating Elo results...";
    } */}

    setMessageBox({ isOpen: true, title: 'Game Over!', message: resultMessage, onConfirm: onGameEnd });
  };

  if (!game) {
    return <div className="flex items-center justify-center min-h-screen bg-gray-900 text-gray-100"><p className="text-2xl font-semibold animate-pulse">Loading Game Room...</p></div>;
  }

  const isPlayer1 = userId === game.player1Id;
  const currentPlayerScore = isPlayer1 ? game.player1Score : game.player2Score;
  const opponentPlayerScore = isPlayer1 ? game.player2Score : game.player1Score;
  const opponentPlayerId = isPlayer1 ? game.player2Id : game.player1Id;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-700 text-white flex flex-col items-center justify-center p-4 font-inter">
      <div className="bg-gray-800 p-8 rounded-2xl shadow-xl border border-gray-700 max-w-2xl w-full">
        <h2 className="text-4xl font-bold mb-6 text-center text-gray-100">Zetamac Race</h2>
        <div className="flex justify-around items-center mb-6 text-xl">
          <div className="text-center w-1/3">
            <p className="text-gray-400">You</p>
            <p className="text-4xl font-extrabold text-green-400 mt-2">{currentPlayerScore}</p>
          </div>
          <div className="text-center w-1/3">
            <p className="text-gray-400">Time Left</p>
            <p className="text-5xl font-extrabold text-yellow-400 mt-2">{timer}</p>
          </div>
          <div className="text-center w-1/3">
            <p className="text-gray-400">Opponent</p>
            <p className="text-4xl font-extrabold text-red-400 mt-2">{opponentPlayerScore}</p>
          </div>
        </div>

        {game.status === 'playing' && (
          <div className="text-center mb-8 relative">
            <p className="text-6xl font-bold text-white mb-4">{game.currentProblem}</p>
            <input ref={inputRef} type="number" value={playerInput} onChange={handleInputChange} className="w-2/3 p-4 text-center bg-gray-700 text-white border border-gray-600 rounded-lg text-4xl" placeholder="Answer" autoComplete="off" />
            {feedback && <p className={`absolute -bottom-8 left-1/2 -translate-x-1/2 text-2xl font-semibold ${feedback.startsWith('Correct') ? 'text-green-400' : 'text-red-400'}`}>{feedback}</p>}
          </div>
        )}
        {game.status === 'waiting' && <p className="text-center text-2xl text-gray-400">Waiting for an opponent...</p>}
        {game.status === 'ready' && isPlayer1 && (
          <div className="text-center">
            <p className="text-2xl text-gray-400 mb-4">Opponent has joined. Ready to start?</p>
            <button onClick={startGame} className="bg-green-600 text-white py-4 px-8 rounded-xl text-2xl font-bold shadow-lg hover:bg-green-700 transition">Start Game</button>
          </div>
        )}
        {game.status === 'ready' && !isPlayer1 && <p className="text-center text-2xl text-gray-400">Waiting for Player 1 to start...</p>}
        {game.status === 'finished' && <p className="text-center text-2xl text-gray-300 mb-4">Game has ended. Calculating results...</p>}
      </div>
      <MessageBox {...messageBox} onClose={messageBox.onConfirm || (() => setMessageBox({ isOpen: false }))} onConfirm={messageBox.onConfirm} />
    </div>
  );
};

/**
 * Main App component that manages game flow between Lobby and GameRoom.
 */
const App = () => {
  const [currentGameId, setCurrentGameId] = useState(null); // State to hold the ID of the active game.

  // Callback function to transition to the GameRoom.
  const handleJoinGame = (gameId) => {
    setCurrentGameId(gameId);
  };

  // Callback function to return to the lobby after a game ends.
  const handleGameEnd = () => {
    setCurrentGameId(null);
  };

  // useEffect hook to attempt to lock screen orientation to landscape.
  // This is a progressive enhancement and may not work in all browsers/devices.
  useEffect(() => {
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape')
        .then(() => console.log('Screen locked to landscape.'))
        .catch((err) => console.warn('Could not lock screen orientation:', err));
    } else if (window.screen.orientation && window.screen.orientation.lock) {
      window.screen.orientation.lock('landscape')
        .then(() => console.log('Screen locked to landscape (window.screen).'))
        .catch((err) => console.warn('Could not lock screen orientation (window.screen):', err));
    } else {
      console.warn('Screen orientation API not supported or available.');
    }
    // Cleanup function: Can optionally unlock orientation when component unmounts.
    return () => {
      if (screen.orientation && screen.orientation.unlock) {
        // screen.orientation.unlock(); // Uncomment if you want to unlock when component unmounts
      }
    };
  }, []); // Empty dependency array ensures this runs once on mount.

  // Conditional rendering: Show GameRoom if currentGameId is set, otherwise show GameLobby.
  return (
    <AuthWrapper>
      {/* The style tag below contains global CSS. For local development,
          its content should ideally be moved to `index.html`'s `<head>` or a global CSS file (`index.css`). */}
      <style>
        {`
          /* Base styling for the body */
          body {
            font-family: 'Inter', sans-serif;
            margin: 0;
            padding: 0;
            overflow-x: hidden; /* Prevent horizontal scroll */
            min-height: 100vh; /* Ensure body takes full viewport height */
            min-width: 100vw;  /* Ensure body takes full viewport width */
            display: flex; /* Enable flexbox */
            flex-direction: row; /* Default to row (horizontal) */
            justify-content: center; /* Center horizontally */
            align-items: center; /* Center vertically */
            background: linear-gradient(to bottom right, #1a202c, #2d3748); /* Background gradient */
            color: #ffffff; /* Default text color */
          }

          /* Media query for very small screens (portrait mobile) - stack vertically if too narrow */
          @media (max-width: 768px) and (orientation: portrait) {
            body {
              flex-direction: column; /* Revert to column for portrait on small screens */
            }
          }

          /* General styling for main content containers (the dark gray boxes) */
          .game-container-card {
            max-width: 95vw; /* Allow wider usage of horizontal space */
            max-height: 95vh; /* Limit height */
            margin: 1rem; /* Add some margin around the card */
            padding: 2rem; /* Add padding inside */
            border-radius: 1.5rem; /* More rounded corners for cards */
            background-color: #2d3748; /* Darker background for card */
            box-shadow: 0 10px 20px rgba(0, 0, 0, 0.3); /* Stronger shadow */
            display: flex;
            flex-direction: column; /* Content inside card stacks vertically */
            align-items: center;
            justify-content: center;
          }

          /* Specific adjustments for elements to promote horizontal layout within cards */
          .game-info-row { /* Applied to div containing Your ID, Time Left, Opponent ID */
            display: flex;
            justify-content: space-around;
            width: 100%; /* Take full width of parent */
            flex-wrap: wrap; /* Allow wrapping on small screens */
            gap: 1rem; /* Space between items */
          }
          .game-info-row > div {
            flex-shrink: 0; /* Prevent shrinking */
            min-width: 120px; /* Ensure minimum width for info blocks */
          }


          /* Custom keyframe for fade-in-down animation */
          @keyframes fade-in-down {
            from {
              opacity: 0;
              transform: translateY(-20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          .animate-fade-in-down {
            animation: fade-in-down 1s ease-out forwards;
          }

          /* Ensure all elements have rounded corners for consistency */
          * {
            border-radius: 0.5rem; /* Apply to all elements */
          }

          /* Specific adjustments for buttons and inputs for a more rounded feel */
          button, input[type="text"], input[type="number"] {
            border-radius: 0.75rem; /* Slightly more rounded for interactive elements */
          }

          /* For shadow and hover effects consistency */
          .shadow-lg {
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
          }
          .hover\\:scale-105:hover {
            transform: scale(1.05);
          }
          .transition-transform {
            transition-property: transform;
            transition-duration: 300ms;
            transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
          }
        `}
      </style>
      {currentGameId ? (
        <GameRoom gameId={currentGameId} onGameEnd={handleGameEnd} />
      ) : (
        <GameLobby onJoinGame={handleJoinGame} />
      )}
    </AuthWrapper>
  );
};

export default App;

