// functions/index.js

// ✅ Use the correct trigger function from v2 Firestore
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// --- Utility Functions ---
const getExpectedScore = (eloA, eloB) => {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
};

const calculateNewElo = (eloA, eloB, scoreA, kFactor) => {
  const expectedScoreA = getExpectedScore(eloA, eloB);
  const newEloA = eloA + kFactor * (scoreA - expectedScoreA);
  const newEloB = eloB + kFactor * ((1 - scoreA) - (1 - expectedScoreA));
  return { newEloA: Math.round(newEloA), newEloB: Math.round(newEloB) };
};

// --- Main Cloud Function ---
exports.calculateEloOnGameEnd = onDocumentUpdated(
  {
    document: "artifacts/{appId}/public/data/games/{gameId}",
  },
  async (event) => {
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    if (
      beforeData.status === "finished" ||
      afterData.status !== "finished" ||
      afterData.eloCalculated
    ) {
      logger.log(
        "Function exiting: Not a newly finished game or Elo already calculated."
      );
      return;
    }

    const { gameId, appId } = event.params;
    logger.log(`Game ${gameId} finished. Calculating Elo.`);

    const {
      player1Id,
      player2Id,
      player1Score,
      player2Score,
      opponentType,
    } = afterData;

    const STARTING_ELO = 200;
    const ELO_K_FACTOR = 32;

    try {
      const player1ProfileRef = db.doc(
        `artifacts/${appId}/users/${player1Id}/profile/${player1Id}`
      );

      const player2ProfileRef =
        opponentType === "human"
          ? db.doc(
              `artifacts/${appId}/users/${player2Id}/profile/${player2Id}`
            )
          : null;

      const player1Snap = await player1ProfileRef.get();
      let player1CurrentElo = player1Snap.exists
        ? player1Snap.data().elo
        : STARTING_ELO;
      let player2CurrentElo = STARTING_ELO;

      if (opponentType.startsWith("bot")) {
        player2CurrentElo =
          opponentType === "bot-1000" ? 1000 : 2000;
      } else if (player2ProfileRef) {
        const player2Snap = await player2ProfileRef.get();
        player2CurrentElo = player2Snap.exists
          ? player2Snap.data().elo
          : STARTING_ELO;
      }

      let scoreA = 0.5;
      if (player1Score > player2Score) scoreA = 1;
      if (player2Score > player1Score) scoreA = 0;

      const { newEloA, newEloB } = calculateNewElo(
        player1CurrentElo,
        player2CurrentElo,
        scoreA,
        ELO_K_FACTOR
      );

      const batch = db.batch();
      batch.set(
        player1ProfileRef,
        { elo: newEloA, lastUpdated: Date.now() },
        { merge: true }
      );

      if (opponentType === "human" && player2ProfileRef) {
        batch.set(
          player2ProfileRef,
          { elo: newEloB, lastUpdated: Date.now() },
          { merge: true }
        );
      }

      const gameRef = event.data.after.ref;
      batch.update(gameRef, {
        eloCalculated: true,
        player1NewElo: newEloA,
        player2NewElo: newEloB,
      });

      await batch.commit();
      logger.log(`Elo successfully calculated and saved for game ${gameId}.`);
    } catch (error) {
      logger.error("Error calculating Elo:", error);
    }
  }
);
